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
  hireDate: string;
  jobTitle: string;
  department: string;
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
  createdAt?: string;
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

interface ApiErrorShape {
  error?: {
    message?: string;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = 'Something went wrong while contacting the API.';

    try {
      const payload = await response.json() as ApiErrorShape;
      message = payload.error?.message ?? message;
    } catch {
      // Leave the default message if the response body is not JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function listEmployees(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  return request<EmployeeListResponse>(`/api/employees?${searchParams.toString()}`);
}

export async function getEmployee(id: string) {
  return request<EmployeeResponse>(`/api/employees/${id}`);
}

export async function createEmployee(payload: EmployeeMutationPayload) {
  return request<EmployeeResponse>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(id: string, payload: EmployeeMutationPayload) {
  return request<EmployeeResponse>(`/api/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployee(id: string) {
  return request<{ success: true; message: string }>(`/api/employees/${id}`, {
    method: 'DELETE',
  });
}
