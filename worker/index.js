const HWDB_REPO = "riftaway7-code/hackmate-hwdb";
const HACKMATE_REPO = "riftaway7-code/hackmate";
const GITHUB_API = "https://api.github.com";

const FEATURE_LABELS = {
  "full-build-logs": "Full build",
  "dual-boot-logs": "Dual boot",
  "already-formatted-logs": "Already formatted",
  "repair-efi-logs": "Repair EFI",
  "no-usb-logs": "No USB (folder only)",
  "efi-health-check-logs": "EFI health check",
};

const CODENAME_LABELS = {
  "intel-gen2": "Intel gen 2", "intel-gen3": "Intel gen 3", "intel-gen4": "Intel gen 4",
  "intel-gen5": "Intel gen 5", "intel-gen6": "Intel gen 6", "intel-gen7": "Intel gen 7",
  "intel-gen8": "Intel gen 8", "intel-gen9": "Intel gen 9", "intel-gen10": "Intel gen 10",
  "intel-gen11": "Intel gen 11", "intel-gen12": "Intel gen 12", "intel-gen13": "Intel gen 13",
  "intel-gen14": "Intel gen 14", "intel-gen15": "Intel gen 15",
  "amd-zen": "AMD Zen", "amd-zen-plus": "AMD Zen+", "amd-zen2": "AMD Zen 2",
  "amd-zen3": "AMD Zen 3", "amd-zen3-plus": "AMD Zen 3+", "amd-zen4": "AMD Zen 4", "amd-zen5": "AMD Zen 5",
};

function slugify(text) {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "unknown-device";
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function verifyDiscordRequest(request, publicKey, body) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  const key = await crypto.subtle.importKey(
    "raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]
  );
  return crypto.subtle.verify(
    "Ed25519", key, hexToBytes(signature),
    new TextEncoder().encode(timestamp + body)
  );
}

function githubHeaders(env) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "hackmate-bot" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

function getOption(options, name) {
  const opt = (options || []).find((o) => o.name === name);
  return opt ? opt.value : undefined;
}

async function handleBranch(options, env) {
  const codename = getOption(options, "codename");
  const feature = getOption(options, "feature");
  const device = getOption(options, "device");
  const folder = `${feature}/${codename}`;
  const featureLabel = FEATURE_LABELS[feature] || feature;
  const codenameLabel = CODENAME_LABELS[codename] || codename;

  if (device) {
    const slug = slugify(device);
    const res = await fetch(
      `${GITHUB_API}/repos/${HWDB_REPO}/contents/${folder}/${slug}.log`,
      { headers: githubHeaders(env) }
    );
    if (res.ok) {
      const data = await res.json();
      const content = atob(data.content.replace(/\n/g, ""));
      const preview = content.slice(0, 1500);
      return {
        embeds: [{
          title: `${device} — ${featureLabel} — ${codenameLabel}`,
          description: "```\n" + preview + "\n```" + (content.length > 1500 ? "\n...(truncated, see link)" : ""),
          url: `https://github.com/${HWDB_REPO}/blob/main/${folder}/${slug}.log`,
          color: 0x5865f2,
        }],
      };
    }
    return {
      content: `No committed log found at \`${folder}/${slug}.log\`. Try \`/hwdb branch\` without a device to see what's actually there, or \`/hwdb issues\` for raw submissions.`,
    };
  }

  const res = await fetch(`${GITHUB_API}/repos/${HWDB_REPO}/contents/${folder}`, { headers: githubHeaders(env) });
  if (!res.ok) {
    return { content: `Nothing found for \`${folder}\` (status ${res.status}).` };
  }
  const data = await res.json();
  const files = data.filter((f) => f.name.endsWith(".log")).map((f) => f.name);
  if (!files.length) {
    return { content: `No logs yet in \`${folder}\`.` };
  }
  files.sort();
  return {
    embeds: [{
      title: `${featureLabel} — ${codenameLabel}`,
      description: files.slice(0, 40).map((f) => `• ${f}`).join("\n"),
      url: `https://github.com/${HWDB_REPO}/tree/main/${folder}`,
      color: 0x5865f2,
      footer: { text: `${files.length} device(s) on file — pass device: to view one directly` },
    }],
  };
}

async function handleIssues(options, env) {
  const codename = getOption(options, "codename");
  const feature = getOption(options, "feature");
  const device = getOption(options, "device");
  const state = getOption(options, "state") || "open";
  const featureLabel = FEATURE_LABELS[feature] || feature;
  const codenameLabel = CODENAME_LABELS[codename] || codename;

  const queryParts = [`repo:${HWDB_REPO}`, "is:issue", `"${feature}/${codename}"`];
  if (state !== "all") queryParts.push(`state:${state}`);
  if (device) queryParts.push(`"${slugify(device)}"`);
  const query = queryParts.join(" ");

  const res = await fetch(
    `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=10&sort=created&order=desc`,
    { headers: githubHeaders(env) }
  );
  if (!res.ok) {
    return { content: `Search failed (status ${res.status}).` };
  }
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) {
    return { content: `No matching issues for \`${feature}/${codename}\`${device ? ` / \`${device}\`` : ""}.` };
  }
  const lines = items.map(
    (issue) => `• [#${issue.number}](${issue.html_url}) ${issue.title} — ${issue.created_at.slice(0, 10)}`
  );
  return {
    embeds: [{
      title: `hwdb issues — ${featureLabel} — ${codenameLabel}`,
      description: lines.join("\n"),
      color: 0x5865f2,
      footer: { text: `${data.total_count} total match(es)` },
    }],
  };
}

function autocompleteCodename(current) {
  const q = (current || "").toLowerCase();
  const matches = Object.entries(CODENAME_LABELS).filter(
    ([key, label]) => key.includes(q) || label.toLowerCase().includes(q)
  );
  return matches.slice(0, 25).map(([key, label]) => ({ name: label, value: key }));
}

async function createGithubIssue(env, title, body, labels) {
  const res = await fetch(`${GITHUB_API}/repos/${HACKMATE_REPO}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub issue creation failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function handleIssueOpen(interaction, env) {
  const options = interaction.data.options || [];
  const title = getOption(options, "title");
  const description = getOption(options, "description");
  const hardwareText = getOption(options, "hardware_text");
  const hardwareAttachmentId = getOption(options, "hardware_image");

  const discordUser = interaction.member?.user || interaction.user;
  const discordId = discordUser?.id;
  const discordTag = discordUser?.username ? `@${discordUser.username}` : "an unknown Discord user";

  if (!discordId) {
    return { content: "Could not identify the reporting user — try again from inside the server." };
  }

  if (env.RATE_LIMIT_KV) {
    const key = `issueopen:${discordId}`;
    const existing = await env.RATE_LIMIT_KV.get(key);
    if (existing) {
      return { content: "You can only open one report every 10 minutes — please wait before submitting another." };
    }
  }

  let hardwareImageUrl = null;
  if (hardwareAttachmentId) {
    const attachment = interaction.data.resolved?.attachments?.[hardwareAttachmentId];
    hardwareImageUrl = attachment?.url || null;
  }

  const bodyLines = [
    `**Reported via the hackmate Discord bot by ${discordTag}** (Discord ID: ${discordId})`,
    "",
    description,
  ];
  if (hardwareText) {
    bodyLines.push("", "**Hardware:**", hardwareText);
  }
  if (hardwareImageUrl) {
    bodyLines.push("", "**Hardware image:**", hardwareImageUrl);
  }
  bodyLines.push(
    "",
    "---",
    "_This issue was opened automatically via the hackmate Discord bot — not directly by the repo owner._"
  );

  let issue;
  try {
    issue = await createGithubIssue(
      env,
      `[user-report] ${title}`,
      bodyLines.join("\n"),
      ["user-reported", "via-discord-bot"]
    );
  } catch (e) {
    return { content: `Couldn't open the issue: ${e.message}` };
  }

  if (env.RATE_LIMIT_KV) {
    await env.RATE_LIMIT_KV.put(`issueopen:${discordId}`, "1", { expirationTtl: 600 });
  }

  return {
    embeds: [{
      title: `Issue opened: #${issue.number}`,
      description: title,
      url: issue.html_url,
      color: 0x2ea44f,
      footer: { text: `Reported by ${discordTag}` },
    }],
  };
}

export { slugify, handleBranch, handleIssues, autocompleteCodename, handleIssueOpen };

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("hackmate-bot is running", { status: 200 });
    }

    const body = await request.text();
    const valid = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY, body);
    if (!valid) {
      return new Response("invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    if (interaction.type === 4) {
      if (interaction.data.name === "hwdb") {
        const focused = (interaction.data.options?.[0]?.options || []).find((o) => o.focused);
        const choices = focused && focused.name === "codename" ? autocompleteCodename(focused.value) : [];
        return Response.json({ type: 8, data: { choices } });
      }
      return Response.json({ type: 8, data: { choices: [] } });
    }

    if (interaction.type === 2) {
      const commandName = interaction.data.name;
      let payload;

      if (commandName === "hwdb") {
        const sub = interaction.data.options?.[0];
        const options = sub?.options || [];
        try {
          if (sub?.name === "branch") {
            payload = await handleBranch(options, env);
          } else if (sub?.name === "issues") {
            payload = await handleIssues(options, env);
          } else {
            payload = { content: "Unknown subcommand." };
          }
        } catch (e) {
          payload = { content: `Error: ${e.message}` };
        }
      } else if (commandName === "issueopen") {
        try {
          payload = await handleIssueOpen(interaction, env);
        } catch (e) {
          payload = { content: `Error: ${e.message}` };
        }
      } else {
        payload = { content: "Unknown command." };
      }

      return Response.json({ type: 4, data: payload });
    }

    return new Response("unhandled interaction type", { status: 400 });
  },
};
