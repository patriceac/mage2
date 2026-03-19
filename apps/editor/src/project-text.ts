import type { ProjectBundle, ValidationIssue } from "@mage2/schema";
import type { EditorNavigationTarget } from "./navigation-target";

export type ProjectTextUsageKind =
  | "locationDescription"
  | "sceneOverlay"
  | "hotspotLabel"
  | "hotspotComment"
  | "dialogueLine"
  | "dialogueChoice"
  | "inventoryName"
  | "inventoryDescription";

export type ProjectTextEntryStatus = "missing" | "referenced" | "orphaned";

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

const ISSUE_KIND_MAP: Partial<Record<ValidationIssue["code"], ProjectTextUsageKind>> = {
  HOTSPOT_TEXT_MISSING: "hotspotLabel",
  HOTSPOT_COMMENT_TEXT_MISSING: "hotspotComment",
  DIALOGUE_TEXT_MISSING: "dialogueLine",
  DIALOGUE_CHOICE_TEXT_MISSING: "dialogueChoice"
};

const STATUS_ORDER: Record<ProjectTextEntryStatus, number> = {
  missing: 0,
  referenced: 1,
  orphaned: 2
};

export function collectProjectTextUsages(project: ProjectBundle): ProjectTextUsage[] {
  const usages: ProjectTextUsage[] = [];

  for (const location of project.locations.items) {
    if (location.descriptionTextId) {
      usages.push({
        textId: location.descriptionTextId,
        kind: "locationDescription",
        ownerId: location.id,
        ownerLabel: location.name,
        navigation: {
          label: location.name,
          tab: "world",
          locationId: location.id,
          sceneId: location.sceneIds[0]
        }
      });
    }
  }

  for (const scene of project.scenes.items) {
    if (scene.overlayTextId) {
      usages.push({
        textId: scene.overlayTextId,
        kind: "sceneOverlay",
        ownerId: scene.id,
        ownerLabel: scene.name,
        navigation: {
          label: scene.name,
          tab: "scenes",
          locationId: scene.locationId,
          sceneId: scene.id
        }
      });
    }

    for (const hotspot of scene.hotspots) {
      usages.push({
        textId: hotspot.labelTextId,
        kind: "hotspotLabel",
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

  const textIds = new Set<string>([...Object.keys(project.strings.values), ...usagesByTextId.keys()]);

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

export function formatProjectTextUsageKind(kind: ProjectTextUsageKind): string {
  switch (kind) {
    case "locationDescription":
      return "Location Description";
    case "sceneOverlay":
      return "Scene Overlay";
    case "hotspotLabel":
      return "Hotspot Label";
    case "hotspotComment":
      return "Hotspot Comment";
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

  const areas = [...new Set(usages.map((usage) => resolveProjectTextAreaLabel(usage.kind)))];
  return `${usages.length} uses across ${areas.join(", ")}`;
}

function resolveProjectTextAreaLabel(kind: ProjectTextUsageKind): string {
  switch (kind) {
    case "locationDescription":
      return "World";
    case "sceneOverlay":
    case "hotspotLabel":
    case "hotspotComment":
      return "Scenes";
    case "dialogueLine":
    case "dialogueChoice":
      return "Dialogue";
    case "inventoryName":
    case "inventoryDescription":
      return "Inventory";
  }
}
