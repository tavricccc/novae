export type IssueReadAccess = 'school' | 'reviewed-school' | 'owner-admin';

export interface IssueCategoryConfig {
  id: string;
  label: string;
  readAccess: IssueReadAccess;
  authorVisible: boolean;
  supportEnabled: boolean;
  supportGoal: number | null;
  supportDeadlineDays: number | null;
  responseDeadlineDays: number | null;
  commentsEnabled: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface FacilityCategoryConfig {
  id: string;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface CategoryCatalog {
  issueCategories: IssueCategoryConfig[];
  facilityCategories: FacilityCategoryConfig[];
  setupCompleted: boolean;
}

export interface IssueCategoryDraft {
  id: string;
  label: string;
  readAccess: IssueReadAccess | '';
  authorVisible: boolean | null;
  supportEnabled: boolean | null;
  supportGoal: number | null;
  supportDeadlineDays: number | null;
  responseDeadlineDays: number | null;
  commentsEnabled: boolean;
}

export interface FacilityCategoryDraft {
  id: string;
  label: string;
}
