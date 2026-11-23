import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { ActivityType } from 'discord.js';
import { loadConfig } from '../src/config.js';

const env = { BOT_TOKENS: 'first.token, second.token', DEFAULT_GUILD_ID: '101', DEFAULT_CHANNEL_ID: '102' };

test('uses destination defaults and applies per-account overrides without mutating input', () => {
    const perToken = [{}, { channelId: '103', mute: true, presence: { status: 'idle', state: 'Away' } }];
    const { accounts } = loadConfig({ env, perToken });
    assert.deepEqual(accounts, [
        { token: 'first.token', guildId: '101', channelId: '102', mute: false, deaf: false, presence: undefined },
        {
            token: 'second.token', guildId: '101', channelId: '103', mute: true, deaf: false,
            presence: {
                status: 'idle',
                activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: 'Away', url: undefined }],
            },
        },
    ]);
    assert.equal(perToken[1].presence.type, undefined);
});

test('accepts only the bot token setting and rejects duplicates or prefixes without exposing credentials', () => {
    assert.throws(() => loadConfig({ env: { TOKENS: 'legacy.secret' } }), /Replace TOKENS with BOT_TOKENS/);
    assert.throws(() => loadConfig({ env: { ...env, BOT_TOKENS: 'example.secret, example.secret' } }), {
        message: 'BOT_TOKENS contains a duplicate.',
    });
    assert.throws(() => loadConfig({ env: { ...env, BOT_TOKENS: 'Bot example.secret' } }), /without authorization prefixes/);
    assert.throws(() => loadConfig({ env: { ...env, BOT_TOKENS: 'first.token,,second.token' } }), /empty entry/);
});

test('validates IDs, account options, and timer settings before connecting', () => {
    for (const channelId of [101, 0, '0', '1e3', '18446744073709551616']) {
        assert.throws(() => loadConfig({ env, perToken: [{ channelId }] }), /Bot #1 channelId/);
    }
    assert.equal(loadConfig({ env, perToken: [{ channelId: '18446744073709551615' }] }).accounts[0].channelId,
        '18446744073709551615');
    assert.throws(() => loadConfig({ env, perToken: [{ mute: 'false' }] }), /must be booleans/);
    assert.throws(() => loadConfig({ env, perToken: [{ presence: { type: 'UNKNOWN' } }] }), /presence.type/);
    assert.throws(() => loadConfig({ env, perToken: [{}, {}, {}] }), /PER_TOKEN_CONFIG/);
    assert.throws(() => loadConfig({ env, statusReportIntervalMs: 2 ** 31 }), /STATUS_REPORT_INTERVAL_MS/);
    const { reconnect } = loadConfig({ env });
    assert.throws(() => loadConfig({ env, reconnect: { ...reconnect, delayMs: 0 } }), /RECONNECT.delayMs/);
});

test('CLI exits with an error for missing credentials', () => {
    const result = spawnSync(process.execPath, ['.'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, BOT_TOKENS: '', TOKENS: '' },
        encoding: 'utf8',
        timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set BOT_TOKENS in .env/);
});

test('CLI checks configuration offline and prints destinations without tokens', () => {
    const result = spawnSync(process.execPath, ['.', '--check'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Bot #1 will use server 101 and channel 102/);
    assert.match(result.stdout, /Bot #2 will use server 101 and channel 102/);
    assert.ok(!result.stdout.includes('first.token') && !result.stdout.includes('second.token'));
});
