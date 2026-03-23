import { apiRequest, buildQuery } from '@/shared/lib/api';

export type JobRequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'In Review'
  | 'Needs Rework'
  | 'Rejected'
  | 'Approved'
  | 'Cancelled'
  | 'Hiring In Progress'
  | 'Closed';

export interface DynamicFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date';
  required?: boolean;
  options?: string[];
}

export interface RequestTypeRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fieldSchema: DynamicFieldDefinition[];
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FundingTypeRecord {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  durationType: string | null;
  isPermanent: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApprovalRuleStepRecord {
  id: string;
  stepOrder: number;
  label: string;
  assigneeSource: 'RequestorManager' | 'PositionIncumbent' | 'Queue' | 'SpecificAccount';
  assigneeValue: string | null;
  fallbackQueueKey: string | null;
  escalationDays: number | null;
  dueDays: number | null;
}

export interface ApprovalRuleRecord {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  isFallback: boolean;
  requestTypeId: string | null;
  fundingTypeId: string | null;
  budgetImpacting: boolean | null;
  requestorRole: string | null;
  orgUnitId: string | null;
  conditions: Record<string, unknown>;
  steps: ApprovalRuleStepRecord[];
}

export interface ApprovalRuleSetRecord {
  id: string;
  name: string;
  description: string | null;
  status: 'Draft' | 'Active' | 'Archived';
  version: number;
  scopeOrgUnitId: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  rules: ApprovalRuleRecord[];
}

export interface JobRequestRecord {
  id: string;
  requestNumber: string;
  status: JobRequestStatus;
  budgetImpacting: boolean;
  title: string;
  headcount: number;
  fte: number;
  weeklyHours: number;
  justification: string | null;
  businessCase: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  requestType: RequestTypeRecord | null;
  fundingType: FundingTypeRecord | null;
  orgUnit: { id: string; code: string; name: string; type: string } | null;
  classification: { id: string; code: string; title: string; occupationCode: string } | null;
  level: { id: string; levelCode: string; currency: string; rangeMin: number; rangeMid: number; rangeMax: number } | null;
  reportsToPosition: { id: string; positionCode: string; title: string } | null;
  requestor: { id: string; employeeNumber: string; fullName: string; department: string; jobTitle: string } | null;
  targetPosition: { id: string; positionCode: string; title: string; positionStatus: string } | null;
  linkedPosition: { id: string; positionCode: string; title: string; positionStatus: string } | null;
  approvalRuleSet: { id: string; name: string; status: string; version: number } | null;
  approvalRule: { id: string; name: string; priority: number } | null;
  fieldValues: Array<{ id: string; fieldKey: string; fieldLabel: string; valueType: string; value: string | null }>;
  approvalSteps: Array<{
    id: string;
    stepOrder: number;
    label: string;
    assigneeSource: string;
    assigneeValue: string | null;
    assigneeQueueKey: string | null;
    status: string;
    dueDate: string | null;
    respondedAt: string | null;
    assigneeAccount: { id: string; displayName: string; email: string } | null;
    ownerEmployee: { id: string; fullName: string } | null;
    decisions: Array<{
      id: string;
      action: string;
      comments: string | null;
      createdAt: string | null;
      actorEmployee: { id: string; fullName: string } | null;
    }>;
  }>;
  statusHistory: Array<{
    id: string;
    status: string;
    action: string;
    comments: string | null;
    createdAt: string | null;
    actorEmployee: { id: string; fullName: string } | null;
    actorAccount: { id: string; displayName: string } | null;
  }>;
  hiringRecord: HiringRecord | null;
  employeeSnapshots: EmployeeSnapshotRecord[];
}

export interface HiringRecord {
  id: string;
  jobRequestId: string;
  positionId: string;
  candidateName: string;
  competitionNumber: string;
  compensationAmount: number;
  payFrequency: string;
  hireDate: string | null;
  notes: string | null;
  selectedEmployee: { id: string; employeeNumber: string; fullName: string } | null;
  position: { id: string; positionCode: string; title: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EmployeeSnapshotRecord {
  id: string;
  employeeId: string | null;
  jobRequestId: string;
  positionId: string;
  employeeNumber: string | null;
  fullName: string;
  email: string | null;
  jobTitle: string;
  department: string;
  orgUnitName: string;
  positionCode: string;
  classificationCode: string;
  levelCode: string;
  managerName: string | null;
  compensationAmount: number;
  payFrequency: string;
  competitionNumber: string | null;
  hireDate: string | null;
  snapshotType: string;
  createdAt: string | null;
}

export interface RecruitmentSummary {
  totalRequests: number;
  submitted: number;
  needsRework: number;
  approved: number;
  hiringInProgress: number;
  inFlightApprovals: number;
}

export interface JobRequestPayload {
  requestTypeId: string;
  budgetImpacting: boolean;
  fundingTypeId: string;
  orgUnitId: string;
  classificationId: string;
  levelId: string;
  reportsToPositionId: string | null;
  targetPositionId: string | null;
  title: string;
  headcount: number;
  fte: number;
  weeklyHours: number;
  justification: string | null;
  businessCase: string | null;
  fieldValues: Array<{ fieldKey: string; fieldLabel: string; valueType: string; value: string | null }>;
}

export interface HiringPayload {
  positionId?: string | null;
  selectedEmployeeId?: string | null;
  candidateName: string;
  competitionNumber: string;
  compensationAmount: number;
  payFrequency: string;
  hireDate: string;
  notes?: string | null;
}

export interface ApprovalRuleSetPayload {
  name: string;
  description: string | null;
  status: 'Draft' | 'Active' | 'Archived';
  version: number;
  scopeOrgUnitId: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  rules: Array<{
    id?: string;
    name: string;
    priority: number;
    isActive: boolean;
    isFallback: boolean;
    requestTypeId: string | null;
    fundingTypeId: string | null;
    budgetImpacting: boolean | null;
    requestorRole: string | null;
    orgUnitId: string | null;
    conditions: Record<string, unknown> | null;
    steps: Array<{
      id?: string;
      stepOrder: number;
      label: string;
      assigneeSource: 'RequestorManager' | 'PositionIncumbent' | 'Queue' | 'SpecificAccount';
      assigneeValue: string | null;
      fallbackQueueKey: string | null;
      escalationDays: number | null;
      dueDays: number | null;
    }>;
  }>;
}

export const getRecruitmentSummary = async () => {
  const response = await apiRequest<{ success: true; data: RecruitmentSummary }>('/api/recruitment/summary', {}, 'Unable to load recruitment summary.');
  return response.data;
};

export const listJobRequests = async (params: Partial<{ status: JobRequestStatus; requestTypeId: string; orgUnitId: string; search: string }> = {}) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord[] }>(`/api/recruitment/requests${buildQuery(params)}`, {}, 'Unable to load job requests.');
  return response.data;
};

export const getJobRequest = async (id: string) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}`, {}, 'Unable to load the job request.');
  return response.data;
};

export const createJobRequest = async (payload: JobRequestPayload) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>('/api/recruitment/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the job request.');
  return response.data;
};

export const updateJobRequest = async (id: string, payload: Partial<JobRequestPayload>) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the job request.');
  return response.data;
};

export const submitJobRequest = async (id: string) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, 'Unable to submit the job request.');
  return response.data;
};

export const reworkJobRequest = async (id: string, comments?: string | null) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}/rework`, {
    method: 'POST',
    body: JSON.stringify({ comments: comments ?? null }),
  }, 'Unable to move the job request back to draft.');
  return response.data;
};

export const cancelJobRequest = async (id: string, comments?: string | null) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ comments: comments ?? null }),
  }, 'Unable to cancel the job request.');
  return response.data;
};

export const approveJobRequest = async (id: string, comments?: string | null) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comments: comments ?? null }),
  }, 'Unable to approve the job request.');
  return response.data;
};

export const rejectJobRequest = async (id: string, comments?: string | null) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ comments: comments ?? null }),
  }, 'Unable to reject the job request.');
  return response.data;
};

export const createHiringRecord = async (requestId: string, payload: HiringPayload) => {
  const response = await apiRequest<{ success: true; data: JobRequestRecord }>(`/api/recruitment/requests/${requestId}/hiring`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to capture hiring details.');
  return response.data;
};

export const listRequestTypes = async () => {
  const response = await apiRequest<{ success: true; data: RequestTypeRecord[] }>('/api/recruitment/request-types', {}, 'Unable to load request types.');
  return response.data;
};

export const listFundingTypes = async () => {
  const response = await apiRequest<{ success: true; data: FundingTypeRecord[] }>('/api/recruitment/funding-types', {}, 'Unable to load funding types.');
  return response.data;
};

export const listApprovalRuleSets = async () => {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>('/api/recruitment/approval-rule-sets', {}, 'Unable to load approval rule sets.');
  return response.data;
};

export const createApprovalRuleSet = async (payload: ApprovalRuleSetPayload) => {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>('/api/recruitment/approval-rule-sets', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the approval rule set.');
  return response.data;
};

export const updateApprovalRuleSet = async (id: string, payload: Partial<ApprovalRuleSetPayload>) => {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>(`/api/recruitment/approval-rule-sets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the approval rule set.');
  return response.data;
};

export const publishApprovalRuleSet = async (id: string) => {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>(`/api/recruitment/approval-rule-sets/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, 'Unable to publish the approval rule set.');
  return response.data;
};

export const simulateApprovalRuleSet = async (id: string, payload: {
  requestTypeId: string;
  budgetImpacting: boolean;
  fundingTypeId: string;
  orgUnitId: string;
  requestorRole?: string | null;
}) => {
  const response = await apiRequest<{ success: true; data: {
    matched: boolean;
    ruleSetId: string;
    ruleSetName: string;
    rule: { id: string; name: string; priority: number; isFallback: boolean } | null;
    steps: ApprovalRuleStepRecord[];
  } }>(`/api/recruitment/approval-rule-sets/${id}/simulate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to simulate the approval route.');
  return response.data;
};
