import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 3;

export const AssetKindSchema = z.enum(["video", "image", "audio"]);

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({
    type: z.literal("flagEquals"),
    flag: z.string().min(1),
    value: z.boolean()
  }),
  z.object({
    type: z.literal("inventoryHas"),
    itemId: z.string().min(1)
  }),
  z.object({
    type: z.literal("sceneVisited"),
    sceneId: z.string().min(1)
  })
]);

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setFlag"),
    flag: z.string().min(1),
    value: z.boolean()
  }),
  z.object({
    type: z.literal("addItem"),
    itemId: z.string().min(1)
  }),
  z.object({
    type: z.literal("removeItem"),
    itemId: z.string().min(1)
  }),
  z.object({
    type: z.literal("goToScene"),
    sceneId: z.string().min(1)
  }),
  z.object({
    type: z.literal("playDialogue"),
    dialogueTreeId: z.string().min(1)
  })
]);

export const SubtitleCueSchema = z.object({
  id: z.string().min(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  text: z.string()
});

export const SubtitleTrackSchema = z.object({
  id: z.string().min(1),
  cues: z.array(SubtitleCueSchema).default([])
});

export const HotspotPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

export const HotspotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  labelTextId: z.string().min(1),
  commentTextId: z.string().min(1).optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
  polygon: z.array(HotspotPointSchema).length(4).optional(),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  targetSceneId: z.string().optional(),
  dialogueTreeId: z.string().optional(),
  requiredItemIds: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([])
});

export const SceneSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  backgroundAssetId: z.string().min(1),
  backgroundVideoLoop: z.boolean().default(false),
  hotspots: z.array(HotspotSchema).default([]),
  subtitleTracks: z.array(SubtitleTrackSchema).default([]),
  dialogueTreeIds: z.array(z.string()).default([]),
  overlayTextId: z.string().optional(),
  onEnterEffects: z.array(EffectSchema).default([]),
  onExitEffects: z.array(EffectSchema).default([])
});

export const LocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  descriptionTextId: z.string().optional(),
  x: z.number(),
  y: z.number(),
  sceneIds: z.array(z.string()).default([])
});

export const DialogueChoiceSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  nextNodeId: z.string().optional(),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([])
});

export const DialogueNodeSchema = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
  textId: z.string().min(1),
  nextNodeId: z.string().optional(),
  effects: z.array(EffectSchema).default([]),
  choices: z.array(DialogueChoiceSchema).default([])
});

export const DialogueTreeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startNodeId: z.string().min(1),
  nodes: z.array(DialogueNodeSchema)
});

export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  textId: z.string().min(1),
  descriptionTextId: z.string().optional()
});

export const AssetSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  name: z.string().min(1),
  sourcePath: z.string().min(1),
  importSourcePath: z.string().min(1).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  proxyPath: z.string().optional(),
  posterPath: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  codec: z.string().optional(),
  importedAt: z.string().min(1)
});

export const BuildSettingsSchema = z.object({
  outputDir: z.string().min(1).default("build"),
  includeSourceMap: z.boolean().default(false)
});

export const ProjectManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  defaultLanguage: z.string().min(1),
  engineVersion: z.string().min(1),
  assetRoots: z.array(z.string()).default([]),
  startLocationId: z.string().min(1),
  startSceneId: z.string().min(1),
  buildSettings: BuildSettingsSchema
});

export const SaveStateSchema = z.object({
  currentLocationId: z.string().min(1),
  currentSceneId: z.string().min(1),
  inventory: z.array(z.string()).default([]),
  flags: z.record(z.string(), z.boolean()).default({}),
  visitedSceneIds: z.array(z.string()).default([]),
  activeDialogueTreeId: z.string().optional(),
  activeDialogueNodeId: z.string().optional(),
  playheadMs: z.number().nonnegative().default(0)
});

export const BuildManifestSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  engineVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  startLocationId: z.string().min(1),
  startSceneId: z.string().min(1),
  contentPath: z.string().min(1),
  validationReportPath: z.string().min(1),
  assetMap: z.record(z.string(), z.string())
});

export const AssetManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  assets: z.array(AssetSchema).default([])
});

export const LocationFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(LocationSchema).default([])
});

export const SceneFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(SceneSchema).default([])
});

export const DialogueFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(DialogueTreeSchema).default([])
});

export const InventoryFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(InventoryItemSchema).default([])
});

export const StringTableSchema = z.object({
  schemaVersion: z.number().int().positive(),
  values: z.record(z.string(), z.string()).default({})
});

export const ProjectBundleSchema = z.object({
  manifest: ProjectManifestSchema,
  assets: AssetManifestSchema,
  locations: LocationFileSchema,
  scenes: SceneFileSchema,
  dialogues: DialogueFileSchema,
  inventory: InventoryFileSchema,
  strings: StringTableSchema
});

export type AssetKind = z.infer<typeof AssetKindSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;
export type HotspotPoint = z.infer<typeof HotspotPointSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueTree = z.infer<typeof DialogueTreeSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export type SaveState = z.infer<typeof SaveStateSchema>;
export type BuildManifest = z.infer<typeof BuildManifestSchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type LocationFile = z.infer<typeof LocationFileSchema>;
export type SceneFile = z.infer<typeof SceneFileSchema>;
export type DialogueFile = z.infer<typeof DialogueFileSchema>;
export type InventoryFile = z.infer<typeof InventoryFileSchema>;
export type StringTable = z.infer<typeof StringTableSchema>;
export type ProjectBundle = z.infer<typeof ProjectBundleSchema>;

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  entityId?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ExportProjectData {
  schemaVersion: number;
  manifest: ProjectManifest;
  assets: Asset[];
  locations: Location[];
  scenes: Scene[];
  dialogues: DialogueTree[];
  inventoryItems: InventoryItem[];
  strings: Record<string, string>;
}
