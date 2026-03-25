import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  await runNpmScript("build:packages");
  await runNpmScript("build:apps");

  if (process.platform !== "win32") {
    console.log("Skipping packaged Windows editor build on non-Windows host.");
    return;
  }

  console.log("Building packaged Windows editor artifacts...");
  await runNodeScript(path.join("scripts", "package-editor-win.mjs"));
}

async function runNpmScript(scriptName) {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    await runCommand(process.execPath, [npmExecPath, "run", scriptName]);
    return;
  }

  await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["run", scriptName]);
}

async function runNodeScript(scriptPath) {
  await runCommand(process.execPath, [scriptPath]);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}
