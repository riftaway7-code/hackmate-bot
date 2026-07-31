# hackmate-bot

Discord bot for querying [hackmate-hwdb](https://github.com/riftaway7-code/hackmate-hwdb) live.

Deployed as a Cloudflare Worker (`worker/`) using Discord's HTTP Interactions model — no persistent gateway connection, fits the free plan. A gateway-based Python version (`bot.py`) is also included for anyone who'd rather self-host with `discord.py`.

## Commands

- `/hwdb branch codename:<...> feature:<...> device:<optional>` — reads committed logs from the `main` branch. Omit `device` to list what's on file for that codename/feature.
- `/hwdb issues codename:<...> feature:<...> device:<optional> state:<open|closed|all>` — searches raw GitHub Issues (one per auto-submission).
- `/issueopen title:<...> description:<...> hardware_text:<optional> hardware_image:<optional>` — opens an issue on the main `hackmate` repo (not hwdb) reporting a bug. The issue is created under the repo owner's GitHub token, but the body always states which Discord user submitted it via the bot. Rate-limited to one submission per user per 10 minutes.

`codename` and `feature` are autocompleted/dropdown — they match the real folder names in the hwdb repo (`intel-gen2`...`intel-gen15`, `amd-zen`...`amd-zen5`, `full-build-logs`, `dual-boot-logs`, etc). `device` takes a Mac model like `iMac19,1` or `MacBookPro15,2` and is slugified to match the repo's filename convention.

## Cloudflare Worker (deployed)

`worker/index.js` — single-file Worker, no npm dependencies. Verifies each interaction's Ed25519 signature using the Web Crypto API directly.

Secrets (Worker Settings → Variables and secrets):
- `DISCORD_PUBLIC_KEY` — required. From the Developer Portal's General Information page.
- `GITHUB_TOKEN` — required for `/issueopen`, optional otherwise. A fine-grained PAT scoped to just the `hackmate` repo with Issues: Read-and-write raises the GitHub API rate limit to 5000/hour and lets the bot open issues.

Bindings:
- `RATE_LIMIT_KV` — a Workers KV namespace, used to cap `/issueopen` to one submission per Discord user per 10 minutes.

Set the app's **Interactions Endpoint URL** (General Information page) to the deployed Worker's URL — Discord sends a PING to verify it immediately on save.

Register the slash commands once (or after changing their definitions):

```bash
cd worker
DISCORD_APPLICATION_ID=... DISCORD_TOKEN=... node register-commands.js
```

Deploy code changes:

```bash
cd worker
wrangler deploy
```

## Alternative: Python gateway bot (`bot.py`)

```bash
pip install -r requirements.txt
DISCORD_TOKEN=... GITHUB_TOKEN=... python bot.py
```

Needs a host that keeps a process running continuously (Railway, Fly.io, your own server) — unlike the Worker, this maintains a persistent gateway connection. Dockerfile included.

## Invite the bot

```
https://discord.com/oauth2/authorize?client_id=1532539622934970499&scope=bot+applications.commands&permissions=83968
```

Permissions: Send Messages, Embed Links, Read Message History.
