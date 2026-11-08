import { Client } from 'discord.js-selfbot-v13';
import { joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { loadConfig } from './config.js';

const JOIN_TIMEOUT_MS = 15_000;
const RECOVERY_TIMEOUT_MS = 5_000;
const MAX_TIMER_MS = 2_147_483_647;

function log(label, message) {
    console.log(`[${new Date().toLocaleTimeString('en-GB')}] [${label}] ${message}`);
}

function describeError(error, account) {
    let message = error instanceof Error ? error.message : String(error);
    for (const token of [account.settings.token, account.client.token]) {
        if (token) message = message.replaceAll(token, '[redacted]');
    }
    return message;
}

function stopVoice(account) {
    clearTimeout(account.timer);
    account.timer = undefined;

    const connection = account.connection;
    account.connection = undefined;
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
    }
}

function setPresence(account) {
    const { client, label, settings } = account;
    if (!settings.presence) return;

    const { status = 'online', type, name, url, state } = settings.presence;
    try {
        const activity = name || state
            ? { name: name ?? 'Custom Status', type: type ?? (state ? 'CUSTOM' : 'PLAYING'), url, state }
            : undefined;
        client.user.setPresence({ status, activities: activity ? [activity] : undefined });
    } catch (error) {
        log(label, `Could not set presence. ${describeError(error, account)}`);
    }
}

function join(account, reconnect) {
    const { client, label, settings } = account;

    function retry(reason) {
        stopVoice(account);
        log(label, reason);

        if (!reconnect.enabled || account.retries >= reconnect.maxRetries) {
            account.status = 'failed';
            if (reconnect.enabled) log(label, 'No voice retries remaining.');
            return;
        }

        const delay = Math.min(
            reconnect.delayMs * reconnect.backoffMultiplier ** account.retries,
            MAX_TIMER_MS,
        );
        account.retries++;
        account.status = 'waiting to retry';
        log(label, `Retry ${account.retries}/${reconnect.maxRetries} in ${delay / 1000}s.`);
        account.timer = setTimeout(() => join(account, reconnect), delay);
    }

    const guild = client.guilds.cache.get(settings.guildId);
    const channel = guild?.channels.cache.get(settings.channelId);
    if (!channel?.isVoice()) {
        account.status = 'invalid destination';
        log(label, guild
            ? `Voice or stage channel ${settings.channelId} not found in server ${guild.id}.`
            : `Server ${settings.guildId} not found.`);
        return;
    }

    account.status = 'connecting';
    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            group: label,
            selfMute: settings.mute,
            selfDeaf: settings.deaf,
        });
    } catch (error) {
        retry(`Could not start the voice connection. ${describeError(error, account)}`);
        return;
    }

    account.connection = connection;
    account.timer = setTimeout(() => retry('Voice connection timed out.'), JOIN_TIMEOUT_MS);

    connection.on('error', error => {
        log(label, `Voice error. ${describeError(error, account)}`);
    });

    function updateStatus(status) {
        if (account.connection !== connection) return;

        if (status === VoiceConnectionStatus.Ready) {
            clearTimeout(account.timer);
            account.retries = 0;
            account.status = 'connected';
            log(label, `Joined ${channel.name}.`);
        } else if (status === VoiceConnectionStatus.Destroyed) {
            retry('Voice connection closed.');
        } else if (account.status === 'connected') {
            account.status = 'reconnecting';
            if (reconnect.enabled) {
                account.timer = setTimeout(() => retry('Voice connection did not recover.'), RECOVERY_TIMEOUT_MS);
            } else {
                stopVoice(account);
                account.status = 'disconnected';
                log(label, 'Voice connection lost.');
            }
        }
    }

    connection.on('stateChange', (previous, current) => {
        if (previous.status !== current.status) updateStatus(current.status);
    });
    updateStatus(connection.state.status);
}

function start() {
    let config;
    try {
        config = loadConfig();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
    }

    const accounts = config.accounts.map((settings, index) => ({
        client: new Client({ checkUpdate: false }),
        label: `Account #${index + 1}`,
        settings,
        status: 'signing in',
        retries: 0,
        connection: undefined,
        timer: undefined,
    }));

    const report = config.statusReportIntervalMs > 0
        ? setInterval(() => {
            for (const { label, status } of accounts) log(label, status);
        }, config.statusReportIntervalMs)
        : undefined;
    report?.unref();

    let stopping = false;
    function shutdown() {
        if (stopping) return;
        stopping = true;
        clearInterval(report);
        for (const account of accounts) {
            stopVoice(account);
            account.client.destroy();
        }
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    for (const account of accounts) {
        const { client, label, settings } = account;
        client.once('ready', () => {
            if (stopping) return;
            log(label, `Signed in as ${client.user.tag}.`);
            setPresence(account);
            join(account, config.reconnect);
        });
        client.on('error', error => log(label, `Client error. ${describeError(error, account)}`));
        client.on('invalidated', () => {
            stopVoice(account);
            client.destroy();
            account.status = 'session invalidated';
            log(label, 'Discord invalidated the session.');
        });

        client.login(settings.token).catch(error => {
            if (stopping) return;
            stopVoice(account);
            account.status = 'login failed';
            log(label, `Could not sign in. ${describeError(error, account)}`);
            if (accounts.every(item => item.status === 'login failed')) process.exitCode = 1;
        });
    }
}

start();
