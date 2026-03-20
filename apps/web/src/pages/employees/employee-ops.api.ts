import { apiRequest, buildQuery } from '@/shared/lib/api';

export interface ChecklistTemplateRecord {
  id: string;
  code: string;
  name: string;
  lifecycleType: string;
  description: string | null;
  isActive: boolean;
  items: Array<{
    id: string;
    title: string;
    ownerLabel: string;
    dueDaysOffset: number;
    sortOrder: number;
    isRequired: boolean;
  }>;
}

export interface EmployeeChecklistRecord {
  id: string;
  title: string;
  lifecycleType: string;
  status: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  summary: {
    totalItems: number;
    completedItems: number;
    openItems: number;
  };
  items: Array<{
    id: string;
    title: string;
    ownerLabel: string;
    dueDate: string | null;
    status: 'Open' | 'Completed';
    isRequired: boolean;
    sortOrder: number;
    completedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
}

export interface DocumentCategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface DocumentTemplateRecord {
  id: string;
  code: string;
  name: string;
  requiresAcknowledgement: boolean;
  defaultExpiryDays: number | null;
  isActive: boolean;
  category: DocumentCategoryRecord | null;
}

export interface EmployeeDocumentRecord {
  id: string;
  title: string;
  status: string;
  required: boolean;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  category: DocumentCategoryRecord | null;
  template: DocumentTemplateRecord | null;
  acknowledgments: Array<{
    id: string;
    status: string;
    dueDate: string | null;
    acknowledgedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    employee: {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
      fullName: string;
      status: string;
    } | null;
  }>;
}

export interface EmployeeChecklistPayload {
  employeeId: string;
  templateId?: string | null;
  lifecycleType?: 'Onboarding' | 'Offboarding';
}

export interface EmployeeDocumentPayload {
  employeeId: string;
  categoryId: string;
  templateId?: string | null;
  title: string;
  required: boolean;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

export async function listChecklistTemplates() {
  const response = await apiRequest<{ success: true; data: ChecklistTemplateRecord[] }>('/api/employee-checklists/templates', {}, 'Unable to load checklist templates.');
  return response.data;
}

export async function listEmployeeChecklists(employeeId: string) {
  const response = await apiRequest<{ success: true; data: EmployeeChecklistRecord[] }>(`/api/employee-checklists${buildQuery({ employeeId })}`, {}, 'Unable to load employee checklists.');
  return response.data;
}

export async function createEmployeeChecklist(payload: EmployeeChecklistPayload) {
  const response = await apiRequest<{ success: true; data: EmployeeChecklistRecord }>('/api/employee-checklists', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create employee checklist.');
  return response.data;
}

export async function updateChecklistItem(id: string, status: 'Open' | 'Completed') {
  const response = await apiRequest<{ success: true; data: EmployeeChecklistRecord }>(`/api/employee-checklists/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }, 'Unable to update checklist item.');
  return response.data;
}

export async function listDocumentReferenceData() {
  const response = await apiRequest<{ success: true; data: { categories: DocumentCategoryRecord[]; templates: DocumentTemplateRecord[] } }>('/api/employee-documents/reference-data', {}, 'Unable to load document reference data.');
  return response.data;
}

export async function listEmployeeDocuments(employeeId: string) {
  const response = await apiRequest<{ success: true; data: EmployeeDocumentRecord[] }>(`/api/employee-documents${buildQuery({ employeeId })}`, {}, 'Unable to load employee documents.');
  return response.data;
}

export async function createEmployeeDocument(payload: EmployeeDocumentPayload) {
  const response = await apiRequest<{ success: true; data: EmployeeDocumentRecord }>('/api/employee-documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create employee document.');
  return response.data;
}

export async function updateEmployeeDocument(id: string, payload: Partial<EmployeeDocumentPayload>) {
  const response = await apiRequest<{ success: true; data: EmployeeDocumentRecord }>(`/api/employee-documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update employee document.');
  return response.data;
}

export async function acknowledgeEmployeeDocument(id: string) {
  const response = await apiRequest<{ success: true; data: EmployeeDocumentRecord }>(`/api/employee-documents/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, 'Unable to acknowledge employee document.');
  return response.data;
}
