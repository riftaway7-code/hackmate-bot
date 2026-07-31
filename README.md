# hackmate-bot

Discord bot for querying [hackmate-hwdb](https://github.com/riftaway7-code/hackmate-hwdb) live.

## Commands

- `/hwdb branch codename:<...> feature:<...> device:<optional>` — reads committed logs from the `main` branch. Omit `device` to list what's on file for that codename/feature.
- `/hwdb issues codename:<...> feature:<...> device:<optional> state:<open|closed|all>` — searches raw GitHub Issues (one per auto-submission).

`codename` and `feature` are autocompleted/dropdown — they match the real folder names in the hwdb repo (`intel-gen2`...`intel-gen15`, `amd-zen`...`amd-zen5`, `full-build-logs`, `dual-boot-logs`, etc). `device` takes a Mac model like `iMac19,1` or `MacBookPro15,2` and is slugified to match the repo's filename convention.

## Environment variables

- `DISCORD_TOKEN` — required, from the Discord Developer Portal (Bot tab).
- `GITHUB_TOKEN` — optional but recommended. Without it, GitHub API calls are limited to 60/hour per IP; a classic PAT with no scopes (public repo read only) raises that to 5000/hour.

## Run locally

```bash
pip install -r requirements.txt
DISCORD_TOKEN=... GITHUB_TOKEN=... python bot.py
```

## Deploy

Dockerfile included — deploy as-is to Railway, Fly.io, or any container host. Set `DISCORD_TOKEN` (and optionally `GITHUB_TOKEN`) as environment variables on the host.

## Invite the bot

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot+applications.commands&permissions=83968
```

Permissions: Send Messages, Embed Links, Read Message History.
