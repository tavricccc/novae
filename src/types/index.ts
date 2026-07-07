import type { IssueCategory as ConfigIssueCategory } from '@/generated/issue-categories';

export type IssueStatus =
  | 'under-review'
  | 'pending'
  | 'processing'
  | 'auto-rejected'
  | 'review-rejected'
  | 'infeasible'
  | 'completed';
export type IssueStatusBucket = 'active' | 'closed';
export type IssueCategory = ConfigIssueCategory;
export type WritableIssueCategory = IssueCategory;
export type IssueFilter = IssueCategory;
export type IssueRouteFilter = IssueFilter | 'my-proposals';
export type IssueSortOption = 'latest' | 'most-supported' | 'ending-soon';
export type AnnouncementSortOption = 'latest' | 'most-liked' | 'most-commented';
export type NotificationType =
  | 'announcement_created'
  | 'announcement_comment_created'
  | 'issue_created'
  | 'issue_comment_created'
  | 'issue_status_changed'
  | 'support_goal_met'
  | 'issue_deleted';
export type NotificationTargetType = 'announcement' | 'issue';
export type NotificationSource = 'broadcast' | 'admin' | 'user';


export interface IssueRecord {
  id: string;
  title: string;
  content: string;
  created_at: Date | null;
  updated_at: Date | null;
  support_count: number;
  status: IssueStatus;
  category: IssueCategory;
  support_enabled: boolean;
  support_goal: number | null;
  support_deadline_at: Date | null;
  response_deadline_at: Date | null;
  review_approved_at: Date | null;
  result_content?: string;
  result_updated_at?: Date | null;
  support_met_at: Date | null;
  review_rejection_reason?: string;
  currentUserSupported?: boolean;
  deleting?: boolean;
  author_uid?: string;
  author_name?: string;
  author_photo_url?: string | null;
}

export interface IssueCursor {
  id: string;
  created_at: Date | null;
  sort_date?: Date | null;
  sort_number?: number | null;
}

export interface IssuePageResult {
  issues: IssueRecord[];
  cursor: IssueCursor | null;
  hasMore: boolean;
}

export interface DiscussionCommentRecord {
  id: string;
  content: string;
  parent_comment_id: string | null;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  is_admin_comment: boolean;
  created_at: Date | null;
  updated_at: Date | null;
  replies: DiscussionCommentRecord[];
}

export interface CommentRecord extends DiscussionCommentRecord {
  issue_id: string;
}

export interface ComposerInput {
  title: string;
  content: string;
  category: WritableIssueCategory;
}

export interface CommentInput {
  content: string;
}

export interface PrivateAuthorRecord {
  issue_id: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  created_at: Date | null;
}

export type CategoryCountMap = Record<IssueCategory, number> & Record<string, number>;

export interface PlatformDashboardStats {
  total_users_seen: number;
  total_issues_created: number;
  total_comments_created: number;
  total_supports_added: number;
  total_supports_removed: number;
  total_issues_deleted: number;
  total_comments_deleted: number;
  issues_by_category: CategoryCountMap;
  comments_by_category: CategoryCountMap;
  last_activity_at: Date | null;
  updated_at: Date | null;
}

type PlatformDashboardStatus = 'healthy' | 'attention' | 'critical';

interface PlatformDashboardFailure {
  id: string;
  source: 'outbox' | 'push' | 'cleanup' | string;
  status: string;
  message: string;
  detail_type: string;
  target_type: string;
  target_id: string;
  attempt_count: number;
  next_attempt_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
}

interface PlatformDashboardScheduledMaintenance {
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date | null;
  failed_tasks: string[];
  error: string;
}

export interface PlatformDashboardOperations {
  overall_status: PlatformDashboardStatus;
  pending_notion_sync_count: number;
  pending_notion_sync_capped: boolean;
  next_sync_count: number;
  failed_notion_sync_count: number;
  failed_notion_sync_capped: boolean;
  oldest_pending_sync_at: Date | null;
  failed_outbox_count: number;
  failed_outbox_capped: boolean;
  failed_push_delivery_count: number;
  failed_push_delivery_capped: boolean;
  stuck_upload_count: number;
  stuck_upload_capped: boolean;
  cleanup_backlog_count: number;
  cleanup_backlog_capped: boolean;
  scheduled_maintenance: PlatformDashboardScheduledMaintenance;
  recent_failures: PlatformDashboardFailure[];
}

export interface PlatformDashboardData {
  stats: PlatformDashboardStats;
  operations: PlatformDashboardOperations;
}

export interface NotificationRecord {
  id: string;
  source: NotificationSource;
  type: NotificationType;
  target_type: NotificationTargetType;
  target_id: string;
  title: string;
  actor_uid: string | null;
  actor_name: string | null;
  actor_photo_url: string | null;
  body_preview: string | null;
  issue_category: IssueCategory | null;
  old_status?: IssueStatus;
  new_status?: IssueStatus;
  is_read: boolean;
  created_at: Date | null;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  content: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  published_at: Date | null;
  like_count: number;
  comment_count: number;
  currentUserLiked: boolean;
  deleting?: boolean;
}

export interface AnnouncementCommentRecord extends DiscussionCommentRecord {
  announcement_id: string;
}

export interface AnnouncementInput {
  title: string;
  content: string;
}

interface ChangelogBullet {
  title: string;
}

export interface ChangelogEntry {
  title: string;
  version: string;
  date: string;
  time: string;
  items: ChangelogBullet[];
}

export interface MarkdownImageRecord {
  src: string;
  alt: string;
  fullSrc?: string;
  uploadId?: string;
  isUploadResolved?: boolean;
  resolveError?: string;
  width?: number;
  height?: number;
}

