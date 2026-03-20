import { apiRequest } from '@/shared/lib/api';
import type { FeatureKey, FeatureState } from '@/shared/features/feature-registry';
import type { ApprovalRuleSetPayload, ApprovalRuleSetRecord, FundingTypeRecord, RequestTypeRecord } from '@/pages/recruitment/recruitment.api';

export interface SkillTagSettingRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SkillCategorySettingRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  tags: SkillTagSettingRecord[];
}

export async function listFeatureSettings() {
  const response = await apiRequest<{ success: true; data: FeatureState[] }>('/api/settings/features', {}, 'Unable to load feature settings.');
  return response.data;
}

export async function updateFeatureSetting(featureKey: FeatureKey, enabled: boolean) {
  const response = await apiRequest<{ success: true; data: FeatureState }>(`/api/settings/features/${featureKey}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  }, 'Unable to update the feature setting.');
  return response.data;
}

export async function listSkillSettings() {
  const response = await apiRequest<{ success: true; data: SkillCategorySettingRecord[] }>('/api/settings/skills', {}, 'Unable to load skills taxonomy.');
  return response.data;
}

export async function createSkillCategory(payload: {
  code: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const response = await apiRequest<{ success: true; data: SkillCategorySettingRecord[] }>('/api/settings/skill-categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the skill category.');
  return response.data;
}

export async function updateSkillCategory(id: string, payload: Partial<{
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}>) {
  const response = await apiRequest<{ success: true; data: SkillCategorySettingRecord[] }>(`/api/settings/skill-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the skill category.');
  return response.data;
}

export async function createSkillTag(payload: {
  categoryId: string;
  code: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const response = await apiRequest<{ success: true; data: SkillCategorySettingRecord[] }>('/api/settings/skills/tags', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the skill.');
  return response.data;
}

export async function updateSkillTag(id: string, payload: Partial<{
  categoryId: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}>) {
  const response = await apiRequest<{ success: true; data: SkillCategorySettingRecord[] }>(`/api/settings/skills/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the skill.');
  return response.data;
}

export async function listRequestTypes() {
  const response = await apiRequest<{ success: true; data: RequestTypeRecord[] }>('/api/settings/request-types', {}, 'Unable to load request types.');
  return response.data;
}

export async function createRequestType(payload: {
  code: string;
  name: string;
  description?: string | null;
  fieldSchema?: string | null;
  isActive?: boolean;
}) {
  const response = await apiRequest<{ success: true; data: RequestTypeRecord[] }>('/api/settings/request-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the request type.');
  return response.data;
}

export async function updateRequestType(id: string, payload: Partial<{
  code: string;
  name: string;
  description: string | null;
  fieldSchema: string | null;
  isActive: boolean;
}>) {
  const response = await apiRequest<{ success: true; data: RequestTypeRecord[] }>(`/api/settings/request-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the request type.');
  return response.data;
}

export async function listFundingTypes() {
  const response = await apiRequest<{ success: true; data: FundingTypeRecord[] }>('/api/settings/funding-types', {}, 'Unable to load funding types.');
  return response.data;
}

export async function createFundingType(payload: {
  code: string;
  name: string;
  category?: string | null;
  description?: string | null;
  durationType?: string | null;
  isPermanent?: boolean;
  isActive?: boolean;
}) {
  const response = await apiRequest<{ success: true; data: FundingTypeRecord[] }>('/api/settings/funding-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the funding type.');
  return response.data;
}

export async function updateFundingType(id: string, payload: Partial<{
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  durationType: string | null;
  isPermanent: boolean;
  isActive: boolean;
}>) {
  const response = await apiRequest<{ success: true; data: FundingTypeRecord[] }>(`/api/settings/funding-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the funding type.');
  return response.data;
}

export async function listApprovalRuleSets() {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>('/api/settings/approval-rule-sets', {}, 'Unable to load approval rule sets.');
  return response.data;
}

export async function createApprovalRuleSet(payload: ApprovalRuleSetPayload) {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>('/api/settings/approval-rule-sets', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create the approval rule set.');
  return response.data;
}

export async function updateApprovalRuleSet(id: string, payload: Partial<ApprovalRuleSetPayload>) {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>(`/api/settings/approval-rule-sets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update the approval rule set.');
  return response.data;
}

export async function publishApprovalRuleSet(id: string) {
  const response = await apiRequest<{ success: true; data: ApprovalRuleSetRecord[] }>(`/api/settings/approval-rule-sets/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, 'Unable to publish the approval rule set.');
  return response.data;
}
