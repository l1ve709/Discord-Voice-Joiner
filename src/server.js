import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { run } from './runner.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main() {
    let config;
    try {
        config = loadConfig();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
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

main();
