import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { run } from './runner.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(args) {
    const [option] = args;
    if (args.length === 1 && ['--help', '-h'].includes(option)) {
        console.log('npm start             Connect the configured Discord bots.\nnpm start -- --check  Validate .env without connecting.');
        return;
    }
    const check = args.length === 1 && option === '--check';
    if (args.length && !check) {
        console.error('Unsupported arguments. Run npm start -- --help for usage.');
        process.exitCode = 1;
        return;
    }
    let config;
    try {
        config = loadConfig();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
    }
    if (check) {
        // Configuration validation performs no requests and prints only the destination IDs.
        console.log('Configuration is valid. Discord access has not been checked.');
        for (const [index, { guildId, channelId }] of config.accounts.entries()) {
            console.log(`Bot #${index + 1} will use server ${guildId} and channel ${channelId}.`);
        }
        return;
    }

    let stop;
    const shutdown = () => stop();
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    stop = run(config, {
        createClient: () => new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }),
        writeLog: (label, message) => {
            console.log(`[${new Date().toLocaleTimeString('en-GB')}] [${label}] ${message}`);
        },
        onComplete: exitCode => {
            process.exitCode = exitCode;
            process.off('SIGINT', shutdown);
            process.off('SIGTERM', shutdown);
            // Give the Discord client time to close its sockets before forcing exit.
            setTimeout(() => process.exit(exitCode), SHUTDOWN_TIMEOUT_MS).unref();
        },
    });
}

main(process.argv.slice(2));
