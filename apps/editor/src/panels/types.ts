import type { ProjectBundle } from "@mage2/schema";

export interface PanelContext {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}
