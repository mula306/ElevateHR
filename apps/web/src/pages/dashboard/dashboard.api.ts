import { apiRequest } from '@/shared/lib/api';

export interface DashboardMetrics {
  totalEmployees: number;
  currentEmployees: number;
  activeEmployees: number;
  onLeaveEmployees: number;
  probationEmployees: number;
  terminatedEmployees: number;
  newHiresThisQuarter: number;
  previousQuarterNewHires: number;
  annualPayroll: number;
  averageAnnualSalary: number;
  approvedHeadcount: number;
  filledSeats: number;
  openSeats: number;
  staffingCoverage: number;
  activeStatusRate: number;
  currentWorkforceTrend: number | null;
  newHireTrend: number | null;
  pendingApprovals: number;
  overdueTasks: number;
  upcomingAbsences: number;
  expiringDocuments: number;
}

export interface DepartmentDistributionDatum {
  department: string;
  employeeCount: number;
  annualPayroll: number;
  workforceShare: number;
}

export interface HiringTrendDatum {
  month: string;
  label: string;
  hires: number;
}

export interface DashboardEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  department: string;
  jobTitle: string;
  hireDate: string | null;
  status: string;
  salary: number;
}

export interface DashboardTaskRow {
  id: string;
  taskType?: string;
  title: string;
  dueDate: string | null;
  ownerLabel: string | null;
  employee: {
    id: string;
    fullName: string;
  } | null;
}

export interface DashboardLeaveRow {
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
}

export interface DashboardChecklistRow {
  id: string;
  title: string;
  lifecycleType: string;
  dueDate: string | null;
  openItems: number;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department: string;
  } | null;
}

export interface DashboardDocumentAlertRow {
  id: string;
  title: string;
  status: string;
  expiryDate: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
  } | null;
}

export interface DashboardSummary {
  metrics: DashboardMetrics;
  myWork: {
    openCount: number;
    overdueCount: number;
    approvalCount: number;
    dueTodayCount: number;
  };
  departmentDistribution: DepartmentDistributionDatum[];
  hiringTrend: HiringTrendDatum[];
  recentEmployees: DashboardEmployee[];
  approvalInbox: DashboardTaskRow[];
  workflowInbox: DashboardTaskRow[];
  upcomingTimeOff: DashboardLeaveRow[];
  lifecycleQueue: DashboardChecklistRow[];
  documentAlerts: DashboardDocumentAlertRow[];
}

const emptyDashboardSummary: DashboardSummary = {
  metrics: {
    totalEmployees: 0,
    currentEmployees: 0,
    activeEmployees: 0,
    onLeaveEmployees: 0,
    probationEmployees: 0,
    terminatedEmployees: 0,
    newHiresThisQuarter: 0,
    previousQuarterNewHires: 0,
    annualPayroll: 0,
    averageAnnualSalary: 0,
    approvedHeadcount: 0,
    filledSeats: 0,
    openSeats: 0,
    staffingCoverage: 0,
    activeStatusRate: 0,
    currentWorkforceTrend: null,
    newHireTrend: null,
    pendingApprovals: 0,
    overdueTasks: 0,
    upcomingAbsences: 0,
    expiringDocuments: 0,
  },
  myWork: {
    openCount: 0,
    overdueCount: 0,
    approvalCount: 0,
    dueTodayCount: 0,
  },
  departmentDistribution: [],
  hiringTrend: [],
  recentEmployees: [],
  approvalInbox: [],
  workflowInbox: [],
  upcomingTimeOff: [],
  lifecycleQueue: [],
  documentAlerts: [],
};

function normalizeDashboardSummary(summary: Partial<DashboardSummary> | null | undefined): DashboardSummary {
  return {
    metrics: {
      ...emptyDashboardSummary.metrics,
      ...(summary?.metrics ?? {}),
    },
    myWork: {
      ...emptyDashboardSummary.myWork,
      ...(summary?.myWork ?? {}),
    },
    departmentDistribution: Array.isArray(summary?.departmentDistribution) ? summary.departmentDistribution : [],
    hiringTrend: Array.isArray(summary?.hiringTrend) ? summary.hiringTrend : [],
    recentEmployees: Array.isArray(summary?.recentEmployees) ? summary.recentEmployees : [],
    approvalInbox: Array.isArray(summary?.approvalInbox) ? summary.approvalInbox : [],
    workflowInbox: Array.isArray(summary?.workflowInbox) ? summary.workflowInbox : [],
    upcomingTimeOff: Array.isArray(summary?.upcomingTimeOff) ? summary.upcomingTimeOff : [],
    lifecycleQueue: Array.isArray(summary?.lifecycleQueue) ? summary.lifecycleQueue : [],
    documentAlerts: Array.isArray(summary?.documentAlerts) ? summary.documentAlerts : [],
  };
}

export async function getDashboardSummary() {
  const response = await apiRequest<{ success: true; data: DashboardSummary }>('/api/dashboard', {}, 'Unable to load dashboard.');
  return normalizeDashboardSummary(response.data as Partial<DashboardSummary>);
}
