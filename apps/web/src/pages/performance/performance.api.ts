import { apiRequest, buildQuery } from '@/shared/lib/api';

export interface PerformanceSummary {
  access: {
    isHrAdmin: boolean;
    isManager: boolean;
    accountLinked: boolean;
  };
  management: {
    activeCycleCount: number;
    activeCycleName: string | null;
    overdueReviews: number;
    pendingAcknowledgments: number;
    goalCompletionRate: number;
  };
  self: {
    activeGoals: number;
    selfReviewDue: number;
    acknowledgmentsDue: number;
    completedGoals: number;
  };
}

export interface PerformanceCycleRecord {
  id: string;
  name: string;
  status: 'Draft' | 'Published' | 'Closed';
  startDate: string | null;
  endDate: string | null;
  selfReviewDueDate: string | null;
  managerReviewDueDate: string | null;
  releaseDate: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  orgUnit: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
  reviewCount: number;
  finalizedReviews: number;
  acknowledgedReviews: number;
}

export interface PerformanceReviewSectionRecord {
  id: string;
  sectionKey: 'achievements' | 'strengths' | 'growth_focus' | 'development_actions';
  sectionTitle: string;
  employeeResponse: string | null;
  managerResponse: string | null;
  sortOrder: number;
}

export interface PerformanceReviewRecord {
  id: string;
  status: 'Pending Self Review' | 'Self Review Submitted' | 'Manager Review In Progress' | 'Finalized' | 'Acknowledged';
  managerSummary: string | null;
  finalizedAt: string | null;
  releasedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  cycle: PerformanceCycleRecord | null;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
  manager: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
  sections: PerformanceReviewSectionRecord[];
  sectionCompletion: {
    employeeCompleted: number;
    managerCompleted: number;
    total: number;
  };
  permissions: {
    canSelfReview: boolean;
    canManagerReview: boolean;
    canFinalize: boolean;
    canAcknowledge: boolean;
  };
}

export interface PerformanceGoalUpdateRecord {
  id: string;
  progressNote: string;
  percentComplete: number | null;
  createdAt: string | null;
  authorEmployee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
}

export interface PerformanceGoalRecord {
  id: string;
  title: string;
  description: string | null;
  status: 'Active' | 'Completed' | 'Closed';
  targetDate: string | null;
  closedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
  manager: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
  createdInCycle: PerformanceCycleRecord | null;
  updates: PerformanceGoalUpdateRecord[];
  permissions: {
    canEdit: boolean;
    canAddUpdate: boolean;
  };
}

export interface PerformanceReviewWritePayload {
  sections: Array<{
    sectionKey: PerformanceReviewSectionRecord['sectionKey'];
    response: string;
  }>;
}

export interface ManagerReviewWritePayload extends PerformanceReviewWritePayload {
  managerSummary?: string | null;
}

export interface PerformanceCyclePayload {
  name: string;
  startDate: string;
  endDate: string;
  selfReviewDueDate: string;
  managerReviewDueDate: string;
  releaseDate: string;
  orgUnitId?: string | null;
}

export interface PerformanceGoalPayload {
  employeeId: string;
  title: string;
  description?: string | null;
  status?: 'Active' | 'Completed' | 'Closed';
  targetDate?: string | null;
  createdInCycleId?: string | null;
}

export interface PerformanceGoalUpdatePayload {
  progressNote: string;
  percentComplete?: number | null;
}

export async function getPerformanceSummary() {
  const response = await apiRequest<{ success: true; data: PerformanceSummary }>('/api/performance/summary', {}, 'Unable to load performance summary.');
  return response.data;
}

export async function listPerformanceCycles() {
  const response = await apiRequest<{ success: true; data: PerformanceCycleRecord[] }>('/api/performance/cycles', {}, 'Unable to load performance cycles.');
  return response.data;
}

export async function createPerformanceCycle(payload: PerformanceCyclePayload) {
  const response = await apiRequest<{ success: true; data: PerformanceCycleRecord }>('/api/performance/cycles', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create performance cycle.');
  return response.data;
}

export async function updatePerformanceCycle(id: string, payload: Partial<PerformanceCyclePayload>) {
  const response = await apiRequest<{ success: true; data: PerformanceCycleRecord }>(`/api/performance/cycles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update performance cycle.');
  return response.data;
}

export async function publishPerformanceCycle(id: string) {
  const response = await apiRequest<{ success: true; data: PerformanceCycleRecord }>(`/api/performance/cycles/${id}/publish`, {
    method: 'POST',
  }, 'Unable to publish performance cycle.');
  return response.data;
}

export async function listPerformanceReviews(query: { cycleId?: string; status?: string } = {}) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord[] }>(
    `/api/performance/reviews${buildQuery(query)}`,
    {},
    'Unable to load performance reviews.',
  );
  return response.data;
}

export async function getPerformanceReview(id: string) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord }>(`/api/performance/reviews/${id}`, {}, 'Unable to load performance review.');
  return response.data;
}

export async function submitSelfReview(id: string, payload: PerformanceReviewWritePayload) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord }>(`/api/performance/reviews/${id}/self-review`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to submit the self-review.');
  return response.data;
}

export async function submitManagerReview(id: string, payload: ManagerReviewWritePayload) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord }>(`/api/performance/reviews/${id}/manager-review`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the manager review.');
  return response.data;
}

export async function finalizePerformanceReview(id: string) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord }>(`/api/performance/reviews/${id}/finalize`, {
    method: 'POST',
  }, 'Unable to finalize the performance review.');
  return response.data;
}

export async function acknowledgePerformanceReview(id: string, comments?: string | null) {
  const response = await apiRequest<{ success: true; data: PerformanceReviewRecord }>(`/api/performance/reviews/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  }, 'Unable to acknowledge the performance review.');
  return response.data;
}

export async function listPerformanceGoals(query: { employeeId?: string; status?: string } = {}) {
  const response = await apiRequest<{ success: true; data: PerformanceGoalRecord[] }>(
    `/api/performance/goals${buildQuery(query)}`,
    {},
    'Unable to load performance goals.',
  );
  return response.data;
}

export async function createPerformanceGoal(payload: PerformanceGoalPayload) {
  const response = await apiRequest<{ success: true; data: PerformanceGoalRecord }>('/api/performance/goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the performance goal.');
  return response.data;
}

export async function updatePerformanceGoal(id: string, payload: Partial<PerformanceGoalPayload>) {
  const response = await apiRequest<{ success: true; data: PerformanceGoalRecord }>(`/api/performance/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the performance goal.');
  return response.data;
}

export async function createPerformanceGoalUpdate(id: string, payload: PerformanceGoalUpdatePayload) {
  const response = await apiRequest<{ success: true; data: PerformanceGoalRecord }>(`/api/performance/goals/${id}/updates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to add the goal update.');
  return response.data;
}
