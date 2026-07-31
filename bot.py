import os
import re
import urllib.request
import urllib.error
import urllib.parse
import json

import discord
from discord import app_commands
from discord.ext import commands

REPO = "riftaway7-code/hackmate-hwdb"
GITHUB_API = "https://api.github.com"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
DISCORD_TOKEN = os.environ["DISCORD_TOKEN"]

FEATURE_FOLDERS = [
    "full-build-logs",
    "dual-boot-logs",
    "already-formatted-logs",
    "repair-efi-logs",
    "no-usb-logs",
    "efi-health-check-logs",
]

CODENAME_FOLDERS = [
    "intel-gen2", "intel-gen3", "intel-gen4", "intel-gen5", "intel-gen6",
    "intel-gen7", "intel-gen8", "intel-gen9", "intel-gen10", "intel-gen11",
    "intel-gen12", "intel-gen13", "intel-gen14", "intel-gen15",
    "amd-zen-plus", "amd-zen2", "amd-zen3", "amd-zen3-plus", "amd-zen4", "amd-zen5",
    "amd-zen",
]

FEATURE_LABELS = {
    "full-build-logs": "Full build",
    "dual-boot-logs": "Dual boot",
    "already-formatted-logs": "Already formatted",
    "repair-efi-logs": "Repair EFI",
    "no-usb-logs": "No USB (folder only)",
    "efi-health-check-logs": "EFI health check",
}

CODENAME_LABELS = {
    **{f"intel-gen{n}": f"Intel gen {n}" for n in range(2, 16)},
    "amd-zen": "AMD Zen",
    "amd-zen-plus": "AMD Zen+",
    "amd-zen2": "AMD Zen 2",
    "amd-zen3": "AMD Zen 3",
    "amd-zen3-plus": "AMD Zen 3+",
    "amd-zen4": "AMD Zen 4",
    "amd-zen5": "AMD Zen 5",
}


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "unknown-device"


def _api_headers() -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "hackmate-bot",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def _api_get(url: str) -> tuple[int, object]:
    req = urllib.request.Request(url, headers=_api_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return e.code, body
    except Exception as e:
        return 0, {"message": str(e)}


intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree


@bot.event
async def on_ready():
    await tree.sync()
    print(f"logged in as {bot.user}")


hwdb = app_commands.Group(name="hwdb", description="Query the HackMate hardware database")


async def codename_autocomplete(interaction: discord.Interaction, current: str):
    current = current.lower()
    matches = [c for c in CODENAME_FOLDERS if current in c or current in CODENAME_LABELS.get(c, "").lower()]
    return [
        app_commands.Choice(name=CODENAME_LABELS.get(c, c), value=c)
        for c in matches[:25]
    ]


FEATURE_CHOICES = [app_commands.Choice(name=v, value=k) for k, v in FEATURE_LABELS.items()]


@hwdb.command(name="branch", description="Look up committed hwdb logs on the main branch")
@app_commands.describe(
    codename="CPU generation / codename folder",
    feature="Which log category",
    device="Mac model, e.g. iMac19,1 or MacBookPro15,2 (optional)",
)
@app_commands.autocomplete(codename=codename_autocomplete)
@app_commands.choices(feature=FEATURE_CHOICES)
async def hwdb_branch(
    interaction: discord.Interaction,
    codename: str,
    feature: app_commands.Choice[str],
    device: str = "",
):
    await interaction.response.defer()
    folder = f"{feature.value}/{codename}"

    if device:
        slug = slugify(device)
        status, data = _api_get(
            f"{GITHUB_API}/repos/{REPO}/contents/{folder}/{slug}.log"
        )
        if status == 200 and isinstance(data, dict) and "content" in data:
            import base64
            content = base64.b64decode(data["content"]).decode(errors="replace")
            preview = content[:1500]
            embed = discord.Embed(
                title=f"{device} — {feature.name} — {CODENAME_LABELS.get(codename, codename)}",
                description=f"```\n{preview}\n```" + ("\n...(truncated, see link below)" if len(content) > 1500 else ""),
                url=f"https://github.com/{REPO}/blob/main/{folder}/{slug}.log",
                color=0x5865F2,
            )
            await interaction.followup.send(embed=embed)
            return
        else:
            await interaction.followup.send(
                f"No committed log found at `{folder}/{slug}.log`. "
                f"Try `/hwdb branch` without a device to see what's actually there, "
                f"or `/hwdb issues` for raw submissions."
            )
            return

    status, data = _api_get(f"{GITHUB_API}/repos/{REPO}/contents/{folder}")
    if status != 200 or not isinstance(data, list):
        await interaction.followup.send(
            f"Nothing found for `{folder}` (status {status})."
        )
        return

    files = [f["name"] for f in data if f["name"].endswith(".log")]
    if not files:
        await interaction.followup.send(f"No logs yet in `{folder}`.")
        return

    embed = discord.Embed(
        title=f"{feature.name} — {CODENAME_LABELS.get(codename, codename)}",
        description="\n".join(f"• {f}" for f in sorted(files)[:40]),
        url=f"https://github.com/{REPO}/tree/main/{folder}",
        color=0x5865F2,
    )
    embed.set_footer(text=f"{len(files)} device(s) on file — pass device: to view one directly")
    await interaction.followup.send(embed=embed)


@hwdb.command(name="issues", description="Search raw hwdb submissions (GitHub Issues)")
@app_commands.describe(
    codename="CPU generation / codename folder",
    feature="Which log category",
    device="Mac model, e.g. iMac19,1 or MacBookPro15,2 (optional)",
    state="Issue state to search",
)
@app_commands.autocomplete(codename=codename_autocomplete)
@app_commands.choices(
    feature=FEATURE_CHOICES,
    state=[
        app_commands.Choice(name="Open", value="open"),
        app_commands.Choice(name="Closed", value="closed"),
        app_commands.Choice(name="All", value="all"),
    ],
)
async def hwdb_issues(
    interaction: discord.Interaction,
    codename: str,
    feature: app_commands.Choice[str],
    device: str = "",
    state: app_commands.Choice[str] = None,
):
    await interaction.response.defer()
    state_value = state.value if state else "open"
    query_parts = [f"repo:{REPO}", "is:issue", f'"{feature.value}/{codename}"']
    if state_value != "all":
        query_parts.append(f"state:{state_value}")
    if device:
        query_parts.append(f'"{slugify(device)}"')
    query = " ".join(query_parts)

    status, data = _api_get(
        f"{GITHUB_API}/search/issues?q={urllib.parse.quote(query)}&per_page=10&sort=created&order=desc"
    )

    if status != 200 or not isinstance(data, dict):
        await interaction.followup.send(f"Search failed (status {status}).")
        return

    items = data.get("items", [])
    if not items:
        await interaction.followup.send(
            f"No matching issues for `{feature.value}/{codename}`" + (f" / `{device}`" if device else "") + "."
        )
        return

    lines = []
    for issue in items:
        created = issue["created_at"][:10]
        lines.append(f"• [#{issue['number']}]({issue['html_url']}) {issue['title']} — {created}")

    embed = discord.Embed(
        title=f"hwdb issues — {feature.name} — {CODENAME_LABELS.get(codename, codename)}",
        description="\n".join(lines),
        color=0x5865F2,
    )
    embed.set_footer(text=f"{data.get('total_count', len(items))} total match(es)")
    await interaction.followup.send(embed=embed)


tree.add_command(hwdb)

bot.run(DISCORD_TOKEN)
