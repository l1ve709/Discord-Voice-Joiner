# Discord Voice Joiner

Discord Voice Joiner signs in to one or more Discord user accounts and joins a voice or stage channel for each account.

Discord prohibits automated user accounts and may terminate accounts that use them. See [Discord’s self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots).

## Setup

Requires Node.js 22.12.0 or later and npm.

```sh
git clone https://github.com/l1ve709/Discord-Voice-Joiner.git
cd Discord-Voice-Joiner
npm ci
```

Copy `.env.example` to `.env` with `cp .env.example .env` or, in PowerShell, `Copy-Item .env.example .env`. Set the following values:

| Variable | Value |
| --- | --- |
| `TOKENS` | Comma-separated Discord user tokens |
| `DEFAULT_GUILD_ID` | ID of the default Discord server |
| `DEFAULT_CHANNEL_ID` | ID of the default voice or stage channel |

To copy IDs, enable Developer Mode under **User Settings → Advanced**, then right-click the server or channel and choose **Copy ID**. Each account needs access to its destination channel. Keep `.env` private.

Run `npm start`. Press Ctrl+C to disconnect and exit.

## Per-account settings

Edit `PER_TOKEN_CONFIG` in [src/config.js](src/config.js). Entries follow the order in `TOKENS`. Use `{}` to skip an account. Omitted IDs fall back to the defaults in `.env`.

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

Both `mute` and `deaf` default to `false`. Omit `presence` to leave the account’s presence alone. Supported statuses are `online`, `idle`, `dnd`, and `invisible`. To set an activity, supply its `name` and one of `PLAYING`, `STREAMING`, `LISTENING`, `WATCHING`, or `CUSTOM`. Use `url` for a stream link or `state` for custom status text.

Voice retries start after five seconds and double in delay, up to five attempts per failure. Edit `RECONNECT` to change those settings. Set `STATUS_REPORT_INTERVAL_MS` to `0` to turn off the periodic connection report.

## License

[MIT](LICENSE)
