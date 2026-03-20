import type {
  DialogueChoice,
  DialogueNode,
  Hotspot,
  InventoryItem,
  Location,
  ProjectBundle,
  Scene,
  SubtitleCue,
  SubtitleTrack,
  ValidationIssue
} from "@mage2/schema";
import type { EditorNavigationTarget } from "./navigation-target";

export type ProjectTextUsageKind =
  | "hotspotComment"
  | "subtitleCue"
  | "dialogueLine"
  | "dialogueChoice"
  | "inventoryName"
  | "inventoryDescription";

export type ProjectTextEntryStatus = "missing" | "referenced" | "orphaned";
export type ProjectTextArea = "scenes" | "dialogue" | "inventory" | "subtitles";
export type ProjectTextStatusFilter = "all" | ProjectTextEntryStatus;
export type ProjectTextAreaFilter = "all" | ProjectTextArea;
export type ProjectTextSortOption = "status" | "textId" | "mostUses";

export interface ProjectTextUsage {
  textId: string;
  kind: ProjectTextUsageKind;
  ownerId: string;
  ownerLabel: string;
  navigation: EditorNavigationTarget;
}

export interface ProjectTextEntry {
  textId: string;
  value: string;
  status: ProjectTextEntryStatus;
  usages: ProjectTextUsage[];
}

export interface ProjectTextViewOptions {
  search: string;
  status: ProjectTextStatusFilter;
  area: ProjectTextAreaFilter;
  sort: ProjectTextSortOption;
}

const ISSUE_KIND_MAP: Partial<Record<ValidationIssue["code"], ProjectTextUsageKind>> = {
  HOTSPOT_COMMENT_TEXT_MISSING: "hotspotComment",
  SUBTITLE_TEXT_MISSING: "subtitleCue",
  SUBTITLE_TEXT_EMPTY: "subtitleCue",
  DIALOGUE_TEXT_MISSING: "dialogueLine",
  DIALOGUE_CHOICE_TEXT_MISSING: "dialogueChoice",
  INVENTORY_NAME_TEXT_MISSING: "inventoryName",
  INVENTORY_DESCRIPTION_TEXT_MISSING: "inventoryDescription"
};

const STATUS_ORDER: Record<ProjectTextEntryStatus, number> = {
  missing: 0,
  referenced: 1,
  orphaned: 2
};

export function collectProjectTextUsages(project: ProjectBundle): ProjectTextUsage[] {
  const usages: ProjectTextUsage[] = [];

  for (const scene of project.scenes.items) {
    for (const [trackIndex, track] of scene.subtitleTracks.entries()) {
      for (const [cueIndex, cue] of track.cues.entries()) {
        usages.push({
          textId: cue.textId,
          kind: "subtitleCue",
          ownerId: cue.id,
          ownerLabel: `${scene.name} / Track ${trackIndex + 1} / Cue ${cueIndex + 1}`,
          navigation: {
            label: `${scene.name} subtitles`,
            tab: "scenes",
            locationId: scene.locationId,
            sceneId: scene.id
          }
        });
      }
    }

    for (const hotspot of scene.hotspots) {
      if (hotspot.commentTextId) {
        usages.push({
          textId: hotspot.commentTextId,
          kind: "hotspotComment",
          ownerId: hotspot.id,
          ownerLabel: `${scene.name} / ${hotspot.name}`,
          navigation: {
            label: hotspot.name,
            tab: "scenes",
            locationId: scene.locationId,
            sceneId: scene.id,
            hotspotId: hotspot.id
          }
        });
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      usages.push({
        textId: node.textId,
        kind: "dialogueLine",
        ownerId: node.id,
        ownerLabel: `${dialogue.name} / ${node.id}`,
        navigation: {
          label: `${dialogue.name} / ${node.id}`,
          tab: "dialogue",
          dialogueId: dialogue.id,
          dialogueNodeId: node.id
        }
      });

      for (const choice of node.choices) {
        usages.push({
          textId: choice.textId,
          kind: "dialogueChoice",
          ownerId: choice.id,
          ownerLabel: `${dialogue.name} / ${node.id}`,
          navigation: {
            label: `${dialogue.name} / ${node.id}`,
            tab: "dialogue",
            dialogueId: dialogue.id,
            dialogueNodeId: node.id
          }
        });
      }
    }
  }

  for (const item of project.inventory.items) {
    usages.push({
      textId: item.textId,
      kind: "inventoryName",
      ownerId: item.id,
      ownerLabel: item.name,
      navigation: {
        label: item.name,
        tab: "inventory",
        inventoryItemId: item.id
      }
    });

    if (item.descriptionTextId) {
      usages.push({
        textId: item.descriptionTextId,
        kind: "inventoryDescription",
        ownerId: item.id,
        ownerLabel: item.name,
        navigation: {
          label: item.name,
          tab: "inventory",
          inventoryItemId: item.id
        }
      });
    }
  }

  return usages;
}

export function collectProjectTextEntries(project: ProjectBundle): ProjectTextEntry[] {
  const usages = collectProjectTextUsages(project);
  const usagesByTextId = new Map<string, ProjectTextUsage[]>();

  for (const usage of usages) {
    const entryUsages = usagesByTextId.get(usage.textId);
    if (entryUsages) {
      entryUsages.push(usage);
    } else {
      usagesByTextId.set(usage.textId, [usage]);
    }
  }

  const excludedTextIds = collectExcludedProjectTextIds(project);
  const storedTextIds = Object.keys(project.strings.values).filter(
    (textId) => !excludedTextIds.has(textId) && !matchesExcludedLegacyProjectTextPattern(textId)
  );
  const textIds = new Set<string>([...storedTextIds, ...usagesByTextId.keys()]);

  return [...textIds]
    .map((textId) => {
      const entryUsages = usagesByTextId.get(textId) ?? [];
      const exists = Object.prototype.hasOwnProperty.call(project.strings.values, textId);
      const status: ProjectTextEntryStatus =
        entryUsages.length === 0 ? "orphaned" : exists ? "referenced" : "missing";

      return {
        textId,
        value: exists ? project.strings.values[textId] : "",
        status,
        usages: entryUsages
      };
    })
    .sort((left, right) => {
      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDifference !== 0) {
        return statusDifference;
      }

      return left.textId.localeCompare(right.textId);
    });
}

export function resolveProjectTextUsageForIssue(
  project: ProjectBundle,
  issue: ValidationIssue
): ProjectTextUsage | undefined {
  if (!issue.entityId) {
    return undefined;
  }

  const expectedKind = ISSUE_KIND_MAP[issue.code];
  if (!expectedKind) {
    return undefined;
  }

  return collectProjectTextUsages(project).find(
    (usage) => usage.ownerId === issue.entityId && usage.kind === expectedKind
  );
}

export function getProjectTextStatusLabel(status: ProjectTextEntryStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "referenced":
      return "Referenced";
    case "orphaned":
      return "Orphaned";
  }
}

export function resolveProjectTextArea(kind: ProjectTextUsageKind): ProjectTextArea {
  switch (kind) {
    case "hotspotComment":
      return "scenes";
    case "subtitleCue":
      return "subtitles";
    case "dialogueLine":
    case "dialogueChoice":
      return "dialogue";
    case "inventoryName":
    case "inventoryDescription":
      return "inventory";
  }
}

export function getProjectTextAreaLabel(area: ProjectTextArea): string {
  switch (area) {
    case "scenes":
      return "Scenes";
    case "dialogue":
      return "Dialogue";
    case "inventory":
      return "Inventory";
    case "subtitles":
      return "Subtitles";
  }
}

export function formatProjectTextUsageKind(kind: ProjectTextUsageKind): string {
  switch (kind) {
    case "hotspotComment":
      return "Hotspot Comment";
    case "subtitleCue":
      return "Subtitle Cue";
    case "dialogueLine":
      return "Dialogue Line";
    case "dialogueChoice":
      return "Dialogue Choice";
    case "inventoryName":
      return "Inventory Name";
    case "inventoryDescription":
      return "Inventory Description";
  }
}

export function summarizeProjectTextUsages(usages: ProjectTextUsage[]): string {
  if (usages.length === 0) {
    return "No current references. This entry remains stored in the project.";
  }

  if (usages.length === 1) {
    const [usage] = usages;
    return `${formatProjectTextUsageKind(usage.kind)} in ${usage.ownerLabel}`;
  }

  const areas = [...new Set(usages.map((usage) => getProjectTextAreaLabel(resolveProjectTextArea(usage.kind))))];
  return `${usages.length} uses across ${areas.join(", ")}`;
}

export function filterProjectTextEntries(entries: ProjectTextEntry[], options: ProjectTextViewOptions): ProjectTextEntry[] {
  const search = options.search.trim().toLowerCase();

  return entries
    .filter((entry) => {
      if (options.status !== "all" && entry.status !== options.status) {
        return false;
      }

      if (options.area !== "all" && !entry.usages.some((usage) => resolveProjectTextArea(usage.kind) === options.area)) {
        return false;
      }

      if (search.length === 0) {
        return true;
      }

      const searchableParts = [
        entry.textId,
        entry.value,
        ...entry.usages.flatMap((usage) => [formatProjectTextUsageKind(usage.kind), usage.ownerLabel])
      ];

      return searchableParts.some((part) => part.toLowerCase().includes(search));
    })
    .sort((left, right) => compareProjectTextEntries(left, right, options.sort));
}

export function resolveProjectTextSelection(
  entries: ProjectTextEntry[],
  selectedTextId?: string
): string | undefined {
  return entries.some((entry) => entry.textId === selectedTextId) ? selectedTextId : entries[0]?.textId;
}

export function deleteOrphanedProjectTextEntries(project: ProjectBundle, textIds: string[]): string[] {
  const entryMap = new Map(collectProjectTextEntries(project).map((entry) => [entry.textId, entry]));
  const deletedTextIds: string[] = [];

  for (const textId of new Set(textIds)) {
    const entry = entryMap.get(textId);
    if (!entry || entry.status !== "orphaned") {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(project.strings.values, textId)) {
      continue;
    }

    delete project.strings.values[textId];
    deletedTextIds.push(textId);
  }

  return deletedTextIds;
}

export function pruneOwnedGeneratedProjectTextEntries(project: ProjectBundle, textIds: string[]): string[] {
  const referenceCounts = collectAllProjectTextReferenceCounts(project);
  const deletedTextIds: string[] = [];

  for (const textId of new Set(textIds)) {
    if (!Object.prototype.hasOwnProperty.call(project.strings.values, textId)) {
      continue;
    }

    if ((referenceCounts.get(textId) ?? 0) > 0) {
      continue;
    }

    delete project.strings.values[textId];
    deletedTextIds.push(textId);
  }

  return deletedTextIds;
}

export function collectOwnedGeneratedProjectTextIdsForLocation(
  location: Pick<Location, "id" | "descriptionTextId">
): string[] {
  return location.descriptionTextId === getGeneratedLocationDescriptionTextId(location.id)
    ? [location.descriptionTextId]
    : [];
}

export function collectOwnedGeneratedProjectTextIdsForScene(
  scene: Pick<Scene, "id" | "hotspots" | "subtitleTracks">
): string[] {
  const ownedTextIds: string[] = [getGeneratedSceneOverlayTextId(scene.id)];

  for (const hotspot of scene.hotspots) {
    ownedTextIds.push(...collectOwnedGeneratedProjectTextIdsForHotspot(hotspot));
  }

  for (const track of scene.subtitleTracks) {
    ownedTextIds.push(...collectOwnedGeneratedProjectTextIdsForSubtitleTrack(track));
  }

  return ownedTextIds;
}

export function collectOwnedGeneratedProjectTextIdsForHotspot(
  hotspot: Pick<Hotspot, "id" | "commentTextId">
): string[] {
  const ownedTextIds: string[] = [getGeneratedHotspotLabelTextId(hotspot.id)];

  if (hotspot.commentTextId === getGeneratedHotspotCommentTextId(hotspot.id)) {
    ownedTextIds.push(hotspot.commentTextId);
  }

  return ownedTextIds;
}

export function collectOwnedGeneratedProjectTextIdsForSubtitleTrack(
  track: Pick<SubtitleTrack, "cues">
): string[] {
  return track.cues.flatMap((cue) => collectOwnedGeneratedProjectTextIdsForSubtitleCue(cue));
}

export function collectOwnedGeneratedProjectTextIdsForSubtitleCue(
  cue: Pick<SubtitleCue, "id" | "textId">
): string[] {
  return cue.textId === getGeneratedSubtitleCueTextId(cue.id) ? [cue.textId] : [];
}

export function collectOwnedGeneratedProjectTextIdsForDialogueNode(
  node: Pick<DialogueNode, "id" | "textId">
): string[] {
  return node.textId === getGeneratedDialogueNodeTextId(node.id) ? [node.textId] : [];
}

export function collectOwnedGeneratedProjectTextIdsForDialogueChoice(
  choice: Pick<DialogueChoice, "id" | "textId">
): string[] {
  return choice.textId === getGeneratedDialogueChoiceTextId(choice.id) ? [choice.textId] : [];
}

export function collectOwnedGeneratedProjectTextIdsForInventoryItem(
  item: Pick<InventoryItem, "id" | "textId" | "descriptionTextId">
): string[] {
  const ownedTextIds: string[] = [];

  if (item.textId === getGeneratedInventoryNameTextId(item.id)) {
    ownedTextIds.push(item.textId);
  }

  if (item.descriptionTextId === getGeneratedInventoryDescriptionTextId(item.id)) {
    ownedTextIds.push(item.descriptionTextId);
  }

  return ownedTextIds;
}

export function getGeneratedLocationDescriptionTextId(locationId: string): string {
  return `text.${locationId}.description`;
}

export function getGeneratedSceneOverlayTextId(sceneId: string): string {
  return `text.${sceneId}.overlay`;
}

export function getGeneratedHotspotLabelTextId(hotspotId: string): string {
  return `text.${hotspotId}.label`;
}

export function getGeneratedHotspotCommentTextId(hotspotId: string): string {
  return `text.${hotspotId}.comment`;
}

export function getGeneratedSubtitleCueTextId(cueId: string): string {
  return `text.${cueId}.subtitle`;
}

export function getGeneratedDialogueNodeTextId(nodeId: string): string {
  return `text.${nodeId}.line`;
}

export function getGeneratedDialogueChoiceTextId(choiceId: string): string {
  return `text.${choiceId}.label`;
}

export function getGeneratedInventoryNameTextId(itemId: string): string {
  return `text.${itemId}.name`;
}

export function getGeneratedInventoryDescriptionTextId(itemId: string): string {
  return `text.${itemId}.description`;
}

function collectExcludedProjectTextIds(project: ProjectBundle): Set<string> {
  const excludedTextIds = new Set<string>();

  for (const location of project.locations.items) {
    if (location.descriptionTextId) {
      excludedTextIds.add(location.descriptionTextId);
    }
  }

  return excludedTextIds;
}

function matchesExcludedLegacyProjectTextPattern(textId: string): boolean {
  return (
    /^text\.location_[^.]+\.description$/.test(textId) ||
    /^text\.scene_[^.]+\.overlay$/.test(textId) ||
    /^text\.hotspot_[^.]+\.label$/.test(textId)
  );
}

function collectAllProjectTextReferenceCounts(project: ProjectBundle): Map<string, number> {
  const counts = new Map<string, number>();
  const register = (textId: string | undefined) => {
    if (!textId) {
      return;
    }

    counts.set(textId, (counts.get(textId) ?? 0) + 1);
  };

  for (const location of project.locations.items) {
    register(location.descriptionTextId);
  }

  for (const scene of project.scenes.items) {
    for (const hotspot of scene.hotspots) {
      register(hotspot.commentTextId);
    }

    for (const track of scene.subtitleTracks) {
      for (const cue of track.cues) {
        register(cue.textId);
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      register(node.textId);

      for (const choice of node.choices) {
        register(choice.textId);
      }
    }
  }

  for (const item of project.inventory.items) {
    register(item.textId);
    register(item.descriptionTextId);
  }

  return counts;
}

function compareProjectTextEntries(
  left: ProjectTextEntry,
  right: ProjectTextEntry,
  sort: ProjectTextSortOption
): number {
  switch (sort) {
    case "textId":
      return left.textId.localeCompare(right.textId);
    case "mostUses": {
      const usageDifference = right.usages.length - left.usages.length;
      if (usageDifference !== 0) {
        return usageDifference;
      }

      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDifference !== 0) {
        return statusDifference;
      }

      return left.textId.localeCompare(right.textId);
    }
    case "status":
      return (
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
        left.textId.localeCompare(right.textId)
      );
  }
}
