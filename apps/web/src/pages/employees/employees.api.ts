import { apiRequest, buildQuery } from '@/shared/lib/api';

export type EmployeeStatus = 'Active' | 'On Leave' | 'Terminated' | 'Probation';
export type EmployeePayFrequency = 'Biweekly' | 'Monthly' | 'Weekly';

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth?: string | null;
  hireDate: string | null;
  terminationDate?: string | null;
  jobTitle: string;
  department: string;
  positionId?: string | null;
  managerId?: string | null;
  salary: number;
  payFrequency?: EmployeePayFrequency;
  status: EmployeeStatus;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  opsSummary?: {
    openChecklistItems: number;
    pendingAcknowledgments: number;
    expiringDocuments: number;
    needsAttention: boolean;
  };
  learningSummary?: {
    assigned: number;
    overdue: number;
    completed: number;
    certificateAlerts: number;
  };
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
  } | null;
  position?: {
    id: string;
    positionCode: string;
    title: string;
  } | null;
  reports?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
  }>;
}

export interface EmployeeListResponse {
  success: true;
  data: Employee[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmployeeResponse {
  success: true;
  data: Employee;
}

export interface EmployeeMutationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  hireDate: string;
  jobTitle: string;
  department: string;
  managerId: string | null;
  salary: number;
  payFrequency: EmployeePayFrequency;
  status: EmployeeStatus;
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

export async function listEmployees(params: Record<string, string | number | boolean | undefined>) {
  return apiRequest<EmployeeListResponse>(`/api/employees${buildQuery(params)}`, {}, 'Unable to load employees.');
}

export async function getEmployee(id: string) {
  return apiRequest<EmployeeResponse>(`/api/employees/${id}`, {}, 'Unable to load employee details.');
}

export async function createEmployee(payload: EmployeeMutationPayload) {
  return apiRequest<EmployeeResponse>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create employee.');
}

export async function updateEmployee(id: string, payload: EmployeeMutationPayload) {
  return apiRequest<EmployeeResponse>(`/api/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update employee.');
}

export async function deleteEmployee(id: string) {
  return apiRequest<{ success: true; message: string }>(`/api/employees/${id}`, {
    method: 'DELETE',
  }, 'Unable to terminate employee.');
}
