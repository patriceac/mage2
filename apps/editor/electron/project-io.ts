import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeFileSha256 } from "@mage2/media";
import {
  createDefaultProjectBundle,
  parseProjectBundle,
  type Asset,
  type AssetVariant,
  type ProjectBundle
} from "@mage2/schema";

const FILES = {
  manifest: "project.json",
  assets: "assets.json",
  locations: "locations.json",
  scenes: "scenes.json",
  dialogues: "dialogues.json",
  inventory: "inventory.json",
  strings: "strings.json"
} as const;

const STARTER_SCENE_ASSET_NAME = "starter-scene.svg";

export interface ProjectDirectoryInspection {
  isProjectDirectory: boolean;
  projectName?: string;
  reason?: string;
}

export async function loadProjectFromDirectory(projectDir: string): Promise<ProjectBundle> {
  const filePaths = resolveProjectFilePaths(projectDir);
  await access(filePaths.manifest);

  const rawBundle = {
    manifest: await readJson(filePaths.manifest),
    assets: await readJson(filePaths.assets),
    locations: await readJson(filePaths.locations),
    scenes: await readJson(filePaths.scenes),
    dialogues: await readJson(filePaths.dialogues),
    inventory: await readJson(filePaths.inventory),
    strings: await readJson(filePaths.strings)
  };

  return parseProjectBundle(rawBundle);
}

export async function inspectProjectDirectory(projectDir: string): Promise<ProjectDirectoryInspection> {
  const filePaths = resolveProjectFilePaths(projectDir);
  const requiredFileEntries = Object.values(filePaths);

  try {
    await Promise.all(requiredFileEntries.map((filePath) => access(filePath)));
  } catch {
    return {
      isProjectDirectory: false,
      reason: "This folder is missing one or more required MAGE2 project files."
    };
  }

  try {
    const rawBundle = {
      manifest: await readJson(filePaths.manifest),
      assets: await readJson(filePaths.assets),
      locations: await readJson(filePaths.locations),
      scenes: await readJson(filePaths.scenes),
      dialogues: await readJson(filePaths.dialogues),
      inventory: await readJson(filePaths.inventory),
      strings: await readJson(filePaths.strings)
    };

    const project = parseProjectBundle(rawBundle);
    return {
      isProjectDirectory: true,
      projectName: project.manifest.projectName
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isProjectDirectory: false,
      reason: `Project files were found, but they could not be loaded: ${message}`
    };
  }
}

export async function createProjectInDirectory(
  projectDir: string,
  projectName: string
): Promise<ProjectBundle> {
  const project = createDefaultProjectBundle(projectName);
  project.manifest.projectId = slugify(projectName);
  await seedStarterSceneAsset(projectDir, project);
  await saveProjectToDirectory(projectDir, project);
  return project;
}

export async function saveProjectToDirectory(
  projectDir: string,
  project: ProjectBundle
): Promise<ProjectBundle> {
  const normalized = parseProjectBundle(project);
  const filePaths = resolveProjectFilePaths(projectDir);

  await mkdir(projectDir, { recursive: true });
  await Promise.all([
    writeJson(filePaths.manifest, normalized.manifest),
    writeJson(filePaths.assets, normalized.assets),
    writeJson(filePaths.locations, normalized.locations),
    writeJson(filePaths.scenes, normalized.scenes),
    writeJson(filePaths.dialogues, normalized.dialogues),
    writeJson(filePaths.inventory, normalized.inventory),
    writeJson(filePaths.strings, normalized.strings)
  ]);

  return normalized;
}

function resolveProjectFilePaths(projectDir: string): Record<keyof typeof FILES, string> {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, fileName]) => [key, path.join(projectDir, fileName)])
  ) as Record<keyof typeof FILES, string>;
}

async function readJson(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "project_default";
}

async function seedStarterSceneAsset(projectDir: string, project: ProjectBundle): Promise<void> {
  const assetsDir = path.join(projectDir, "assets");
  const starterAssetPath = path.join(assetsDir, STARTER_SCENE_ASSET_NAME);
  const defaultLocale = project.manifest.defaultLanguage;

  await mkdir(assetsDir, { recursive: true });
  await writeFile(starterAssetPath, createStarterSceneSvg(), "utf8");

  const starterVariant: AssetVariant = {
    sourcePath: starterAssetPath,
    sha256: await computeFileSha256(starterAssetPath),
    importedAt: new Date().toISOString(),
    width: 1280,
    height: 720
  };
  const starterAsset: Asset = {
    id: "asset_placeholder",
    kind: "image",
    name: STARTER_SCENE_ASSET_NAME,
    variants: {
      [defaultLocale]: starterVariant
    }
  };

  const existingAssetIndex = project.assets.assets.findIndex((asset) => asset.id === starterAsset.id);
  if (existingAssetIndex >= 0) {
    project.assets.assets[existingAssetIndex] = starterAsset;
  } else {
    project.assets.assets.push(starterAsset);
  }

  if (!project.manifest.assetRoots.includes(assetsDir)) {
    project.manifest.assetRoots.push(assetsDir);
  }
}

function createStarterSceneSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" fill="none">
  <defs>
    <linearGradient id="bg" x1="640" y1="0" x2="640" y2="720" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#07101D"/>
      <stop offset="0.56" stop-color="#121E31"/>
      <stop offset="1" stop-color="#090C12"/>
    </linearGradient>
    <linearGradient id="wall" x1="0" y1="120" x2="1280" y2="430" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0E1727"/>
      <stop offset="0.5" stop-color="#1A2A3F"/>
      <stop offset="1" stop-color="#0E1727"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B2D43"/>
      <stop offset="1" stop-color="#122033"/>
    </linearGradient>
    <linearGradient id="floor" x1="640" y1="430" x2="640" y2="720" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E2532"/>
      <stop offset="0.45" stop-color="#111722"/>
      <stop offset="1" stop-color="#06080D"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#342928"/>
      <stop offset="0.48" stop-color="#523D35"/>
      <stop offset="1" stop-color="#211916"/>
    </linearGradient>
    <linearGradient id="woodDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2B2222"/>
      <stop offset="1" stop-color="#181214"/>
    </linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6E5A39"/>
      <stop offset="0.3" stop-color="#E2BE74"/>
      <stop offset="0.55" stop-color="#8D6D3E"/>
      <stop offset="1" stop-color="#3C2B19"/>
    </linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#38475A"/>
      <stop offset="1" stop-color="#202A36"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#284C67" stop-opacity="0.88"/>
      <stop offset="0.55" stop-color="#17354B" stop-opacity="0.74"/>
      <stop offset="1" stop-color="#102333" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="sky" x1="640" y1="84" x2="640" y2="404" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0C1830"/>
      <stop offset="0.52" stop-color="#183254"/>
      <stop offset="1" stop-color="#2C5164"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(744 164) rotate(90) scale(132)">
      <stop offset="0" stop-color="#F3E8BE" stop-opacity="0.96"/>
      <stop offset="0.28" stop-color="#BFD5D8" stop-opacity="0.44"/>
      <stop offset="1" stop-color="#7A9CB2" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lampGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(505 404) rotate(90) scale(78 118)">
      <stop offset="0" stop-color="#F4C870" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="#D79A43" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#D79A43" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="artifactGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1068 410) rotate(90) scale(110 110)">
      <stop offset="0" stop-color="#73D4D1" stop-opacity="0.58"/>
      <stop offset="0.35" stop-color="#F1B265" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#0F1725" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="windowPool" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(684 486) rotate(90) scale(145 278)">
      <stop offset="0" stop-color="#9EC8D5" stop-opacity="0.22"/>
      <stop offset="0.48" stop-color="#5D93AA" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#5D93AA" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="deviceCore" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(809 442) rotate(90) scale(44)">
      <stop offset="0" stop-color="#B6F0EA"/>
      <stop offset="0.35" stop-color="#5CC1BC"/>
      <stop offset="1" stop-color="#104B57"/>
    </radialGradient>
    <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D6EDF2" stop-opacity="0.3"/>
      <stop offset="0.7" stop-color="#8CB9CA" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#8CB9CA" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#786246"/>
      <stop offset="1" stop-color="#312418"/>
    </linearGradient>
    <clipPath id="windowClip">
      <path d="M492 404V178C492 120 551 92 640 92C729 92 788 120 788 178V404H492Z"/>
    </clipPath>
    <filter id="blur10" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="blur18" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="blur32" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="32"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000814" flood-opacity="0.5"/>
    </filter>
    <radialGradient id="vignette" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(640 330) rotate(90) scale(470 760)">
      <stop offset="0.7" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
    </radialGradient>
  </defs>

  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect y="78" width="1280" height="372" fill="url(#wall)"/>

  <path d="M56 430C98 320 216 228 356 198" stroke="#223752" stroke-opacity="0.28" stroke-width="2"/>
  <path d="M1224 430C1182 320 1064 228 924 198" stroke="#223752" stroke-opacity="0.28" stroke-width="2"/>
  <path d="M192 52C312 108 430 166 640 210C850 166 968 108 1088 52" stroke="#263B57" stroke-opacity="0.25" stroke-width="3"/>
  <path d="M266 20C382 92 500 158 640 198C780 158 898 92 1014 20" stroke="#435C78" stroke-opacity="0.18" stroke-width="2"/>

  <rect y="432" width="1280" height="288" fill="url(#floor)"/>
  <path d="M0 472L1280 472" stroke="#1D3149" stroke-opacity="0.65" stroke-width="3"/>
  <path d="M0 502H1280" stroke="#0C1521" stroke-width="3"/>

  <path d="M426 416V168C426 89 517 48 640 48C763 48 854 89 854 168V416" fill="#162437" stroke="#344C67" stroke-width="3"/>
  <path d="M447 416V170C447 103 527 70 640 70C753 70 833 103 833 170V416" fill="#223145" stroke="#556D85" stroke-opacity="0.5" stroke-width="2"/>
  <path d="M470 412V170C470 104 544 74 640 74C736 74 810 104 810 170V412" fill="#102033" stroke="#6985A0" stroke-opacity="0.36" stroke-width="2"/>
  <path d="M492 404V178C492 120 551 92 640 92C729 92 788 120 788 178V404H492Z" fill="url(#glass)"/>

  <g clip-path="url(#windowClip)">
    <rect x="492" y="92" width="296" height="312" fill="url(#sky)"/>
    <circle cx="744" cy="164" r="132" fill="url(#moonGlow)"/>
    <circle cx="734" cy="154" r="34" fill="#E8E1C6"/>
    <circle cx="726" cy="148" r="11" fill="#F2E8C8" opacity="0.4"/>
    <path d="M492 322C560 292 632 300 688 286C731 275 760 252 788 252V404H492Z" fill="#1C3449"/>
    <path d="M492 344C558 320 604 324 670 314C715 307 753 291 788 296V404H492Z" fill="#27475A"/>
    <path d="M492 366C550 352 598 354 650 348C705 342 744 332 788 338V404H492Z" fill="#325865"/>
    <path d="M540 114L560 196" stroke="#BCD0D7" stroke-opacity="0.18" stroke-width="3"/>
    <path d="M598 104L646 258" stroke="#EAF5FF" stroke-opacity="0.12" stroke-width="5"/>
    <path d="M664 94L730 280" stroke="#EAF5FF" stroke-opacity="0.1" stroke-width="6"/>
    <path d="M728 104L768 210" stroke="#EAF5FF" stroke-opacity="0.1" stroke-width="4"/>
    <g fill="#DCECF5" opacity="0.7">
      <circle cx="551" cy="128" r="1.5"/>
      <circle cx="594" cy="142" r="1.2"/>
      <circle cx="676" cy="126" r="1.4"/>
      <circle cx="704" cy="111" r="1.2"/>
      <circle cx="614" cy="168" r="1.1"/>
      <circle cx="783" cy="143" r="1.3"/>
      <circle cx="770" cy="185" r="1.2"/>
    </g>
  </g>

  <path d="M492 404V178C492 120 551 92 640 92C729 92 788 120 788 178V404" stroke="#A6BDD3" stroke-opacity="0.38" stroke-width="2"/>
  <path d="M640 92V404" stroke="#7C9AB5" stroke-opacity="0.45" stroke-width="4"/>
  <path d="M566 104V404" stroke="#7C9AB5" stroke-opacity="0.28" stroke-width="2"/>
  <path d="M714 104V404" stroke="#7C9AB5" stroke-opacity="0.28" stroke-width="2"/>
  <path d="M534 192H746" stroke="#6A89A4" stroke-opacity="0.32" stroke-width="2"/>
  <path d="M521 284H760" stroke="#6A89A4" stroke-opacity="0.26" stroke-width="2"/>

  <g opacity="0.55" filter="url(#blur32)">
    <path d="M566 188L640 186L916 720H760Z" fill="url(#shaft)"/>
    <path d="M640 180L712 182L1014 720H866Z" fill="url(#shaft)" opacity="0.7"/>
  </g>

  <rect x="54" y="164" width="242" height="372" rx="4" fill="url(#panel)"/>
  <rect x="984" y="164" width="242" height="372" rx="4" fill="url(#panel)"/>
  <path d="M66 176H284" stroke="#526C86" stroke-opacity="0.26" stroke-width="2"/>
  <path d="M996 176H1214" stroke="#526C86" stroke-opacity="0.26" stroke-width="2"/>
  <path d="M176 164V536" stroke="#5B7591" stroke-opacity="0.15" stroke-width="2"/>
  <path d="M1106 164V536" stroke="#5B7591" stroke-opacity="0.15" stroke-width="2"/>
  <path d="M54 536H1226" stroke="#455B74" stroke-opacity="0.35" stroke-width="2"/>

  <g filter="url(#softShadow)">
    <rect x="82" y="205" width="178" height="318" rx="4" fill="#182231" stroke="#5E7791" stroke-opacity="0.36" stroke-width="2"/>
    <rect x="95" y="218" width="152" height="292" rx="3" fill="url(#woodDark)"/>
    <rect x="111" y="236" width="120" height="109" rx="2" fill="#2A2020" stroke="#6B5745" stroke-opacity="0.32"/>
    <rect x="111" y="364" width="120" height="124" rx="2" fill="#2A2020" stroke="#6B5745" stroke-opacity="0.32"/>
    <path d="M239 359V371" stroke="url(#brass)" stroke-width="4" stroke-linecap="round"/>
    <circle cx="224" cy="365" r="5.5" fill="url(#brass)"/>
    <path d="M246 220H250V509H246" fill="#A88A55" opacity="0.2"/>
  </g>

  <g filter="url(#softShadow)">
    <rect x="950" y="172" width="220" height="356" rx="5" fill="#172130" stroke="#6C88A3" stroke-opacity="0.34" stroke-width="2"/>
    <rect x="964" y="186" width="192" height="328" rx="4" fill="#1F2B3D"/>
    <path d="M1060 186V514" stroke="#7D9AB5" stroke-opacity="0.32" stroke-width="2"/>
    <path d="M970 262H1150M970 338H1150M970 414H1150" stroke="#607C98" stroke-opacity="0.22" stroke-width="2"/>
    <rect x="970" y="192" width="84" height="316" fill="#1A2432"/>
    <rect x="1066" y="192" width="84" height="316" fill="#1A2432"/>
    <rect x="977" y="198" width="70" height="308" fill="#24324A" opacity="0.52"/>
    <rect x="1073" y="198" width="70" height="308" fill="#24324A" opacity="0.52"/>
    <g fill="#6D7F95" opacity="0.48">
      <rect x="988" y="208" width="13" height="48" rx="1"/>
      <rect x="1007" y="214" width="11" height="42" rx="1"/>
      <rect x="1023" y="202" width="17" height="54" rx="1"/>
      <rect x="1078" y="210" width="13" height="46" rx="1"/>
      <rect x="1096" y="204" width="16" height="52" rx="1"/>
      <rect x="1117" y="216" width="18" height="40" rx="1"/>
      <circle cx="1014" cy="302" r="22" fill="#56647A"/>
      <circle cx="1112" cy="302" r="18" fill="#56647A"/>
      <rect x="992" y="356" width="46" height="42" rx="2"/>
      <rect x="1088" y="350" width="42" height="48" rx="2"/>
      <circle cx="1012" cy="450" r="20" fill="#56647A"/>
      <rect x="1080" y="430" width="48" height="36" rx="2"/>
    </g>
    <path d="M970 192H1150V514H970" fill="none" stroke="#C7D8E5" stroke-opacity="0.08" stroke-width="3"/>
    <path d="M982 206L996 500" stroke="#D9E9F7" stroke-opacity="0.07" stroke-width="4"/>
    <path d="M1078 202L1092 510" stroke="#D9E9F7" stroke-opacity="0.05" stroke-width="5"/>
  </g>

  <ellipse cx="687" cy="506" rx="255" ry="76" fill="url(#windowPool)" filter="url(#blur18)"/>
  <path d="M120 720L640 452L1160 720" fill="#0B1119" opacity="0.6"/>
  <path d="M0 720L0 616L640 462L1280 616V720" fill="#0A0F16" opacity="0.44"/>
  <path d="M198 720L640 488L1082 720" stroke="#2A3E57" stroke-opacity="0.22" stroke-width="2"/>
  <path d="M348 720L640 532L932 720" stroke="#2A3E57" stroke-opacity="0.14" stroke-width="2"/>
  <ellipse cx="622" cy="630" rx="252" ry="72" stroke="#35506C" stroke-opacity="0.18" stroke-width="2"/>
  <ellipse cx="622" cy="630" rx="182" ry="48" stroke="#35506C" stroke-opacity="0.12" stroke-width="1.5"/>

  <g filter="url(#softShadow)">
    <path d="M310 446H612L590 596H332Z" fill="url(#woodDark)"/>
    <path d="M330 430H598L620 446H310Z" fill="url(#wood)"/>
    <rect x="342" y="448" width="108" height="138" rx="4" fill="#2A2122" stroke="#735643" stroke-opacity="0.28"/>
    <rect x="466" y="448" width="112" height="138" rx="4" fill="#2A2122" stroke="#735643" stroke-opacity="0.28"/>
    <path d="M454 448V586" stroke="#765942" stroke-opacity="0.2"/>
    <path d="M520 448V586" stroke="#765942" stroke-opacity="0.2"/>
    <circle cx="420" cy="514" r="4" fill="url(#brass)"/>
    <circle cx="505" cy="514" r="4" fill="url(#brass)"/>
    <circle cx="545" cy="514" r="4" fill="url(#brass)"/>
    <path d="M348 442H584" stroke="#A47A52" stroke-opacity="0.24" stroke-width="2"/>
    <ellipse cx="470" cy="434" rx="92" ry="18" fill="#1B1A1F" opacity="0.6"/>
  </g>

  <ellipse cx="500" cy="404" rx="120" ry="76" fill="url(#lampGlow)" filter="url(#blur18)"/>
  <g filter="url(#softShadow)">
    <ellipse cx="490" cy="432" rx="75" ry="14" fill="#19171B" opacity="0.62"/>
    <rect x="468" y="416" width="8" height="22" rx="3" fill="url(#brass)"/>
    <path d="M472 418C484 392 494 372 510 348" stroke="url(#brass)" stroke-width="5" stroke-linecap="round"/>
    <path d="M510 348C524 343 542 344 554 354" stroke="url(#brass)" stroke-width="4" stroke-linecap="round"/>
    <path d="M546 352L568 372C566 381 560 387 552 390L528 371C530 362 536 356 546 352Z" fill="url(#shade)" stroke="#AF8958" stroke-opacity="0.45"/>
    <path d="M530 371H553" stroke="#F0C36F" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>
    <rect x="392" y="411" width="42" height="12" rx="2" fill="#5B3F31"/>
    <rect x="398" y="401" width="26" height="10" rx="1.5" fill="#7A6046"/>
    <circle cx="576" cy="420" r="16" fill="#27394D" stroke="#9C7B4F" stroke-opacity="0.45" stroke-width="2"/>
    <path d="M566 420H586M576 410V430" stroke="#C9D6DD" stroke-opacity="0.5" stroke-width="1.5"/>
  </g>

  <g filter="url(#softShadow)">
    <path d="M720 452H898L916 520H702Z" fill="#182333"/>
    <path d="M730 434H888L898 452H720Z" fill="#2A3B4D"/>
    <rect x="742" y="452" width="134" height="74" rx="4" fill="#1A2433" stroke="#6E879E" stroke-opacity="0.25"/>
    <circle cx="809" cy="442" r="40" fill="#172230" stroke="url(#brass)" stroke-width="4"/>
    <circle cx="809" cy="442" r="30" fill="url(#deviceCore)"/>
    <ellipse cx="809" cy="442" rx="58" ry="22" fill="none" stroke="url(#brass)" stroke-width="4"/>
    <path d="M767 442H851" stroke="#E7C27C" stroke-opacity="0.7" stroke-width="2"/>
    <path d="M809 402V482" stroke="#E7C27C" stroke-opacity="0.55" stroke-width="2"/>
    <circle cx="773" cy="492" r="8" fill="#2E445E" stroke="url(#brass)" stroke-width="2"/>
    <circle cx="809" cy="492" r="8" fill="#2E445E" stroke="url(#brass)" stroke-width="2"/>
    <circle cx="845" cy="492" r="8" fill="#2E445E" stroke="url(#brass)" stroke-width="2"/>
    <path d="M760 526C748 550 746 566 752 598" stroke="#26384D" stroke-width="5" stroke-linecap="round"/>
    <path d="M860 526C874 545 885 565 892 595" stroke="#26384D" stroke-width="5" stroke-linecap="round"/>
    <path d="M780 456C792 467 807 470 826 464" stroke="#D5F2F0" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round"/>
  </g>

  <ellipse cx="1068" cy="412" rx="110" ry="104" fill="url(#artifactGlow)" filter="url(#blur18)"/>
  <g filter="url(#softShadow)">
    <path d="M1002 432H1136L1154 604H984Z" fill="url(#stone)"/>
    <path d="M1016 414H1122L1136 432H1002Z" fill="#4A5B6C"/>
    <rect x="1024" y="444" width="90" height="128" rx="5" fill="#233142"/>
    <path d="M1040 470H1098" stroke="#6A8199" stroke-opacity="0.3" stroke-width="2"/>
    <path d="M1040 500H1098" stroke="#6A8199" stroke-opacity="0.3" stroke-width="2"/>
    <path d="M1040 530H1098" stroke="#6A8199" stroke-opacity="0.3" stroke-width="2"/>
    <path d="M1068 356L1098 386L1068 416L1038 386Z" fill="#6AD0CB" fill-opacity="0.38" stroke="#DCC38A" stroke-opacity="0.65" stroke-width="2"/>
    <path d="M1068 344L1092 356V386L1068 374L1044 386V356Z" fill="#F2B566" fill-opacity="0.22" stroke="#C69A57" stroke-opacity="0.48"/>
    <ellipse cx="1068" cy="386" rx="44" ry="12" fill="none" stroke="url(#brass)" stroke-width="3" opacity="0.9"/>
    <circle cx="1068" cy="386" r="6" fill="#F3C371"/>
  </g>

  <ellipse cx="1070" cy="613" rx="74" ry="20" fill="#0A0F15" opacity="0.68"/>
  <ellipse cx="806" cy="606" rx="102" ry="22" fill="#091018" opacity="0.56"/>
  <ellipse cx="470" cy="600" rx="170" ry="25" fill="#091018" opacity="0.45"/>

  <path d="M152 458C220 470 274 498 330 538" stroke="#7AB1C0" stroke-opacity="0.1" stroke-width="6" stroke-linecap="round" filter="url(#blur10)"/>
  <path d="M664 452C794 458 910 482 1032 554" stroke="#A4CAD2" stroke-opacity="0.08" stroke-width="10" stroke-linecap="round" filter="url(#blur10)"/>
  <path d="M70 640C116 614 160 598 212 590" stroke="#183149" stroke-width="8" stroke-linecap="round"/>

  <g fill="#CFE7EC" opacity="0.16" filter="url(#blur10)">
    <circle cx="598" cy="320" r="6"/>
    <circle cx="640" cy="280" r="4"/>
    <circle cx="704" cy="336" r="5"/>
    <circle cx="754" cy="294" r="3"/>
  </g>

  <g opacity="0.92">
    <path d="M0 720V546C58 526 92 524 146 540C124 586 112 646 112 720Z" fill="#04070B"/>
    <path d="M88 720C86 648 96 594 120 542C148 490 194 474 250 476C208 520 180 586 174 720Z" fill="#0A1018"/>
    <path d="M1280 720V562C1224 540 1186 538 1136 552C1160 594 1172 652 1172 720Z" fill="#04070B"/>
    <path d="M1190 720C1186 644 1176 594 1150 552C1126 506 1082 490 1024 490C1066 532 1096 598 1102 720Z" fill="#091019"/>
    <path d="M1140 74C1128 124 1124 160 1126 214" stroke="#0A1118" stroke-width="6" stroke-linecap="round"/>
    <path d="M1144 212C1154 224 1164 244 1168 272" stroke="#0A1118" stroke-width="5" stroke-linecap="round"/>
  </g>

  <rect width="1280" height="720" fill="url(#vignette)"/>
</svg>
`;
}
