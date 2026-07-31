const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const TOKEN = process.env.DISCORD_TOKEN;

const CODENAME_CHOICES_NOTE = "autocompleted at runtime";

const deviceOption = {
  type: 3,
  name: "device",
  description: "Mac model, e.g. iMac19,1 or MacBookPro15,2 (optional)",
  required: false,
};

const codenameOption = {
  type: 3,
  name: "codename",
  description: "CPU generation / codename folder",
  required: true,
  autocomplete: true,
};

const featureOption = {
  type: 3,
  name: "feature",
  description: "Which log category",
  required: true,
  choices: [
    { name: "Full build", value: "full-build-logs" },
    { name: "Dual boot", value: "dual-boot-logs" },
    { name: "Already formatted", value: "already-formatted-logs" },
    { name: "Repair EFI", value: "repair-efi-logs" },
    { name: "No USB (folder only)", value: "no-usb-logs" },
    { name: "EFI health check", value: "efi-health-check-logs" },
  ],
};

const command = {
  name: "hwdb",
  description: "Query the HackMate hardware database",
  options: [
    {
      type: 1,
      name: "branch",
      description: "Look up committed hwdb logs on the main branch",
      options: [codenameOption, featureOption, deviceOption],
    },
    {
      type: 1,
      name: "issues",
      description: "Search raw hwdb submissions (GitHub Issues)",
      options: [
        codenameOption,
        featureOption,
        deviceOption,
        {
          type: 3,
          name: "state",
          description: "Issue state to search",
          required: false,
          choices: [
            { name: "Open", value: "open" },
            { name: "Closed", value: "closed" },
            { name: "All", value: "all" },
          ],
        },
      ],
    },
  ],
};

async function main() {
  if (!APPLICATION_ID || !TOKEN) {
    console.error("Set DISCORD_APPLICATION_ID and DISCORD_TOKEN env vars first.");
    process.exit(1);
  }
  const res = await fetch(
    `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command]),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error("Failed:", res.status, data);
    process.exit(1);
  }
  console.log("Registered /hwdb command:", JSON.stringify(data, null, 2));
}

main();
