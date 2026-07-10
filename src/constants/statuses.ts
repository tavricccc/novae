import type { IssueStatus } from '@/types';

interface StatusOption<TValue extends string> {
  value: TValue;
  label: string;
}

export const ADMIN_ISSUE_STATUS_OPTIONS: StatusOption<IssueStatus>[] = [
  { value: 'under-review', label: '待審核' },
  { value: 'pending', label: '未回覆' },
  { value: 'review-rejected', label: '審核未過' },
  { value: 'processing', label: '處理中' },
  { value: 'infeasible', label: '無法實行' },
  { value: 'completed', label: '已完成' },
];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  'under-review': '待審核',
  pending: '未回覆',
  processing: '處理中',
  'auto-rejected': '未通過',
  'review-rejected': '審核未過',
  infeasible: '無法實行',
  completed: '已完成',
};
