import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { Events } from 'discord.js';
import {
    getVoiceConnection,
    joinVoiceChannel,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus,
} from '@discordjs/voice';

const LOGIN_TIMEOUT_MS = 60_000;
const JOIN_TIMEOUT_MS = 15_000;
const RECOVERY_TIMEOUT_MS = 5_000;
const STABLE_CONNECTION_MS = 30_000;
const CLIENT_CLOSE_TIMEOUT_MS = 8_000;
const MAX_TIMER_MS = 2_147_483_647;

function startAccount(account, reconnect, { createClient, connectVoice, log, finished }) {
    const { settings, label } = account;
    const { guildId, channelId } = settings;
    const group = randomUUID();
    let client;
    let connection;
    let timer;
    let closed = false;
    let hasJoined = false;
    let retries = 0;

    function schedule(callback, delay) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            if (!closed) callback();
        }, delay);
    }

    function releaseVoice(sendLeave = true) {
        clearTimeout(timer);
        timer = undefined;
        const previous = connection ?? getVoiceConnection(guildId, group);
        connection = undefined;
        hasJoined = false;
        if (!previous || previous.state.status === VoiceConnectionStatus.Destroyed) return;

        try {
            previous.destroy(sendLeave);
        } catch (error) {
            log(label, 'Could not close the voice connection.', error);
            if (sendLeave && previous.state.status !== VoiceConnectionStatus.Destroyed) {
                try {
                    previous.destroy(false);
                } catch (cleanupError) {
                    log(label, 'Could not release the voice adapter.', cleanupError);
                }
            }
        }
    }

    function finish(status, message, { failed = true, sendLeave = true } = {}) {
        if (closed) return;
        closed = true;
        account.status = status;
        if (message) log(label, message);
        releaseVoice(sendLeave);
        function closeFailed(error) {
            log(label, 'Could not close the Discord client.', error);
            finished(true);
        }
        try {
            const closing = client?.destroy();
            if (closing) {
                let completed = false;
                function complete(callback) {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timeout);
                    callback();
                }
                const timeout = setTimeout(() => {
                    complete(() => closeFailed(new Error('Close timed out.')));
                }, CLIENT_CLOSE_TIMEOUT_MS);
                closing.then(
                    () => complete(() => finished(failed)),
                    error => complete(() => closeFailed(error)),
                );
                return;
            }
        } catch (error) {
            closeFailed(error);
            return;
        }
        finished(failed);
    }

    function retry(message, error) {
        if (closed) return;
        log(label, message, error);
        releaseVoice();
        if (!reconnect.enabled || retries >= reconnect.maxRetries) {
            finish('failed', 'Voice connection attempts ended.');
            return;
        }

        const delay = Math.min(reconnect.delayMs * reconnect.backoffMultiplier ** retries, MAX_TIMER_MS);
        retries++;
        account.status = 'waiting to retry';
        log(label, `Retry ${retries}/${reconnect.maxRetries} in ${delay / 1000}s.`);
        schedule(join, delay);
    }

    function monitor(attempt, channelName) {
        let interrupted = false;
        attempt.on('error', error => {
            if (!closed && connection === attempt) log(label, 'Voice error.', error);
        });

        function update(current) {
            if (closed || connection !== attempt || account.status === 'disconnecting') return;
            if (current.status === VoiceConnectionStatus.Ready) {
                interrupted = false;
                hasJoined = true;
                account.status = 'connected';
                log(label, `Joined ${channelName}.`);
                schedule(() => { retries = 0; }, STABLE_CONNECTION_MS);
                return;
            }
            if (current.status === VoiceConnectionStatus.Disconnected &&
                current.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
                current.closeCode === 4014) {
                interrupted = true;
            }
            if (interrupted) {
                if (account.status !== 'waiting for voice server') {
                    account.status = 'waiting for voice server';
                    schedule(() => finish('disconnected', 'Discord closed the voice session.', {
                        failed: !hasJoined,
                        sendLeave: false,
                    }), RECOVERY_TIMEOUT_MS);
                }
                return;
            }
            if (current.status === VoiceConnectionStatus.Destroyed ||
                (current.status === VoiceConnectionStatus.Disconnected &&
                    current.reason === VoiceConnectionDisconnectReason.AdapterUnavailable)) {
                retry('Voice adapter disconnected.');
                return;
            }
            if (account.status === 'connected') {
                if (!reconnect.enabled) {
                    account.status = 'disconnecting';
                    // The voice library can still access the adapter after emitting stateChange.
                    queueMicrotask(() => finish('failed', 'Voice connection lost.'));
                    return;
                }
                account.status = 'reconnecting';
                schedule(() => retry('Voice connection did not recover.'), RECOVERY_TIMEOUT_MS);
            }
        }

        attempt.on('stateChange', (previous, current) => {
            if (previous.status !== current.status || previous.reason !== current.reason ||
                previous.closeCode !== current.closeCode) update(current);
        });
        schedule(() => retry('Voice connection timed out.'), JOIN_TIMEOUT_MS);
        update(attempt.state);
    }

    function join() {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (guild?.available === false) {
                retry(`Server ${guildId} is temporarily unavailable.`);
                return;
            }
            const channel = guild?.channels.cache.get(channelId);
            if (!channel?.isVoiceBased()) {
                finish('invalid destination', guild
                    ? `Voice or stage channel ${channelId} was not found in server ${guildId}.`
                    : `Server ${guildId} was not found.`);
                return;
            }
            if (guild.members?.me && channel.joinable === false) {
                finish('cannot join', `The bot cannot join ${channel.name}.`);
                return;
            }

            account.status = 'connecting';
            connection = connectVoice({
                channelId,
                guildId,
                adapterCreator: guild.voiceAdapterCreator,
                group,
                selfMute: settings.mute,
                selfDeaf: settings.deaf,
            });
            monitor(connection, channel.name);
        } catch (error) {
            retry('Could not start the voice connection.', error);
        }
    }

    function loginFailed(error) {
        if (closed) return;
        log(label, 'Could not sign in.', error);
        finish('login failed');
    }

    account.stop = () => finish('stopped', undefined, { failed: false });
    try {
        client = createClient();
        client.on(Events.Error, error => {
            if (!closed) log(label, 'Client error.', error);
        });
        client.once(Events.ShardDisconnect, event => {
            finish('gateway disconnected', `Discord closed the gateway connection with code ${event.code}.`, {
                sendLeave: false,
            });
        });
        client.on(Events.GuildDelete, guild => {
            if (guild.id === guildId) finish('server removed', 'The bot lost access to the server.', { sendLeave: false });
        });
        client.on(Events.ChannelDelete, channel => {
            if (channel.id === channelId) finish('channel removed', 'The destination channel was deleted.', { sendLeave: false });
        });
        client.on(Events.VoiceStateUpdate, (previous, current) => {
            if (hasJoined && current.id === client.user?.id && current.guild?.id === guildId &&
                previous.channelId === channelId && current.channelId !== channelId) {
                finish('disconnected', 'The bot left or was moved from the destination channel.', {
                    failed: false,
                    sendLeave: false,
                });
            }
        });
        client.once(Events.ClientReady, () => {
            if (closed) return;
            clearTimeout(timer);
            log(label, `Signed in as ${client.user.tag}.`);
            if (settings.presence) {
                try {
                    client.user.setPresence(settings.presence);
                } catch (error) {
                    log(label, 'Could not set presence.', error);
                }
            }
            join();
        });
        schedule(() => finish('login timed out', 'Discord did not become ready before the login deadline.'), LOGIN_TIMEOUT_MS);
        client.login(settings.token).catch(loginFailed);
    } catch (error) {
        loginFailed(error);
    }
}

export function run(config, { createClient, connectVoice = joinVoiceChannel, writeLog, onComplete }) {
    const tokens = config.accounts.map(({ token }) => token).sort((a, b) => b.length - a.length);
    function log(label, message, error) {
        let text = error === undefined ? message : `${message} ${error instanceof Error ? error.message : String(error)}`;
        for (const token of tokens) text = text.replaceAll(token, '[redacted]');
        writeLog(label, stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, ' '));
    }

    const accounts = config.accounts.map((settings, index) => ({
        settings,
        label: `Bot #${index + 1}`,
        status: 'signing in',
    }));
    const report = config.statusReportIntervalMs > 0
        ? setInterval(() => {
            for (const { label, status } of accounts) log(label, status);
        }, config.statusReportIntervalMs).unref()
        : undefined;
    let remaining = accounts.length;
    let hadFailure = false;
    let stopping = false;
    function finished(failed) {
        hadFailure ||= failed;
        if (--remaining === 0) {
            clearInterval(report);
            onComplete(!stopping && hadFailure ? 1 : 0);
        }
    }

    for (const account of accounts) startAccount(account, config.reconnect, { createClient, connectVoice, log, finished });

    return () => {
        stopping = true;
        for (const account of accounts) account.stop();
    };
}
