import { apiRequest, buildQuery } from '@/shared/lib/api';

export interface LeaveTypeRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  accentColor: string | null;
  isActive: boolean;
}

export interface HolidayRecord {
  id: string;
  name: string;
  holidayDate: string | null;
  note: string | null;
  orgUnit: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
}

export interface LeaveRequestRecord {
  id: string;
  startDate: string | null;
  endDate: string | null;
  requestedHours: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  notes: string | null;
  decisionComment: string | null;
  respondedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    status: string;
    jobTitle: string;
    department: string;
  } | null;
  approver: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    jobTitle: string;
  } | null;
  leaveType: LeaveTypeRecord | null;
  canEdit: boolean;
  canCancel: boolean;
}

export interface LeaveRequestPayload {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  requestedHours: number;
  notes?: string | null;
}

export interface LeaveDecisionPayload {
  comments?: string | null;
}

export interface LeaveRequestListResponse {
  success: true;
  data: LeaveRequestRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listLeaveTypes() {
  const response = await apiRequest<{ success: true; data: LeaveTypeRecord[] }>('/api/time-off/leave-types', {}, 'Unable to load leave types.');
  return response.data;
}

export async function listHolidays() {
  const response = await apiRequest<{ success: true; data: HolidayRecord[] }>('/api/time-off/holidays', {}, 'Unable to load holidays.');
  return response.data;
}

export async function listLeaveRequests(params: Record<string, string | number | boolean | null | undefined>) {
  return apiRequest<LeaveRequestListResponse>(`/api/time-off/leave-requests${buildQuery(params)}`, {}, 'Unable to load leave requests.');
}

export async function createLeaveRequest(payload: LeaveRequestPayload) {
  const response = await apiRequest<{ success: true; data: LeaveRequestRecord }>('/api/time-off/leave-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to create leave request.');
  return response.data;
}

export async function updateLeaveRequest(id: string, payload: Partial<LeaveRequestPayload>) {
  const response = await apiRequest<{ success: true; data: LeaveRequestRecord }>(`/api/time-off/leave-requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, 'Unable to update leave request.');
  return response.data;
}

export async function cancelLeaveRequest(id: string, payload: LeaveDecisionPayload = {}) {
  const response = await apiRequest<{ success: true; data: LeaveRequestRecord }>(`/api/time-off/leave-requests/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to cancel leave request.');
  return response.data;
}

export async function approveLeaveRequest(id: string, payload: LeaveDecisionPayload) {
  const response = await apiRequest<{ success: true; data: LeaveRequestRecord }>(`/api/time-off/leave-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to approve leave request.');
  return response.data;
}

export async function rejectLeaveRequest(id: string, payload: LeaveDecisionPayload) {
  const response = await apiRequest<{ success: true; data: LeaveRequestRecord }>(`/api/time-off/leave-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 'Unable to reject leave request.');
  return response.data;
}
