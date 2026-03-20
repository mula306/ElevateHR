import { apiRequest, buildQuery } from '@/shared/lib/api';
import type { InboxSummary } from '@/shared/auth/AppSessionProvider';

export interface InboxItem {
  id: string;
  sourceType: 'Leave' | 'Checklist' | 'Document' | 'Performance' | 'Learning' | 'Time' | 'Recruitment' | 'Operational';
  taskType: string;
  title: string;
  dueDate: string | null;
  priority: string;
  status: string;
  assignee: {
    type: string;
    label: string;
    queueKey: string | null;
  };
  subjectEmployee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
  } | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  actionKind: 'approve_leave' | 'approve_time_card' | 'complete_task' | 'open_record';
}

export interface InboxItemsResponse {
  data: InboxItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface InboxItemsQuery {
  tab?: 'open' | 'approvals' | 'tasks' | 'completed';
  source?: 'Leave' | 'Checklist' | 'Document' | 'Performance' | 'Learning' | 'Time' | 'Recruitment' | 'Operational' | '';
  dueWindow?: 'all' | 'overdue' | 'today' | 'next7';
  search?: string;
  page?: number;
  limit?: number;
}

export async function getInboxSummary() {
  const response = await apiRequest<{ success: true; data: InboxSummary }>('/api/inbox/summary', {}, 'Unable to load inbox summary.');
  return response.data;
}

export async function listInboxItems(query: InboxItemsQuery) {
  const response = await apiRequest<{ success: true } & InboxItemsResponse>(
    `/api/inbox/items${buildQuery(query as Record<string, string | number | boolean | null | undefined>)}`,
    {},
    'Unable to load inbox items.',
  );

  return {
    data: response.data,
    pagination: response.pagination,
  };
}

export async function approveLeaveRequest(leaveRequestId: string, comments: string) {
  const response = await apiRequest<{ success: true; data: unknown }>(
    `/api/time-off/leave-requests/${leaveRequestId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ comments }),
    },
    'Unable to approve the leave request.',
  );

  return response.data;
}

export async function rejectLeaveRequest(leaveRequestId: string, comments: string) {
  const response = await apiRequest<{ success: true; data: unknown }>(
    `/api/time-off/leave-requests/${leaveRequestId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ comments }),
    },
    'Unable to reject the leave request.',
  );

  return response.data;
}

export async function approveTimeCard(timeCardId: string, comments: string) {
  const response = await apiRequest<{ success: true; data: unknown }>(
    `/api/time-attendance/management/time-cards/${timeCardId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ comments }),
    },
    'Unable to approve the time card.',
  );

  return response.data;
}

export async function rejectTimeCard(timeCardId: string, comments: string) {
  const response = await apiRequest<{ success: true; data: unknown }>(
    `/api/time-attendance/management/time-cards/${timeCardId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ comments }),
    },
    'Unable to reject the time card.',
  );

  return response.data;
}

export async function updateWorkflowTask(taskId: string, status: 'Open' | 'Completed') {
  const response = await apiRequest<{ success: true; data: unknown }>(
    `/api/workflow-tasks/${taskId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ status }),
    },
    'Unable to update the workflow task.',
  );

  return response.data;
}
