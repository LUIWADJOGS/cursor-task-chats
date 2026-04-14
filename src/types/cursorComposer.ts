export interface CursorComposerSummary {
  composerId: string;
  name?: string;
  subtitle?: string;
  createdAt: number;
  lastUpdatedAt?: number;
  hasUnreadMessages?: boolean;
  isArchived?: boolean;
  subagentInfo?: {
    parentComposerId: string;
  };
}

export interface CursorComposerData {
  allComposers: CursorComposerSummary[];
  selectedComposerIds?: string[];
  lastFocusedComposerIds?: string[];
}
