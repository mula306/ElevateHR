import { prisma } from '../../shared/lib/prisma';
import { getFeatureStateRecord, isFeatureEnabled, taskTypeFeatureMap } from '../../shared/lib/features';
import { getInboxSummary } from '../inbox/inbox.service';
import { toIsoString } from '../../shared/lib/service-utils';

const TERMINATED_STATUS = 'Terminated';

function getQuarterStart(date: Date): Date {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function shiftUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
  }).format(date);
}

function calculatePercentChange(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function isCurrentEmployeeStatus(status: string) {
  return status !== TERMINATED_STATUS;
}

function isEmployedOn(employee: { hireDate: Date; terminationDate: Date | null }, date: Date) {
  if (employee.hireDate > date) {
    return false;
  }

  if (!employee.terminationDate) {
    return true;
  }

  return employee.terminationDate > date;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export async function getDashboardSummary(currentAccount?: Express.Request['account']) {
  const now = new Date();
  const nextThirtyDays = addUtcDays(now, 30);
  const quarterStart = getQuarterStart(now);
  const previousQuarterStart = shiftUtcMonths(quarterStart, -3);
  const hiringTrendStart = shiftUtcMonths(getMonthStart(now), -5);
  const featureStates = await getFeatureStateRecord();
  const timeOffRequestsEnabled = isFeatureEnabled(featureStates, 'time_off_requests');
  const disabledTaskTypes = Object.entries(taskTypeFeatureMap)
    .filter(([, featureKey]) => featureKey && !isFeatureEnabled(featureStates, featureKey))
    .map(([taskType]) => taskType);

  const [
    employees,
    recentEmployees,
    positions,
    workflowTasks,
    leaveApprovals,
    upcomingApprovedLeave,
    lifecycleChecklists,
    documentAlerts,
    inboxSummary,
  ] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
        hireDate: true,
        terminationDate: true,
        status: true,
        salary: true,
      },
    }),
    prisma.employee.findMany({
      take: 5,
      orderBy: [
        { hireDate: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
        hireDate: true,
        status: true,
        salary: true,
      },
    }),
    prisma.position.findMany({
      where: { recordStatus: 'Active' },
      select: {
        id: true,
        headcount: true,
        employees: {
          where: { status: { not: TERMINATED_STATUS } },
          select: { id: true },
        },
      },
    }),
    prisma.workflowTask.findMany({
      where: {
        status: 'Open',
        ...(disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        taskType: true,
        title: true,
        dueDate: true,
        ownerLabel: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    timeOffRequestsEnabled
      ? prisma.workflowTask.findMany({
        where: {
          status: 'Open',
          taskType: 'LeaveApproval',
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          title: true,
          dueDate: true,
          ownerLabel: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    timeOffRequestsEnabled
      ? prisma.leaveRequest.findMany({
        where: {
          status: 'Approved',
          startDate: { gte: now, lte: nextThirtyDays },
        },
        orderBy: [{ startDate: 'asc' }],
        take: 6,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          requestedHours: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          leaveType: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    prisma.employeeChecklist.findMany({
      where: {
        status: { not: 'Completed' },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 6,
      select: {
        id: true,
        title: true,
        lifecycleType: true,
        dueDate: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        items: {
          where: { status: { not: 'Completed' } },
          select: { id: true },
        },
      },
    }),
    prisma.employeeDocument.findMany({
      where: {
        OR: [
          { status: 'Pending Acknowledgment' },
          { status: 'Expired' },
          { expiryDate: { gte: now, lte: nextThirtyDays } },
        ],
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        expiryDate: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    getInboxSummary(currentAccount),
  ]);

  const departmentStats = new Map<string, { employeeCount: number; annualPayroll: number }>();
  const hiringTrend = new Map<string, { label: string; hires: number }>();

  for (let offset = 0; offset < 6; offset += 1) {
    const bucketDate = shiftUtcMonths(getMonthStart(now), -offset);
    hiringTrend.set(formatMonthKey(bucketDate), {
      label: formatMonthLabel(bucketDate),
      hires: 0,
    });
  }

  let totalEmployees = 0;
  let currentEmployees = 0;
  let activeEmployees = 0;
  let onLeaveEmployees = 0;
  let probationEmployees = 0;
  let terminatedEmployees = 0;
  let newHiresThisQuarter = 0;
  let previousQuarterNewHires = 0;
  let annualPayroll = 0;

  for (const employee of employees) {
    totalEmployees += 1;
    const salary = Number(employee.salary);
    const isCurrentEmployee = isCurrentEmployeeStatus(employee.status);

    if (employee.status === 'Active') {
      activeEmployees += 1;
    } else if (employee.status === 'On Leave') {
      onLeaveEmployees += 1;
    } else if (employee.status === 'Probation') {
      probationEmployees += 1;
    } else if (employee.status === TERMINATED_STATUS) {
      terminatedEmployees += 1;
    }

    if (isCurrentEmployee) {
      currentEmployees += 1;
      annualPayroll += salary;

      const existingDepartment = departmentStats.get(employee.department) ?? {
        employeeCount: 0,
        annualPayroll: 0,
      };

      existingDepartment.employeeCount += 1;
      existingDepartment.annualPayroll += salary;
      departmentStats.set(employee.department, existingDepartment);
    }

    if (employee.hireDate >= quarterStart) {
      newHiresThisQuarter += 1;
    } else if (employee.hireDate >= previousQuarterStart && employee.hireDate < quarterStart) {
      previousQuarterNewHires += 1;
    }

    if (employee.hireDate >= hiringTrendStart) {
      const bucketDate = getMonthStart(employee.hireDate);
      const bucketKey = formatMonthKey(bucketDate);
      const existingBucket = hiringTrend.get(bucketKey);

      if (existingBucket) {
        existingBucket.hires += 1;
        hiringTrend.set(bucketKey, existingBucket);
      }
    }
  }

  const approvedHeadcount = positions.reduce((total, position) => total + position.headcount, 0);
  const filledSeats = positions.reduce((total, position) => total + position.employees.length, 0);
  const openSeats = Math.max(approvedHeadcount - filledSeats, 0);
  const activeStatusRate = currentEmployees === 0
    ? 0
    : Number(((activeEmployees / currentEmployees) * 100).toFixed(1));
  const staffingCoverage = approvedHeadcount === 0
    ? 0
    : Number(((filledSeats / approvedHeadcount) * 100).toFixed(1));
  const averageAnnualSalary = currentEmployees === 0
    ? 0
    : Math.round(annualPayroll / currentEmployees);
  const currentWorkforceAtQuarterStart = employees.filter((employee) => isEmployedOn(employee, quarterStart)).length;

  return {
    metrics: {
      totalEmployees,
      currentEmployees,
      activeEmployees,
      onLeaveEmployees,
      probationEmployees,
      terminatedEmployees,
      newHiresThisQuarter,
      previousQuarterNewHires,
      annualPayroll,
      averageAnnualSalary,
      approvedHeadcount,
      filledSeats,
      openSeats,
      staffingCoverage,
      activeStatusRate,
      currentWorkforceTrend: calculatePercentChange(currentEmployees, currentWorkforceAtQuarterStart),
      newHireTrend: calculatePercentChange(newHiresThisQuarter, previousQuarterNewHires),
      pendingApprovals: leaveApprovals.length,
      overdueTasks: workflowTasks.filter((task) => task.dueDate && task.dueDate < now).length,
      upcomingAbsences: upcomingApprovedLeave.length,
      expiringDocuments: documentAlerts.filter((document) => document.status !== 'Pending Acknowledgment').length,
    },
    myWork: {
      openCount: inboxSummary.openCount,
      overdueCount: inboxSummary.overdueCount,
      approvalCount: inboxSummary.approvalCount,
      dueTodayCount: inboxSummary.dueTodayCount,
    },
    departmentDistribution: [...departmentStats.entries()]
      .map(([department, values]) => ({
        department,
        employeeCount: values.employeeCount,
        annualPayroll: values.annualPayroll,
        workforceShare: currentEmployees === 0
          ? 0
          : Number(((values.employeeCount / currentEmployees) * 100).toFixed(1)),
      }))
      .sort((left, right) => right.employeeCount - left.employeeCount),
    hiringTrend: [...hiringTrend.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([month, values]) => ({
        month,
        label: values.label,
        hires: values.hires,
      })),
    recentEmployees: recentEmployees.map((employee) => ({
      ...employee,
      salary: Number(employee.salary),
      hireDate: toIsoString(employee.hireDate),
      fullName: `${employee.firstName} ${employee.lastName}`,
      initials: getInitials(employee.firstName, employee.lastName),
    })),
    approvalInbox: leaveApprovals.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: toIsoString(task.dueDate),
      ownerLabel: task.ownerLabel ?? null,
      employee: task.employee ? {
        id: task.employee.id,
        fullName: `${task.employee.firstName} ${task.employee.lastName}`,
      } : null,
    })),
    workflowInbox: workflowTasks.map((task) => ({
      id: task.id,
      taskType: task.taskType,
      title: task.title,
      dueDate: toIsoString(task.dueDate),
      ownerLabel: task.ownerLabel ?? null,
      employee: task.employee ? {
        id: task.employee.id,
        fullName: `${task.employee.firstName} ${task.employee.lastName}`,
      } : null,
    })),
    upcomingTimeOff: upcomingApprovedLeave.map((leaveRequest) => ({
      id: leaveRequest.id,
      startDate: toIsoString(leaveRequest.startDate),
      endDate: toIsoString(leaveRequest.endDate),
      requestedHours: Number(leaveRequest.requestedHours),
      employee: leaveRequest.employee ? {
        id: leaveRequest.employee.id,
        employeeNumber: leaveRequest.employee.employeeNumber,
        fullName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
        department: leaveRequest.employee.department,
      } : null,
      leaveType: leaveRequest.leaveType ? {
        id: leaveRequest.leaveType.id,
        code: leaveRequest.leaveType.code,
        name: leaveRequest.leaveType.name,
      } : null,
    })),
    lifecycleQueue: lifecycleChecklists.map((checklist) => ({
      id: checklist.id,
      title: checklist.title,
      lifecycleType: checklist.lifecycleType,
      dueDate: toIsoString(checklist.dueDate),
      openItems: checklist.items.length,
      employee: checklist.employee ? {
        id: checklist.employee.id,
        employeeNumber: checklist.employee.employeeNumber,
        fullName: `${checklist.employee.firstName} ${checklist.employee.lastName}`,
        department: checklist.employee.department,
      } : null,
    })),
    documentAlerts: documentAlerts.map((document) => ({
      id: document.id,
      title: document.title,
      status: document.status,
      expiryDate: toIsoString(document.expiryDate),
      employee: document.employee ? {
        id: document.employee.id,
        employeeNumber: document.employee.employeeNumber,
        fullName: `${document.employee.firstName} ${document.employee.lastName}`,
      } : null,
    })),
  };
}
