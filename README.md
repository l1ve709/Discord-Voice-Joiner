# Discord Voice Joiner

Discord Voice Joiner connects one or more Discord bots to voice or stage channels. Bots join stage channels as audience members.

## Setup

Requires Node.js 22.12.0 or later and npm.

```sh
git clone https://github.com/l1ve709/Discord-Voice-Joiner.git
cd Discord-Voice-Joiner
npm ci
```

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and generate its bot token on the **Bot** page.
2. Enable **Guild Install** and add the `bot` scope on the **Installation** page. Install the bot in your server and give it **View Channel** and **Connect** in the destination channel. No privileged gateway intents are needed.
3. Copy `.env.example` to `.env` with `cp .env.example .env` or, in PowerShell, `Copy-Item .env.example .env`. Fill in the values below.

| Variable | Value |
| --- | --- |
| `BOT_TOKENS` | Comma-separated bot tokens from the Developer Portal |
| `DEFAULT_GUILD_ID` | ID of the default Discord server |
| `DEFAULT_CHANNEL_ID` | ID of the default voice or stage channel |

To copy IDs, enable Developer Mode under **User Settings → Advanced**, then right-click the server or channel and choose **Copy ID**. Keep `.env` private.

Run `npm start`. Press Ctrl+C to disconnect and exit.

If you are upgrading from a version configured with `TOKENS`, replace that setting with `BOT_TOKENS` and use tokens issued for Discord bots. Keep your existing server and channel IDs.

## Per-bot settings

Edit `PER_TOKEN_CONFIG` in [src/config.js](src/config.js). Entries follow the order in `BOT_TOKENS`. Use `{}` for a bot with no overrides. Omitted IDs fall back to the defaults in `.env`.

```js
const PER_TOKEN_CONFIG = [
    {},
    {
        channelId: '123456789012345678',
        mute: true,
        deaf: true,
        presence: {
            status: 'idle',
            type: 'PLAYING',
            name: 'Chess',
        },
    },
];
```

Both `mute` and `deaf` default to `false`. Supported presence statuses are `online`, `idle`, `dnd`, and `invisible`. To set an activity, supply its `name` and one of `PLAYING`, `STREAMING`, `LISTENING`, `WATCHING`, or `CUSTOM`. Use `url` for a stream link or `state` for custom status text.

## Connection handling

Each bot signs in and joins independently. A bot stops after 60 seconds without a Discord ready event. A voice join has 15 seconds to complete. The default retry budget is five attempts, starting at five seconds and doubling each time. A stable connection resets the budget after 30 seconds.

If a moderator removes a bot from its destination, the bot stops. The process exits with status 1 if all bots have stopped and at least one failed. Ctrl+C closes all active connections.

Edit `RECONNECT` in [src/config.js](src/config.js) to change the retry settings. Set `STATUS_REPORT_INTERVAL_MS` to `0` to turn off periodic status logs.

## Tests

Run `npm test` to check configuration, connection recovery, and shutdown. GitHub Actions runs the suite on Ubuntu and Windows with Node.js 22 and 24. The automated tests require no Discord credentials.

For a live check, install a dedicated bot in a test server and run `npm start` with the test channel configured. Confirm that the bot appears in the channel and the log reports `Joined <channel name>.` Briefly disconnect the test machine from the network, then restore access and check that the bot recovers. Press Ctrl+C and confirm the bot leaves the channel.

## License

[MIT](LICENSE)
