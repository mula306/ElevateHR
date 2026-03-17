export type RecordStatus = 'Active' | 'Archived';
export type PositionStatus = 'Active' | 'Vacant' | 'On Hold';

export interface ArchivePayload {
  archiveReason?: string | null;
}

export interface OrgUnitRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  parent: { id: string; code: string; name: string; recordStatus: RecordStatus } | null;
  activeChildCount: number;
  activePositionCount: number;
  incumbentCount: number;
  recordStatus: RecordStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LevelRecord {
  id: string;
  classificationId: string;
  levelCode: string;
  currency: string;
  rangeMin: number;
  rangeMid: number;
  rangeMax: number;
  recordStatus: RecordStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  activePositionCount: number;
  classification: { id: string; code: string; title: string; occupationCode: string; annualHours: number; recordStatus: RecordStatus } | null;
}

export interface ClassificationRecord {
  id: string;
  code: string;
  title: string;
  occupationCode: string;
  annualHours: number;
  family: string | null;
  description: string | null;
  recordStatus: RecordStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  activePositionCount: number;
  levels: Array<{
    id: string;
    classificationId: string;
    levelCode: string;
    currency: string;
    rangeMin: number;
    rangeMid: number;
    rangeMax: number;
    recordStatus: RecordStatus;
    archivedAt: string | null;
    archivedBy: string | null;
    archiveReason: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    activePositionCount: number;
  }>;
}

export interface EmployeeOption {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  jobTitle: string;
  department: string;
  positionId: string | null;
  currentPosition: { id: string; positionCode: string; title: string; recordStatus: RecordStatus } | null;
}

export interface PositionRecord {
  id: string;
  positionCode: string;
  title: string;
  positionStatus: PositionStatus;
  headcount: number;
  vacancyCount: number;
  recordStatus: RecordStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  orgUnit: { id: string; code: string; name: string; type: string; recordStatus: RecordStatus } | null;
  classification: { id: string; code: string; title: string; occupationCode: string; annualHours: number; family: string | null; recordStatus: RecordStatus } | null;
  level: { id: string; classificationId: string; levelCode: string; currency: string; rangeMin: number; rangeMid: number; rangeMax: number; recordStatus: RecordStatus } | null;
  reportsToPosition: { id: string; positionCode: string; title: string; recordStatus: RecordStatus } | null;
  directReportCount: number;
  incumbents: Array<{ id: string; employeeNumber: string; firstName: string; lastName: string; fullName: string; status: string; jobTitle: string; department: string; positionId: string | null }>;
}

export interface OrgUnitNode {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  summary: {
    approvedPositions: number;
    filledPositions: number;
    openSeats: number;
    incumbentEmployees: number;
  };
  positions: PositionRecord[];
  children: OrgUnitNode[];
}

export interface OrganizationSnapshot {
  metrics: {
    orgUnitCount: number;
    positionCount: number;
    filledPositionCount: number;
    openSeatCount: number;
    classificationCount: number;
  };
  orgUnits: OrgUnitNode[];
  positions: PositionRecord[];
  classifications: ClassificationRecord[];
}

export interface OrgUnitPayload {
  code?: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface PositionPayload {
  positionCode?: string;
  title: string;
  orgUnitId: string;
  classificationId: string;
  levelId: string;
  reportsToPositionId: string | null;
  headcount: number;
  positionStatus: PositionStatus;
  incumbentEmployeeIds: string[];
}

export interface ClassificationPayload {
  code?: string;
  title: string;
  occupationCode: string;
  annualHours: number;
  family: string | null;
  description: string | null;
}

export interface LevelPayload {
  classificationId?: string;
  levelCode?: string;
  currency: string;
  rangeMin: number;
  rangeMid: number;
  rangeMax: number;
}

interface ApiErrorShape {
  error?: { message?: string };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init: RequestInit = {}, fallbackMessage = 'Unable to complete the request.') {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const payload = await response.json() as ApiErrorShape;
      message = payload.error?.message ?? message;
    } catch {
      // Keep the fallback message when the response body is not JSON.
    }

    throw new Error(message);
  }

  const payload = await response.json() as { success: true; data: T };
  return payload.data;
}

export const getOrganizationSnapshot = () => request<OrganizationSnapshot>('/api/organization', {}, 'Unable to load organization workspace.');
export const listOrgUnits = (includeArchived = true) => request<OrgUnitRecord[]>(`/api/organization/org-units${buildQuery({ includeArchived })}`, {}, 'Unable to load org units.');
export const listPositions = (includeArchived = true) => request<PositionRecord[]>(`/api/organization/positions${buildQuery({ includeArchived })}`, {}, 'Unable to load positions.');
export const listClassifications = (includeArchived = true) => request<ClassificationRecord[]>(`/api/organization/classifications${buildQuery({ includeArchived })}`, {}, 'Unable to load classifications.');
export const listLevels = (includeArchived = true) => request<LevelRecord[]>(`/api/organization/levels${buildQuery({ includeArchived })}`, {}, 'Unable to load classification levels.');
export const listEmployeeOptions = () => request<EmployeeOption[]>('/api/organization/employee-options', {}, 'Unable to load employee options.');

export const createOrgUnit = (payload: OrgUnitPayload) => request<OrgUnitRecord>('/api/organization/org-units', { method: 'POST', body: JSON.stringify(payload) }, 'Unable to create org unit.');
export const updateOrgUnit = (id: string, payload: OrgUnitPayload) => request<OrgUnitRecord>(`/api/organization/org-units/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Unable to update org unit.');
export const archiveOrgUnit = (id: string, payload: ArchivePayload) => request<OrgUnitRecord>(`/api/organization/org-units/${id}/archive`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to archive org unit.');
export const restoreOrgUnit = (id: string) => request<OrgUnitRecord>(`/api/organization/org-units/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }, 'Unable to restore org unit.');

export const createPosition = (payload: PositionPayload) => request<PositionRecord>('/api/organization/positions', { method: 'POST', body: JSON.stringify(payload) }, 'Unable to create position.');
export const updatePosition = (id: string, payload: PositionPayload) => request<PositionRecord>(`/api/organization/positions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Unable to update position.');
export const archivePosition = (id: string, payload: ArchivePayload) => request<PositionRecord>(`/api/organization/positions/${id}/archive`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to archive position.');
export const restorePosition = (id: string) => request<PositionRecord>(`/api/organization/positions/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }, 'Unable to restore position.');

export const createClassification = (payload: ClassificationPayload) => request<ClassificationRecord>('/api/organization/classifications', { method: 'POST', body: JSON.stringify(payload) }, 'Unable to create classification.');
export const updateClassification = (id: string, payload: ClassificationPayload) => request<ClassificationRecord>(`/api/organization/classifications/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Unable to update classification.');
export const archiveClassification = (id: string, payload: ArchivePayload) => request<ClassificationRecord>(`/api/organization/classifications/${id}/archive`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to archive classification.');
export const restoreClassification = (id: string) => request<ClassificationRecord>(`/api/organization/classifications/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }, 'Unable to restore classification.');

export const createLevel = (payload: LevelPayload & { classificationId: string; levelCode: string }) => request<LevelRecord>('/api/organization/levels', { method: 'POST', body: JSON.stringify(payload) }, 'Unable to create classification level.');
export const updateLevel = (id: string, payload: LevelPayload) => request<LevelRecord>(`/api/organization/levels/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, 'Unable to update classification level.');
export const archiveLevel = (id: string, payload: ArchivePayload) => request<LevelRecord>(`/api/organization/levels/${id}/archive`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to archive classification level.');
export const restoreLevel = (id: string) => request<LevelRecord>(`/api/organization/levels/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }, 'Unable to restore classification level.');
