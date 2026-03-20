import { apiRequest, buildQuery } from '@/shared/lib/api';

export interface TeamEmployeeSkillRecord {
  id: string;
  source: string;
  selfReportedLevel: string | null;
  confidence: number | null;
  validationStatus: 'Unreviewed' | 'Validated' | 'NotValidated';
  managerNote: string | null;
  validatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  validatedByEmployee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
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

export interface TeamSkillGroupRecord {
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  };
  skills: TeamEmployeeSkillRecord[];
}

export async function listTeamSkills(employeeId?: string) {
  const response = await apiRequest<{ success: true; data: TeamSkillGroupRecord[] }>(`/api/skills/team${buildQuery({ employeeId })}`, {}, 'Unable to load team skills.');
  return response.data;
}

export async function validateTeamSkill(id: string, managerNote?: string | null) {
  const response = await apiRequest<{ success: true; data: TeamEmployeeSkillRecord }>(`/api/skills/team/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify({ managerNote: managerNote ?? null }),
  }, 'Unable to validate the skill.');
  return response.data;
}

export async function markTeamSkillNotValidated(id: string, managerNote?: string | null) {
  const response = await apiRequest<{ success: true; data: TeamEmployeeSkillRecord }>(`/api/skills/team/${id}/not-validated`, {
    method: 'POST',
    body: JSON.stringify({ managerNote: managerNote ?? null }),
  }, 'Unable to mark the skill as not validated.');
  return response.data;
}
