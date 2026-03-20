import { apiRequest } from '@/shared/lib/api';

export interface SkillCategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder?: number;
  isActive?: boolean;
  tags: SkillTagRecord[];
}

export interface SkillTagRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface MyProfileRecord {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  personalInfo: {
    email: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    emergencyRelation: string | null;
  };
  employmentInfo: {
    jobTitle: string;
    department: string;
    status: string;
    payFrequency: string;
    salary: number;
    manager: {
      id: string;
      employeeNumber: string;
      fullName: string;
      jobTitle: string;
    } | null;
    position: {
      id: string;
      positionCode: string;
      title: string;
    } | null;
    orgUnit: {
      id: string;
      code: string;
      name: string;
      type: string;
    } | null;
  };
}

export interface MyProfileWorkspace {
  accountLinked: boolean;
  profile: MyProfileRecord | null;
}

export interface MyProfileSkillRecord {
  id: string;
  source: string;
  selfReportedLevel: string | null;
  confidence: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  skillTag: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: {
      id: string;
      code: string;
      name: string;
    } | null;
  };
}

export interface MyProfileUpdatePayload {
  email: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
}

export interface MyProfileSkillPayload {
  skillTagId: string;
  selfReportedLevel?: string | null;
  confidence?: number | null;
}

export interface MyProfileSkillUpdatePayload {
  selfReportedLevel?: string | null;
  confidence?: number | null;
}

export async function getMyProfile() {
  const response = await apiRequest<{ success: true; data: MyProfileWorkspace }>('/api/my-profile', {}, 'Unable to load your profile.');
  return response.data;
}

export async function updateMyProfile(payload: MyProfileUpdatePayload) {
  const response = await apiRequest<{ success: true; data: MyProfileRecord }>('/api/my-profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update your profile.');
  return response.data;
}

export async function listMySkills() {
  const response = await apiRequest<{ success: true; data: MyProfileSkillRecord[] }>('/api/my-profile/skills', {}, 'Unable to load your skills.');
  return response.data;
}

export async function createMySkill(payload: MyProfileSkillPayload) {
  const response = await apiRequest<{ success: true; data: MyProfileSkillRecord }>('/api/my-profile/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to add your skill.');
  return response.data;
}

export async function updateMySkill(id: string, payload: MyProfileSkillUpdatePayload) {
  const response = await apiRequest<{ success: true; data: MyProfileSkillRecord }>(`/api/my-profile/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update your skill.');
  return response.data;
}

export async function deleteMySkill(id: string) {
  const response = await apiRequest<{ success: true; data: { id: string } }>(`/api/my-profile/skills/${id}`, {
    method: 'DELETE',
  }, 'Unable to remove your skill.');
  return response.data;
}

export async function listActiveSkillTaxonomy() {
  const response = await apiRequest<{ success: true; data: SkillCategoryRecord[] }>('/api/skills/taxonomy', {}, 'Unable to load skills taxonomy.');
  return response.data;
}
