import { apiRequest, buildQuery } from '@/shared/lib/api';

export interface LearningSummary {
  access: {
    accountLinked: boolean;
    isManager: boolean;
    isHrAdmin: boolean;
  };
  my: {
    requiredOpen: number;
    recommendedOpen: number;
    dueSoon: number;
    overdue: number;
    completed: number;
    certificateAlerts: number;
  };
  management: {
    providerCount: number;
    activeAssignments: number;
    automationRules: number;
    overdueLearners: number;
    complianceRate: number;
    certificateRenewals: number;
  };
}

export interface LearningProviderRecord {
  id: string;
  code: string;
  displayName: string;
  providerType: string;
  status: string;
  syncMode: string;
  defaultLaunchBaseUrl: string | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  contentCount: number;
  syncRunCount: number;
}

export interface LearningContentRecord {
  id: string;
  providerContentId: string;
  title: string;
  description: string | null;
  modality: string;
  durationMinutes: number | null;
  thumbnailUrl: string | null;
  launchUrl: string;
  tags: string[];
  versionLabel: string | null;
  certificateEligible: boolean;
  contentStatus: string;
  lastSyncedAt: string | null;
  provider: LearningProviderRecord;
  assignmentCount: number;
  pathCount: number;
  skills: Array<{
    id: string;
    code: string;
    name: string;
    category: {
      id: string;
      code: string;
      name: string;
    } | null;
  }>;
}

export interface LearningPathRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  itemCount: number;
  assignmentCount: number;
  items: Array<{
    id: string;
    sortOrder: number;
    isRequired: boolean;
    content: {
      id: string;
      title: string;
      modality: string;
      providerName: string;
    };
  }>;
}

export interface LearningAssignmentRecord {
  id: string;
  assignmentType: string;
  requirementType: string;
  status: string;
  mandatory: boolean;
  dueDate: string | null;
  renewalDays: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  cancelledAt: string | null;
  audience: {
    type: string;
    id: string;
    label: string;
  };
  content: LearningContentRecord | null;
  path: LearningPathRecord | null;
  counts: {
    assigned: number;
    completed: number;
    inProgress: number;
    overdue: number;
    certificateAlerts: number;
  };
  sampleEmployees: Array<{
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
  } | null>;
  permissions: {
    canEdit: boolean;
    canCancel: boolean;
  };
}

export interface LearningRuleRecord {
  id: string;
  assignmentType: string;
  requirementType: string;
  mandatory: boolean;
  renewalDays: number | null;
  defaultDueDays: number | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  audience: string;
  content: {
    id: string;
    title: string;
  } | null;
  path: {
    id: string;
    name: string;
  } | null;
  recordCount: number;
}

export interface LearningRecord {
  id: string;
  assignmentId: string | null;
  displayStatus: string;
  status: string;
  requirementType: string;
  mandatory: boolean;
  dueDate: string | null;
  renewalDueDate: string | null;
  assignedAt: string | null;
  launchedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  progressPercent: number;
  certificateIssuedAt: string | null;
  certificateExpiresAt: string | null;
  certificateNumber: string | null;
  providerStatus: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  canLaunch: boolean;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
  } | null;
  content: {
    id: string;
    title: string;
    description: string | null;
    modality: string;
    durationMinutes: number | null;
    launchUrl: string;
    tags: string[];
    skills: Array<{
      id: string;
      code: string;
      name: string;
      category: {
        id: string;
        code: string;
        name: string;
      } | null;
    }>;
    certificateEligible: boolean;
    provider: LearningProviderRecord;
  };
  path: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface MyLearningWorkspace {
  summary: LearningSummary;
  assigned: LearningRecord[];
  optional: LearningRecord[];
  transcript: LearningRecord[];
  certificates: LearningRecord[];
}

export interface LearningReport {
  overview: {
    providerCount: number;
    activeAssignments: number;
    requiredOpen: number;
    overdue: number;
    completionRate: number;
    certificateRenewals: number;
  };
  providers: Array<{
    id: string;
    code: string;
    displayName: string;
    status: string;
    syncMode: string;
    contentCount: number;
    lastSyncCompletedAt: string | null;
  }>;
  assignments: Array<{
    id: string;
    audience: string;
    learningItem: string;
    assignmentType: string;
    requirementType: string;
    mandatory: boolean;
    dueDate: string | null;
    assignedCount: number;
    completedCount: number;
    overdueCount: number;
  }>;
  records: Array<{
    id: string;
    employee: {
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
    } | null;
    learningItem: string;
    providerName: string;
    status: string;
    dueDate: string | null;
    completedAt: string | null;
    certificateExpiresAt: string | null;
  }>;
}

export interface LearningAssignmentPayload {
  assignmentType: 'Content' | 'Path';
  contentId?: string | null;
  pathId?: string | null;
  employeeId?: string | null;
  orgUnitId?: string | null;
  positionId?: string | null;
  classificationId?: string | null;
  requirementType?: 'Required' | 'Recommended';
  dueDate?: string | null;
  renewalDays?: number | null;
  mandatory?: boolean;
  notes?: string | null;
}

export interface LearningRulePayload {
  assignmentType: 'Content' | 'Path';
  contentId?: string | null;
  pathId?: string | null;
  orgUnitId?: string | null;
  positionId?: string | null;
  classificationId?: string | null;
  managerEmployeeId?: string | null;
  requirementType?: 'Required' | 'Recommended';
  defaultDueDays?: number | null;
  renewalDays?: number | null;
  mandatory?: boolean;
  isActive?: boolean;
}

export interface LearningPathPayload {
  code: string;
  name: string;
  description?: string | null;
  status?: 'Active' | 'Inactive';
  itemContentIds: string[];
}

export async function getLearningSummary() {
  const response = await apiRequest<{ success: true; data: LearningSummary }>('/api/learning/summary', {}, 'Unable to load learning summary.');
  return response.data;
}

export async function getMyLearningWorkspace() {
  const response = await apiRequest<{ success: true; data: MyLearningWorkspace }>('/api/learning/my', {}, 'Unable to load your learning workspace.');
  return response.data;
}

export async function listLearningCatalog(query: { search?: string; providerId?: string; status?: string } = {}) {
  const response = await apiRequest<{ success: true; data: LearningContentRecord[] }>(`/api/learning/catalog${buildQuery(query)}`, {}, 'Unable to load the learning catalog.');
  return response.data;
}

export async function listLearningAssignments(query: { search?: string; status?: string } = {}) {
  const response = await apiRequest<{ success: true; data: LearningAssignmentRecord[] }>(`/api/learning/assignments${buildQuery(query)}`, {}, 'Unable to load learning assignments.');
  return response.data;
}

export async function createLearningAssignment(payload: LearningAssignmentPayload) {
  const response = await apiRequest<{ success: true; data: LearningAssignmentRecord }>('/api/learning/assignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the learning assignment.');
  return response.data;
}

export async function updateLearningAssignment(id: string, payload: Partial<LearningAssignmentPayload>) {
  const response = await apiRequest<{ success: true; data: LearningAssignmentRecord }>(`/api/learning/assignments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the learning assignment.');
  return response.data;
}

export async function cancelLearningAssignment(id: string) {
  const response = await apiRequest<{ success: true; data: { id: string } }>(`/api/learning/assignments/${id}/cancel`, {
    method: 'POST',
  }, 'Unable to cancel the learning assignment.');
  return response.data;
}

export async function launchLearningAssignment(id: string, recordId?: string | null) {
  const response = await apiRequest<{ success: true; data: { recordId: string; launchUrl: string } }>(`/api/learning/assignments/${id}/launch`, {
    method: 'POST',
    body: JSON.stringify({ recordId: recordId ?? null }),
  }, 'Unable to launch the learning content.');
  return response.data;
}

export async function listLearningPaths() {
  const response = await apiRequest<{ success: true; data: LearningPathRecord[] }>('/api/learning/paths', {}, 'Unable to load learning paths.');
  return response.data;
}

export async function createLearningPath(payload: LearningPathPayload) {
  const response = await apiRequest<{ success: true; data: LearningPathRecord }>('/api/learning/paths', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the learning path.');
  return response.data;
}

export async function updateLearningPath(id: string, payload: Partial<LearningPathPayload>) {
  const response = await apiRequest<{ success: true; data: LearningPathRecord }>(`/api/learning/paths/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the learning path.');
  return response.data;
}

export async function listLearningRules() {
  const response = await apiRequest<{ success: true; data: LearningRuleRecord[] }>('/api/learning/rules', {}, 'Unable to load learning automation rules.');
  return response.data;
}

export async function createLearningRule(payload: LearningRulePayload) {
  const response = await apiRequest<{ success: true; data: LearningRuleRecord }>('/api/learning/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the learning automation rule.');
  return response.data;
}

export async function updateLearningRule(id: string, payload: Partial<LearningRulePayload>) {
  const response = await apiRequest<{ success: true; data: LearningRuleRecord }>(`/api/learning/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the learning automation rule.');
  return response.data;
}

export async function listLearningProviders() {
  const response = await apiRequest<{ success: true; data: LearningProviderRecord[] }>('/api/learning/providers', {}, 'Unable to load learning providers.');
  return response.data;
}

export async function syncLearningProvider(id: string) {
  const response = await apiRequest<{ success: true; data: { providerId: string; createdCount: number; updatedCount: number; retiredCount: number; syncedCount: number } }>(`/api/learning/providers/${id}/sync`, {
    method: 'POST',
  }, 'Unable to sync the learning provider.');
  return response.data;
}

export async function getLearningReport() {
  const response = await apiRequest<{ success: true; data: LearningReport }>('/api/reports/learning', {}, 'Unable to load the learning report.');
  return response.data;
}

export async function updateLearningContentSkills(id: string, skillTagIds: string[]) {
  const response = await apiRequest<{ success: true; data: LearningContentRecord }>(`/api/learning/catalog/${id}/skills`, {
    method: 'PUT',
    body: JSON.stringify({ skillTagIds }),
  }, 'Unable to update the learning content skills.');
  return response.data;
}
