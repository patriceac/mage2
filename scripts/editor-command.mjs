#!/usr/bin/env node

const port = process.env.MAGE2_EDITOR_AUTOMATION_PORT || "47632";
const token = process.env.MAGE2_EDITOR_AUTOMATION_TOKEN;

if (!token) {
  console.error("Set MAGE2_EDITOR_AUTOMATION_TOKEN to the token printed by the editor automation bridge.");
  process.exit(1);
}

const commandText = process.argv.slice(2).join(" ").trim() || (await readStdin()).trim();
if (!commandText) {
  console.error('Pass a JSON command, for example: node scripts/editor-command.mjs "{\\"command\\":\\"ping\\"}"');
  process.exit(1);
}

let command;
try {
  command = JSON.parse(commandText);
} catch (error) {
  console.error(`Could not parse command JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const response = await fetch(`http://127.0.0.1:${port}/automation/command`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-mage2-automation-token": token
  },
  body: JSON.stringify(command)
});

const body = await response.json().catch(() => undefined);
if (!response.ok || !body?.ok) {
  console.error(JSON.stringify(body ?? { ok: false, status: response.status }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(body.value, null, 2));

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
