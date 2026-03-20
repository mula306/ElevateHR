import { apiRequest } from '@/shared/lib/api';
import type { LearningReport } from '@/pages/learning/learning.api';
import type { TimeAttendanceReport } from '@/pages/time-attendance/time-attendance.api';

export interface OperationsReport {
  overview: {
    currentEmployees: number;
    openSeats: number;
    pendingApprovals: number;
    upcomingAbsences: number;
    overdueTasks: number;
    expiringDocuments: number;
    activePerformanceCycles: number;
    learningRenewals: number;
    pendingTimeApprovals: number;
    uncoveredShifts: number;
    openRecruitmentRequests: number;
  };
  headcountByOrgUnit: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    approvedHeadcount: number;
    filledSeats: number;
    openSeats: number;
    activeEmployees: number;
  }>;
  staffingCoverage: Array<{
    id: string;
    positionCode: string;
    title: string;
    orgUnit: {
      id: string;
      code: string;
      name: string;
    } | null;
    approvedHeadcount: number;
    filledSeats: number;
    openSeats: number;
    incumbents: Array<{
      id: string;
      fullName: string;
    }>;
  }>;
  peopleMovement: {
    newHiresLast90Days: number;
    terminationsLast90Days: number;
    events: Array<{
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
      eventDate: string | null;
      eventType: string;
      status: string;
    }>;
  };
  leaveSnapshot: {
    pendingApprovalCount: number;
    upcomingApprovedRequests: number;
    requests: Array<{
      id: string;
      startDate: string | null;
      endDate: string | null;
      requestedHours: number;
      employee: {
        id: string;
        employeeNumber: string;
        fullName: string;
        department: string;
      } | null;
      leaveType: {
        id: string;
        code: string;
        name: string;
      } | null;
    }>;
  };
  lifecycleStatus: Array<{
    id: string;
    title: string;
    lifecycleType: string;
    status: string;
    dueDate: string | null;
    openItems: number;
    overdueItems: number;
    employee: {
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
    } | null;
    items: Array<{
      id: string;
      title: string;
      ownerLabel: string;
      dueDate: string | null;
      status: string;
    }>;
  }>;
  documentCompliance: Array<{
    id: string;
    title: string;
    status: string;
    expiryDate: string | null;
    category: string | null;
    pendingAcknowledgments: number;
    employee: {
      id: string;
      employeeNumber: string;
      fullName: string;
      department: string;
    } | null;
  }>;
  performance: {
    activeCycleCount: number;
    draftCycleCount: number;
    overdueSelfReviews: number;
    overdueManagerReviews: number;
    pendingAcknowledgments: number;
    goalCompletionRate: number;
    reviews: Array<{
      id: string;
      employee: {
        id: string;
        employeeNumber: string;
        fullName: string;
        department: string;
      } | null;
      manager: string | null;
      cycleName: string;
      status: string;
      selfReviewDueDate: string | null;
      managerReviewDueDate: string | null;
      finalizedAt: string | null;
      acknowledgedAt: string | null;
    }>;
    goals: Array<{
      id: string;
      title: string;
      status: string;
      targetDate: string | null;
      employee: {
        id: string;
        employeeNumber: string;
        fullName: string;
        department: string;
      } | null;
      manager: string | null;
    }>;
  };
  recruitment: {
    openRequestCount: number;
    approvedRequestCount: number;
    closedRequestCount: number;
    requests: Array<{
      id: string;
      requestNumber: string;
      title: string;
      status: string;
      budgetImpacting: boolean;
      submittedAt: string | null;
      approvedAt: string | null;
      createdAt: string | null;
      orgUnit: {
        id: string;
        code: string;
        name: string;
      } | null;
      requestType: {
        id: string;
        code: string;
        name: string;
      } | null;
      requestor: {
        id: string;
        employeeNumber: string;
        fullName: string;
        department: string;
      } | null;
    }>;
  };
  learning: LearningReport;
  timeAttendance: TimeAttendanceReport;
  workflowInbox: Array<{
    id: string;
    taskType: string;
    title: string;
    dueDate: string | null;
    ownerLabel: string | null;
    employee: {
      id: string;
      fullName: string;
    } | null;
  }>;
}

export async function getOperationalReports() {
  const response = await apiRequest<{ success: true; data: OperationsReport }>('/api/reports/operations', {}, 'Unable to load operational reports.');
  return response.data;
}
