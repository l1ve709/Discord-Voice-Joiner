import 'dotenv/config';

const PER_TOKEN_CONFIG = [];

const RECONNECT = {
    enabled: true,
    maxRetries: 5,
    delayMs: 5_000,
    backoffMultiplier: 2,
};

const STATUS_REPORT_INTERVAL_MS = 60_000;

export function loadConfig() {
    const rawTokens = process.env.TOKENS ?? '';
    const tokens = rawTokens.split(',').map(token => token.trim()).filter(Boolean);

    if (tokens.length === 0) {
        throw new Error('Set TOKENS in .env. Use .env.example as a starting point.');
    }

    if (new Set(tokens).size !== tokens.length) {
        throw new Error('TOKENS contains a duplicate.');
    }

    const accounts = tokens.map((token, index) => {
        const settings = PER_TOKEN_CONFIG[index] ?? {};
        const guildId = (settings.guildId || process.env.DEFAULT_GUILD_ID)?.trim();
        const channelId = (settings.channelId || process.env.DEFAULT_CHANNEL_ID)?.trim();

        for (const [name, id] of Object.entries({ guildId, channelId })) {
            if (!id || !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 2n ** 64n - 1n) {
                throw new Error(`Account #${index + 1} needs a valid ${name}.`);
            }
        }

        return {
            token,
            guildId,
            channelId,
            mute: settings.mute ?? false,
            deaf: settings.deaf ?? false,
            presence: settings.presence,
        };
    });

    return { accounts, reconnect: RECONNECT, statusReportIntervalMs: STATUS_REPORT_INTERVAL_MS };
}
