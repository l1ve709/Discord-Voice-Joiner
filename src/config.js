import { ActivityType } from 'discord.js';
import 'dotenv/config';

const PER_TOKEN_CONFIG = [];

const RECONNECT = {
    enabled: true,
    maxRetries: 5,
    delayMs: 5_000,
    backoffMultiplier: 2,
};

const STATUS_REPORT_INTERVAL_MS = 60_000;

const MAX_TIMER_MS = 2_147_483_647;
const MAX_SNOWFLAKE = (1n << 64n) - 1n;
const PRESENCE_STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const ACTIVITY_TYPES = new Map([
    ['PLAYING', ActivityType.Playing],
    ['STREAMING', ActivityType.Streaming],
    ['LISTENING', ActivityType.Listening],
    ['WATCHING', ActivityType.Watching],
    ['CUSTOM', ActivityType.Custom],
]);

function readId(override, fallback, label) {
    const value = override === '' ? fallback : override ?? fallback;
    const id = typeof value === 'string' ? value.trim() : '';
    if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > MAX_SNOWFLAKE) {
        throw new Error(`${label} must be a Discord ID. Enable Developer Mode and use Copy ID in Discord.`);
    }
    return id;
}

function readPresence(presence, label) {
    if (presence == null) return undefined;
    if (typeof presence !== 'object' || Array.isArray(presence)) {
        throw new Error(`${label}.presence must be an object.`);
    }

    const { status = 'online', name, type, state, url } = presence;
    if (!PRESENCE_STATUSES.includes(status)) {
        throw new Error(`${label}.presence.status must be ${PRESENCE_STATUSES.join(', ')}.`);
    }
    if (type !== undefined && !ACTIVITY_TYPES.has(type)) {
        throw new Error(`${label}.presence.type must be ${[...ACTIVITY_TYPES.keys()].join(', ')}.`);
    }
    for (const [field, value] of Object.entries({ name, state, url })) {
        if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
            throw new Error(`${label}.presence.${field} must be a non-empty string.`);
        }
    }
    if (!name && !state && (type || url)) {
        throw new Error(`${label}.presence needs an activity name or custom status text.`);
    }

    const activity = name || state
        ? { name: name ?? 'Custom Status', type: ACTIVITY_TYPES.get(type ?? (state ? 'CUSTOM' : 'PLAYING')), state, url }
        : undefined;
    return { status, activities: activity ? [activity] : undefined };
}

function validateTimer(value, label, minimum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > MAX_TIMER_MS) {
        throw new Error(`${label} must be an integer from ${minimum} to ${MAX_TIMER_MS} milliseconds.`);
    }
}

export function loadConfig({
    env = process.env,
    perToken = PER_TOKEN_CONFIG,
    reconnect = RECONNECT,
    statusReportIntervalMs = STATUS_REPORT_INTERVAL_MS,
} = {}) {
    const tokenList = env.BOT_TOKENS?.trim();
    if (!tokenList) {
        throw new Error(env.TOKENS?.trim()
            ? 'Replace TOKENS with BOT_TOKENS and use bot tokens from the Discord Developer Portal.'
            : 'Set BOT_TOKENS in .env using bot tokens from the Discord Developer Portal.');
    }
    const tokens = tokenList.split(',').map(token => token.trim());
    if (tokens.some(token => !token)) {
        throw new Error('BOT_TOKENS contains an empty entry. Separate bot tokens with a single comma.');
    }
    if (tokens.some(token => /\s/.test(token))) {
        throw new Error('Use raw bot tokens in BOT_TOKENS, without authorization prefixes.');
    }

    if (new Set(tokens).size !== tokens.length) {
        throw new Error('BOT_TOKENS contains a duplicate.');
    }

    if (!Array.isArray(perToken) || perToken.length > tokens.length) {
        throw new Error('PER_TOKEN_CONFIG must be an array with at most one entry per token.');
    }
    if (!reconnect || typeof reconnect.enabled !== 'boolean' ||
        !Number.isSafeInteger(reconnect.maxRetries) || reconnect.maxRetries < 0 ||
        !Number.isFinite(reconnect.backoffMultiplier) || reconnect.backoffMultiplier < 1) {
        throw new Error('RECONNECT needs a boolean enabled flag, a non-negative integer maxRetries, and a backoffMultiplier of at least 1.');
    }
    validateTimer(reconnect.delayMs, 'RECONNECT.delayMs', 1);
    validateTimer(statusReportIntervalMs, 'STATUS_REPORT_INTERVAL_MS', 0);

    const accounts = tokens.map((token, index) => {
        const settings = perToken[index] ?? {};
        const label = `Bot #${index + 1}`;
        if (typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error(`${label} settings must be an object.`);
        }
        const mute = settings.mute ?? false;
        const deaf = settings.deaf ?? false;
        if (typeof mute !== 'boolean' || typeof deaf !== 'boolean') {
            throw new Error(`${label} mute and deaf settings must be booleans.`);
        }
        return {
            token,
            guildId: readId(settings.guildId, env.DEFAULT_GUILD_ID, `${label} guildId (DEFAULT_GUILD_ID or override)`),
            channelId: readId(settings.channelId, env.DEFAULT_CHANNEL_ID, `${label} channelId (DEFAULT_CHANNEL_ID or override)`),
            mute,
            deaf,
            presence: readPresence(settings.presence, label),
        };
    });

    return { accounts, reconnect, statusReportIntervalMs };
}
