import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const WINDOWS_PLAYER_LAUNCHER_NAME = "MAGE2 Player.exe";
export const WINDOWS_PLAYER_RUNTIME_DIRECTORY = "runtime";
export const WINDOWS_PLAYER_RUNTIME_EXECUTABLE = "MAGE2 Player.exe";

export function resolveWindowsFrameworkCompiler(environment = process.env) {
  const windowsDirectory = environment.WINDIR || environment.SystemRoot;
  if (!windowsDirectory) {
    throw new Error("Cannot compile the Windows player launcher because WINDIR is unavailable.");
  }
  const candidates = [
    path.join(windowsDirectory, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windowsDirectory, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
  ];
  const compilerPath = candidates.find((candidate) => existsSync(candidate));
  if (!compilerPath) {
    throw new Error("The .NET Framework C# compiler required for the Windows player launcher is unavailable.");
  }
  return compilerPath;
}

export function windowsPlayerLauncherCompilerArguments({
  sourcePath,
  manifestPath,
  iconPath,
  outputPath
}) {
  return [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/optimize+",
    `/out:${outputPath}`,
    `/win32manifest:${manifestPath}`,
    `/win32icon:${iconPath}`,
    "/reference:System.dll",
    "/reference:System.Core.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Web.Extensions.dll",
    "/reference:System.Windows.Forms.dll",
    sourcePath
  ];
}

export async function compileWindowsPlayerLauncher({
  sourceDirectory,
  outputDirectory,
  iconPath,
  environment = process.env
}) {
  const sourcePath = path.join(sourceDirectory, "Program.cs");
  const manifestPath = path.join(sourceDirectory, "app.manifest");
  for (const requiredPath of [sourcePath, manifestPath, iconPath]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Windows player launcher input is missing: ${requiredPath}`);
    }
  }
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, WINDOWS_PLAYER_LAUNCHER_NAME);
  const compilerPath = resolveWindowsFrameworkCompiler(environment);
  const result = spawnSync(
    compilerPath,
    windowsPlayerLauncherCompilerArguments({ sourcePath, manifestPath, iconPath, outputPath }),
    { encoding: "utf8", windowsHide: true, timeout: 120_000 }
  );
  if (result.status !== 0 || !existsSync(outputPath)) {
    throw new Error(
      `Windows player launcher compilation failed. ${result.stderr || result.stdout || result.error?.message || "Unknown compiler error."}`
    );
  }
  return outputPath;
}

export async function arrangeWindowsPlayerDistribution({
  unpackedDirectory,
  launcherExecutablePath,
  packagedRuntimeExecutableName = WINDOWS_PLAYER_RUNTIME_EXECUTABLE,
  rootLauncherName = WINDOWS_PLAYER_LAUNCHER_NAME
}) {
  const runtimeDirectory = path.join(unpackedDirectory, WINDOWS_PLAYER_RUNTIME_DIRECTORY);
  if (existsSync(runtimeDirectory)) {
    throw new Error(`Windows player runtime directory already exists: ${runtimeDirectory}`);
  }
  const packagedRuntimeExecutablePath = path.join(unpackedDirectory, packagedRuntimeExecutableName);
  if (!existsSync(packagedRuntimeExecutablePath)) {
    throw new Error(`Packaged Electron player executable is missing: ${packagedRuntimeExecutablePath}`);
  }
  if (!existsSync(launcherExecutablePath)) {
    throw new Error(`Compiled Windows player launcher is missing: ${launcherExecutablePath}`);
  }

  const entries = await readdir(unpackedDirectory, { withFileTypes: true });
  await mkdir(runtimeDirectory);
  for (const entry of entries) {
    await rename(
      path.join(unpackedDirectory, entry.name),
      path.join(runtimeDirectory, entry.name)
    );
  }
  if (packagedRuntimeExecutableName !== WINDOWS_PLAYER_RUNTIME_EXECUTABLE) {
    await rename(
      path.join(runtimeDirectory, packagedRuntimeExecutableName),
      path.join(runtimeDirectory, WINDOWS_PLAYER_RUNTIME_EXECUTABLE)
    );
  }
  await cp(launcherExecutablePath, path.join(unpackedDirectory, rootLauncherName), {
    force: false,
    errorOnExist: true
  });
  return {
    launcherPath: path.join(unpackedDirectory, rootLauncherName),
    runtimeDirectory,
    runtimeExecutablePath: path.join(runtimeDirectory, WINDOWS_PLAYER_RUNTIME_EXECUTABLE)
  };
}
