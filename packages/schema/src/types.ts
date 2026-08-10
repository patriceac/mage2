import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 16;
export const CURRENT_SAVE_ENVELOPE_VERSION = 2;
export const SAVE_ENVELOPE_FORMAT = "mage2-save";

export const AssetKindSchema = z.enum(["video", "image", "audio"]);
export const AssetCategorySchema = z.enum(["background", "inventory", "sceneAudio", "foreground", "response", "player"]);
export const VideoAudioModeSchema = z.enum(["embedded", "external", "silent"]);
export const LocationIconSchema = z.enum(["mapPin", "settlement", "forest", "castle", "mine", "coast", "crystal", "mountain"]);

export const GameVariableValueSchema = z.union([z.boolean(), z.number().int(), z.string()]);
export const GameVariableChoiceOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});
export const GameVariableDefinitionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    type: z.literal("boolean"),
    initialValue: z.boolean().default(false),
    system: z.boolean().default(false)
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    type: z.literal("integer"),
    initialValue: z.number().int().default(0),
    system: z.boolean().default(false)
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    type: z.literal("choice"),
    options: z.array(GameVariableChoiceOptionSchema).min(2),
    initialValue: z.string().min(1),
    system: z.boolean().default(false)
  })
]);
export const VariableComparisonOperatorSchema = z.enum([
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual"
]);
export const ConditionMatchModeSchema = z.enum(["all", "any"]);

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({
    type: z.literal("variableCompare"),
    variableId: z.string().min(1),
    operator: VariableComparisonOperatorSchema.default("equals"),
    value: GameVariableValueSchema
  }),
  z.object({
    type: z.literal("inventoryHas"),
    itemId: z.string().min(1),
    present: z.boolean().optional()
  }),
  z.object({
    type: z.literal("sceneVisited"),
    sceneId: z.string().min(1),
    visited: z.boolean().optional()
  })
]);

export type Effect =
  | { type: "setVariable"; variableId: string; value: GameVariableValue }
  | { type: "changeVariable"; variableId: string; delta: number }
  | { type: "addItem"; itemId: string }
  | { type: "removeItem"; itemId: string }
  | { type: "goToScene"; sceneId: string }
  | { type: "playDialogue"; dialogueTreeId: string }
  | {
      type: "conditional";
      conditionMode: ConditionMatchMode;
      conditions: Condition[];
      thenEffects: Effect[];
      elseEffects: Effect[];
    };

export const EffectSchema: z.ZodType<Effect, unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("setVariable"),
      variableId: z.string().min(1),
      value: GameVariableValueSchema
    }),
    z.object({
      type: z.literal("changeVariable"),
      variableId: z.string().min(1),
      delta: z.number().int()
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
    }),
    z.object({
      type: z.literal("conditional"),
      conditionMode: ConditionMatchModeSchema.default("all"),
      conditions: z.array(ConditionSchema).default([]),
      thenEffects: z.array(EffectSchema).default([]),
      elseEffects: z.array(EffectSchema).default([])
    })
  ])
);

export const ResponseSelectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("entry"),
    entryId: z.string().min(1)
  }),
  z.object({
    type: z.literal("group"),
    groupId: z.string().min(1)
  })
]);

export const HotspotEventSchema = z.object({
  targetSceneId: z.string().min(1).optional(),
  dialogueTreeId: z.string().min(1).optional(),
  response: ResponseSelectionSchema.optional(),
  effects: z.array(EffectSchema).default([])
});

export const HotspotPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

const EditableHotspotPolygonSchema = z
  .array(HotspotPointSchema)
  .refine((points) => points.length === 4 || points.length === 8, "Expected 4 or 8 polygon points");

export const HotspotTimingModeSchema = z.enum(["fixed", "sceneDuration"]);

export const PlacedInventoryGeometrySchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
  polygon: z.array(HotspotPointSchema).length(4).optional()
});

export const HotspotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  commentTextId: z.string().min(1).optional(),
  inventoryItemId: z.string().min(1).optional(),
  placedInventoryItemId: z.string().min(1).optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
  polygon: EditableHotspotPolygonSchema.optional(),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  timingMode: HotspotTimingModeSchema.default("fixed"),
  targetSceneId: z.string().optional(),
  dialogueTreeId: z.string().optional(),
  mediaAssetId: z.string().min(1).optional(),
  response: ResponseSelectionSchema.optional(),
  clickEvent: HotspotEventSchema.optional(),
  otherItemEvent: HotspotEventSchema.optional(),
  conditionMode: ConditionMatchModeSchema.optional(),
  conditions: z.array(ConditionSchema).default([]),
  placedInventoryGeometry: PlacedInventoryGeometrySchema.optional(),
  effects: z.array(EffectSchema).default([])
});

export const SceneSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  backgroundAssetId: z.string().min(1).optional(),
  sceneAudioAssetId: z.string().min(1).optional(),
  sceneAudioLoop: z.boolean().default(true),
  sceneAudioDelayMs: z.number().nonnegative().default(0),
  backgroundVideoLoop: z.boolean().default(false),
  videoAudioMode: VideoAudioModeSchema.default("silent"),
  hotspots: z.array(HotspotSchema).default([]),
  dialogueTreeIds: z.array(z.string()).default([]),
  onEnterEffects: z.array(EffectSchema).default([]),
  onExitEffects: z.array(EffectSchema).default([]),
  onMediaEndEffects: z.array(EffectSchema).default([])
});

export const LocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  descriptionTextId: z.string().optional(),
  icon: LocationIconSchema.optional(),
  x: z.number(),
  y: z.number(),
  sceneIds: z.array(z.string()).default([])
});

export const DialogueChoiceSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  nextNodeId: z.string().optional(),
  conditionMode: ConditionMatchModeSchema.optional(),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([])
});

export const DialogueNodeSchema = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
  textId: z.string().min(1),
  mediaAssetId: z.string().min(1).optional(),
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

export const ResponseEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("text"),
    textId: z.string().min(1)
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("audio"),
    assetId: z.string().min(1).optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("video"),
    assetId: z.string().min(1).optional()
  })
]);

export const ResponseGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  entries: z.array(ResponseEntrySchema).default([])
});

export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  textId: z.string().min(1),
  descriptionTextId: z.string().optional(),
  imageAssetId: z.string().min(1).optional()
});

export const AssetVariantSchema = z.object({
  sourcePath: z.string().min(1),
  importSourcePath: z.string().min(1).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  proxyPath: z.string().optional(),
  posterPath: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  codec: z.string().optional(),
  hasAudio: z.boolean().optional(),
  audioCodec: z.string().optional(),
  importedAt: z.string().min(1)
});

export const AssetProvenanceSchema = z.object({
  source: z.enum(["creator", "starter-kit", "demo"]),
  packId: z.string().min(1).optional(),
  packVersion: z.number().int().positive().optional()
});

export const StringTranslationStateSchema = z.enum(["inherited", "draft", "translated", "reviewed"]);

export const AssetSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  name: z.string().min(1),
  category: AssetCategorySchema.optional(),
  provenance: AssetProvenanceSchema.optional(),
  variants: z.record(z.string(), AssetVariantSchema).default({})
});

export const BuildSettingsSchema = z.object({
  outputDir: z.string().min(1).default("build"),
  includeSourceMap: z.boolean().default(false)
});

export const DEFAULT_PLAYER_PRESENTATION = {
  titleScreenEnabled: true,
  titleLayout: "left",
  overlayTone: "dark",
  fontPreset: "cinematic",
  accentColor: "#e0b56a",
  creatorName: "",
  websiteUrl: "",
  showLandscapeHintInPortrait: true
} as const;

export const PlayerPresentationSchema = z.object({
  titleScreenEnabled: z.boolean().default(true),
  titleBackgroundAssetId: z.string().min(1).optional(),
  logoAssetId: z.string().min(1).optional(),
  appIconAssetId: z.string().min(1).optional(),
  titleLayout: z.enum(["left", "center"]).default("left"),
  overlayTone: z.enum(["dark", "light"]).default("dark"),
  fontPreset: z.enum(["cinematic", "modern", "classic"]).default("cinematic"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#e0b56a"),
  creatorName: z.string().max(120).default(""),
  websiteUrl: z.string().max(2048).default(""),
  taglineTextId: z.string().min(1).optional(),
  creditsTextId: z.string().min(1).optional(),
  showLandscapeHintInPortrait: z.boolean().default(true),
  starterKitId: z.string().min(1).optional(),
  starterKitVersion: z.number().int().positive().optional()
});

export const ProjectManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  defaultLanguage: z.string().min(1),
  supportedLocales: z.array(z.string().min(1)).default([]),
  engineVersion: z.string().min(1),
  gameVersion: z.string().min(1).default("1.0.0"),
  saveCompatibilityVersion: z.number().int().positive().default(1),
  variables: z.array(GameVariableDefinitionSchema).default([]),
  assetRoots: z.array(z.string()).default([]),
  startLocationId: z.string().min(1),
  startSceneId: z.string().min(1),
  playerPresentation: PlayerPresentationSchema.default(DEFAULT_PLAYER_PRESENTATION),
  buildSettings: BuildSettingsSchema
});

export const SaveStateSchema = z.object({
  currentLocationId: z.string().min(1),
  currentSceneId: z.string().min(1),
  inventory: z.array(z.string()).default([]),
  flags: z.record(z.string(), z.boolean()).default({}),
  variables: z.record(z.string(), GameVariableValueSchema).default({}),
  visitedSceneIds: z.array(z.string()).default([]),
  activeDialogueTreeId: z.string().optional(),
  activeDialogueNodeId: z.string().optional(),
  playheadMs: z.number().nonnegative().default(0)
});

export const ProjectContentIdentitySchema = z.object({
  projectId: z.string().min(1),
  contentId: z.string().min(1),
  saveCompatibilityVersion: z.number().int().positive()
});

export const SaveEnvelopeSchema = z.object({
  format: z.literal(SAVE_ENVELOPE_FORMAT),
  version: z.number().int().positive(),
  identity: ProjectContentIdentitySchema,
  savedAt: z.string().min(1),
  state: SaveStateSchema
});

export const BuildManifestSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  engineVersion: z.string().min(1),
  gameVersion: z.string().min(1).default("1.0.0"),
  saveCompatibilityVersion: z.number().int().positive().default(1),
  generatedAt: z.string().min(1),
  startLocationId: z.string().min(1),
  startSceneId: z.string().min(1),
  contentPath: z.string().min(1),
  validationReportPath: z.string().min(1),
  assetMap: z.record(z.string(), z.record(z.string(), z.string()))
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
  items: z.array(DialogueTreeSchema).default([]),
  responseGroups: z.array(ResponseGroupSchema).default([]),
  starterResponsesVersion: z.number().int().nonnegative().default(0)
});

export const InventoryFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(InventoryItemSchema).default([])
});

export const StringTableSchema = z.object({
  schemaVersion: z.number().int().positive(),
  byLocale: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  translationStateByLocale: z
    .record(z.string(), z.record(z.string(), StringTranslationStateSchema))
    .default({})
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
export type AssetCategory = z.infer<typeof AssetCategorySchema>;
export type VideoAudioMode = z.infer<typeof VideoAudioModeSchema>;
export type LocationIcon = z.infer<typeof LocationIconSchema>;
export type GameVariableValue = z.infer<typeof GameVariableValueSchema>;
export type GameVariableChoiceOption = z.infer<typeof GameVariableChoiceOptionSchema>;
export type GameVariableDefinition = z.infer<typeof GameVariableDefinitionSchema>;
export type VariableComparisonOperator = z.infer<typeof VariableComparisonOperatorSchema>;
export type ConditionMatchMode = z.infer<typeof ConditionMatchModeSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type ResponseSelection = z.infer<typeof ResponseSelectionSchema>;
export type HotspotPoint = z.infer<typeof HotspotPointSchema>;
export type HotspotTimingMode = z.infer<typeof HotspotTimingModeSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type HotspotEvent = z.infer<typeof HotspotEventSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueTree = z.infer<typeof DialogueTreeSchema>;
export type ResponseEntry = z.infer<typeof ResponseEntrySchema>;
export type ResponseGroup = z.infer<typeof ResponseGroupSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type AssetVariant = z.infer<typeof AssetVariantSchema>;
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type StringTranslationState = z.infer<typeof StringTranslationStateSchema>;
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export type PlayerPresentation = z.infer<typeof PlayerPresentationSchema>;
export type SaveState = z.infer<typeof SaveStateSchema>;
export type ProjectContentIdentity = z.infer<typeof ProjectContentIdentitySchema>;
export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
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
  locale?: string;
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
  responseGroups?: ResponseGroup[];
  starterResponsesVersion?: number;
  inventoryItems: InventoryItem[];
  strings: Record<string, Record<string, string>>;
  playerUiOverrides?: import("./player-experience").PlayerUiOverrides;
}
