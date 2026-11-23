import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getVoiceConnection, joinVoiceChannel, VoiceConnectionDisconnectReason, VoiceConnectionStatus as Status } from '@discordjs/voice';
import { run } from '../src/runner.js';

const guildId = '101';
const channelId = '102';

class FakeClient extends EventEmitter {
    destroyed = 0;
    user = { id: '103', tag: 'example' };

    login() {
        return Promise.resolve();
    }

    destroy() {
        this.destroyed++;
    }
}

class FakeVoice extends EventEmitter {
    state = { status: Status.Signalling };
    leaves = [];

    transition(status, details = {}) {
        const previous = this.state;
        this.state = { status, ...details };
        this.emit('stateChange', previous, this.state);
    }

    destroy(sendLeave) {
        this.leaves.push(sendLeave);
        this.transition(Status.Destroyed);
    }
}

function scenario(t, options = {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const guild = {
        id: guildId,
        available: true,
        channels: { cache: new Map([[channelId, { name: 'Voice', isVoiceBased: () => true }]]) },
    };
    const clients = Array.from({ length: options.count ?? 1 }, () => Object.assign(new FakeClient(), {
        guilds: { cache: new Map([[guildId, guild]]) },
    }));
    options.setup?.(clients, guild);
    const attempts = [];
    const logs = [];
    const exits = [];
    const nextClient = clients.values();
    const stop = run({
        accounts: clients.map((_, index) => ({ guildId, channelId, token: `secret.${index}` })),
        reconnect: { enabled: true, maxRetries: 2, delayMs: 100, backoffMultiplier: 2, ...options.reconnect },
        statusReportIntervalMs: options.statusReportIntervalMs ?? 0,
    }, {
        createClient: () => nextClient.next().value,
        connectVoice: options.connectVoice ?? (connectionOptions => {
            const voice = new FakeVoice();
            attempts.push({ voice, connectionOptions });
            return voice;
        }),
        writeLog: (_, line) => logs.push(line),
        onComplete: code => exits.push(code),
    });
    t.after(stop);
    return { clients, guild, attempts, logs, exits, stop, tick: ms => t.mock.timers.tick(ms) };
}

test('keeps successful accounts running when another login fails and redacts every credential', async t => {
    const { clients, attempts, logs, exits, stop } = scenario(t, {
        count: 2,
        setup: ([first]) => {
            first.login = () => Promise.reject(new Error('secret.0\nsecret.1'));
        },
    });
    clients[1].emit('clientReady');
    attempts[0].voice.transition(Status.Ready);
    await Promise.resolve();
    assert.equal(clients[0].destroyed, 1);
    assert.equal(clients[1].destroyed, 0);
    assert.deepEqual(exits, []);
    assert.ok(logs.some(line => line.includes('[redacted] [redacted]')));
    assert.ok(logs.every(line => !line.includes('secret.')));
    stop();
    stop();
    assert.deepEqual(exits, [0]);
    assert.deepEqual(attempts[0].voice.leaves, [true]);
    assert.equal(clients[1].destroyed, 1);
});

test('fails an invalid destination and clears periodic reporting when all accounts stop', t => {
    const { clients, guild, exits, logs, tick } = scenario(t, { statusReportIntervalMs: 100 });
    guild.channels.cache.clear();
    clients[0].emit('clientReady');
    assert.equal(clients[0].destroyed, 1);
    assert.deepEqual(exits, [1]);
    const logCount = logs.length;
    tick(1_000);
    assert.equal(logs.length, logCount);
});

test('times out a login that never becomes ready and ignores late readiness', t => {
    const { clients, attempts, exits, tick } = scenario(t, {
        setup: ([client]) => { client.login = () => new Promise(() => {}); },
    });
    tick(60_000);
    clients[0].emit('clientReady');
    assert.equal(clients[0].destroyed, 1);
    assert.equal(attempts.length, 0);
    assert.deepEqual(exits, [1]);
});

test('isolates concurrent accounts in the same guild and cancels pending retries on shutdown', t => {
    const { clients, attempts, exits, stop, tick } = scenario(t, { count: 2 });
    clients.forEach(client => client.emit('clientReady'));
    assert.notEqual(attempts[0].connectionOptions.group, attempts[1].connectionOptions.group);
    tick(15_000);
    stop();
    tick(10_000);
    assert.equal(attempts.length, 2);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(attempts.map(({ voice }) => voice.leaves), [[true], [true]]);
});

test('bounds retries across brief ready states and ignores the leave from its own cleanup', t => {
    const { clients: [client], guild, attempts, exits, tick } = scenario(t);
    client.emit('clientReady');
    for (const delay of [100, 200]) {
        const current = attempts.at(-1).voice;
        current.transition(Status.Ready);
        current.transition(Status.Connecting);
        tick(5_000);
        client.emit('voiceStateUpdate', { channelId }, { id: client.user.id, guild, channelId: null });
        tick(delay - 1);
        assert.equal(attempts.at(-1).voice, current);
        tick(1);
        assert.notEqual(attempts.at(-1).voice, current);
    }
    attempts[2].voice.transition(Status.Ready);
    attempts[2].voice.transition(Status.Connecting);
    tick(5_000);
    assert.equal(attempts.length, 3);
    assert.deepEqual(exits, [1]);
});

test('restores the retry budget after a stable connection', t => {
    const { clients: [client], attempts, exits, tick } = scenario(t, { reconnect: { maxRetries: 1 } });
    client.emit('clientReady');
    tick(15_000);
    tick(100);
    attempts[1].voice.transition(Status.Ready);
    tick(30_000);
    attempts[1].voice.transition(Status.Connecting);
    tick(5_000);
    tick(100);
    assert.equal(attempts.length, 3);
    assert.deepEqual(exits, []);
});

test('lets a voice server move recover, then stops if Discord removes the account', t => {
    const { clients: [client], guild, attempts, exits, tick } = scenario(t);
    client.emit('clientReady');
    const [{ voice }] = attempts;
    voice.transition(Status.Ready);
    voice.transition(Status.Disconnected, { reason: VoiceConnectionDisconnectReason.WebSocketClose, closeCode: 4014 });
    voice.transition(Status.Connecting);
    voice.transition(Status.Ready);
    tick(5_000);
    assert.deepEqual(exits, []);

    client.emit('voiceStateUpdate', { channelId }, { id: client.user.id, guild, channelId: null });
    tick(30_000);
    assert.equal(attempts.length, 1);
    assert.deepEqual(voice.leaves, [false]);
    assert.deepEqual(exits, [0]);
});

test('does not issue a new join after an unrecovered 4014 close', t => {
    const { clients: [client], attempts, exits, tick } = scenario(t);
    client.emit('clientReady');
    attempts[0].voice.transition(Status.Disconnected, {
        reason: VoiceConnectionDisconnectReason.WebSocketClose,
        closeCode: 4014,
    });
    tick(5_000);
    assert.equal(attempts.length, 1);
    assert.deepEqual(attempts[0].voice.leaves, [false]);
    assert.deepEqual(exits, [1]);
});

test('recovers when a guild is temporarily unavailable', t => {
    const { clients: [client], guild, attempts, tick } = scenario(t);
    guild.available = false;
    client.emit('clientReady');
    assert.equal(attempts.length, 0);
    guild.available = true;
    tick(100);
    assert.equal(attempts.length, 1);
});

test('lets the voice library finish its transition before closing with retries disabled', async t => {
    const { clients: [client], attempts, exits, tick } = scenario(t, { reconnect: { enabled: false } });
    client.emit('clientReady');
    const [{ voice }] = attempts;
    voice.transition(Status.Ready);
    voice.transition(Status.Signalling);
    assert.equal(voice.state.status, Status.Signalling);
    await Promise.resolve();
    tick(30_000);
    assert.equal(attempts.length, 1);
    assert.deepEqual(voice.leaves, [true]);
    assert.deepEqual(exits, [1]);
});

test('releases a real voice-library adapter after its gateway rejects the first payload', t => {
    let released = 0;
    let group;
    const { clients, guild, exits } = scenario(t, {
        connectVoice: options => {
            group = options.group;
            return joinVoiceChannel(options);
        },
        reconnect: { enabled: false },
        setup: (_, destination) => {
            destination.voiceAdapterCreator = () => ({
                sendPayload: () => false,
                destroy: () => { released++; },
            });
        },
    });
    clients[0].emit('clientReady');
    assert.equal(released, 1);
    assert.equal(clients[0].destroyed, 1);
    assert.equal(getVoiceConnection(guild.id, group), undefined);
    assert.deepEqual(exits, [1]);
});

test('cleans up a partially created voice connection when its adapter throws', t => {
    let released = 0;
    let group;
    const { clients: [client], exits } = scenario(t, {
        reconnect: { enabled: false },
        connectVoice: options => {
            group = options.group;
            return joinVoiceChannel(options);
        },
        setup: (_, guild) => {
            guild.voiceAdapterCreator = () => ({
                sendPayload: () => { throw new Error('Gateway closed'); },
                destroy: () => { released++; },
            });
        },
    });
    client.emit('clientReady');
    assert.equal(released, 1);
    assert.equal(getVoiceConnection(guildId, group), undefined);
    assert.deepEqual(exits, [1]);
});

test('stops without retrying when the bot gateway closes permanently', t => {
    const { clients: [client], attempts, exits, tick } = scenario(t);
    client.emit('clientReady');
    attempts[0].voice.transition(Status.Ready);
    client.emit('shardDisconnect', { code: 4004 });
    tick(60_000);
    assert.equal(attempts.length, 1);
    assert.deepEqual(attempts[0].voice.leaves, [false]);
    assert.deepEqual(exits, [1]);
});

test('bounds asynchronous client cleanup and reports completion only once', async t => {
    let resolveClose;
    const { clients: [client], guild, exits, tick } = scenario(t, {
        setup: ([bot]) => {
            bot.destroy = () => new Promise(resolve => { resolveClose = resolve; });
        },
    });
    guild.channels.cache.clear();
    client.emit('clientReady');
    tick(7_999);
    assert.deepEqual(exits, []);
    tick(1);
    assert.deepEqual(exits, [1]);
    resolveClose();
    await Promise.resolve();
    assert.deepEqual(exits, [1]);
});

test('runs the bot lifecycle with the installed discord.js client and a stub gateway', async t => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
    const voice = new FakeVoice();
    let requestedDestination;
    client.guilds.cache.set(guildId, {
        channels: { cache: new Map([[channelId, { name: 'Test Voice', isVoiceBased: () => true }]]) },
    });
    t.mock.method(client.ws, 'connect', async () => {
        client.user = { id: '103', tag: 'test-bot' };
        client.emit(Events.ClientReady, client);
    });
    let stop;
    const completed = new Promise(resolve => {
        stop = run({
            accounts: [{ guildId, channelId, token: 'stub.bot.credential' }],
            statusReportIntervalMs: 0,
        }, {
            createClient: () => client,
            connectVoice: options => {
                requestedDestination = options.channelId;
                return voice;
            },
            writeLog: () => {},
            onComplete: resolve,
        });
    });
    t.after(() => stop());
    assert.equal(requestedDestination, channelId);
    voice.transition(Status.Ready);
    stop();
    assert.equal(await completed, 0);
    assert.equal(client.token, null);
    assert.deepEqual(voice.leaves, [true]);
});
