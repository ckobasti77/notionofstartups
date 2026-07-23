import type { Node } from "@xyflow/react";

import type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtSidebarDragRequest,
} from "@/components/workspace/thought-sharing";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import type { Id } from "@/convex/_generated/dataModel";

export type ThoughtNodeColor =
  | "neutral"
  | "violet"
  | "blue"
  | "green"
  | "amber"
  | "rose";

export type ThoughtNodeData = {
  title: string | null;
  text: string;
  color: ThoughtNodeColor;
  isParent?: boolean;
  conversionCount: number;
  lastConvertedPageId: Id<"pages"> | null;
};

export type ThoughtFlowNode = Node<ThoughtNodeData, "thought">;

export type ThoughtEditorValue = {
  title: string;
  text: string;
  color: ThoughtNodeColor;
};

export type ThoughtsCanvasViewProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  onOpenPage: (pageId: Id<"pages">) => void;
  onRequestDestination: (request: ThoughtDestinationRequest) => void;
  onBeginSidebarDrag?: (request: ThoughtSidebarDragRequest) => void;
};

export type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtSidebarDragRequest,
};
