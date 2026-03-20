import { Prisma } from '../../generated/prisma';
import {
  ACCOUNT_QUEUE_HR_OPERATIONS,
  findActiveAccountIdByEmployeeId,
} from '../../shared/lib/accounts';
import {
  cancelWorkflowTasksForEntity,
  completeWorkflowTasksForEntity,
  createApprovalAction,
  createWorkflowTask,
  LEAVE_REQUEST_APPROVED_STATUS,
  TERMINATED_EMPLOYEE_STATUS,
  WORKFLOW_STATUS_CANCELLED,
  WORKFLOW_STATUS_COMPLETED,
  WORKFLOW_STATUS_OPEN,
} from '../../shared/lib/hr-ops';
import { prisma } from '../../shared/lib/prisma';
import {
  createHttpError,
  decimalToNumber,
  toDateValue,
  toIsoString,
  trimToNull,
} from '../../shared/lib/service-utils';
import type {
  CreateLaborGroupInput,
  CreateRuleProfileInput,
  CreateScheduleInput,
  CreateShiftTemplateInput,
  ListManagementExceptionsQuery,
  ListManagementSchedulesQuery,
  ListManagementTimeCardsQuery,
  MyTimeCardQuery,
  ScheduleRangeQuery,
  TimeCardDecisionInput,
  UpdateLaborGroupInput,
  UpdateRuleProfileInput,
  UpdateScheduleInput,
  UpdateShiftTemplateInput,
  UpdateTimeCardEntriesInput,
} from './time-attendance.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const TIME_CARD_ENTITY_TYPE = 'TimeCard';
const TIME_CARD_APPROVAL_TASK = 'TimeCardApproval';
const TIME_CARD_CORRECTION_TASK = 'TimeCardCorrection';
const OVERTIME_REVIEW_TASK = 'OvertimeReview';
const HOURS_PER_DAY_DEFAULT = 8;
const PAY_PERIOD_LENGTH_DAYS = 14;
const PAY_PERIOD_ANCHOR = new Date('2026-03-16T00:00:00.000Z');

interface TimeAttendanceContext {
  currentEmployeeId?: string | null;
  currentAccountId?: string | null;
  roles?: string[];
}

function isHrAdmin(context: TimeAttendanceContext) {
  return (context.roles ?? []).some((role) => HR_ADMIN_ROLES.has(role));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(date: Date, offset: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + offset,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function hoursBetween(startDateTime: Date, endDateTime: Date, breakMinutes = 0) {
  const totalMinutes = Math.max((endDateTime.getTime() - startDateTime.getTime()) / 60000 - breakMinutes, 0);
  return Number((totalMinutes / 60).toFixed(2));
}

function getPeriodStart(candidateDate?: Date | null) {
  const date = startOfUtcDay(candidateDate ?? new Date());
  const anchor = startOfUtcDay(PAY_PERIOD_ANCHOR);
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86400000);
  const completedPeriods = Math.floor(diffDays / PAY_PERIOD_LENGTH_DAYS);
  return addUtcDays(anchor, completedPeriods * PAY_PERIOD_LENGTH_DAYS);
}

function getPeriodEnd(periodStart: Date) {
  return endOfUtcDay(addUtcDays(periodStart, PAY_PERIOD_LENGTH_DAYS - 1));
}

function getWeekStart(date: Date) {
  const utcDate = startOfUtcDay(date);
  const day = utcDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addUtcDays(utcDate, offset);
}

function formatPeriodLabel(periodStart: Date, periodEnd: Date) {
  return `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;
}

function toFlagList(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  return value.split('|').map((flag) => flag.trim()).filter(Boolean);
}

function toFlagString(flags: string[] | null | undefined) {
  if (!flags || flags.length === 0) {
    return null;
  }

  return flags.join('|');
}

function serializeOrgUnit(orgUnit: any) {
  if (!orgUnit) {
    return null;
  }

  return {
    id: orgUnit.id,
    code: orgUnit.code,
    name: orgUnit.name,
    type: orgUnit.type,
  };
}

function serializeEmployee(employee: any) {
  if (!employee) {
    return null;
  }

  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    jobTitle: employee.jobTitle,
  };
}

function serializeLaborGroup(laborGroup: any) {
  return {
    id: laborGroup.id,
    code: laborGroup.code,
    name: laborGroup.name,
    status: laborGroup.status,
    agreementReference: laborGroup.agreementReference ?? null,
    description: laborGroup.description ?? null,
    employeeCount: laborGroup._count?.employees ?? 0,
    ruleProfileCount: laborGroup._count?.workRuleProfiles ?? 0,
    createdAt: toIsoString(laborGroup.createdAt),
    updatedAt: toIsoString(laborGroup.updatedAt),
  };
}

function serializeRuleProfile(ruleProfile: any) {
  return {
    id: ruleProfile.id,
    code: ruleProfile.code,
    name: ruleProfile.name,
    status: ruleProfile.status,
    laborGroup: ruleProfile.laborGroup ? serializeLaborGroup(ruleProfile.laborGroup) : null,
    orgUnit: serializeOrgUnit(ruleProfile.orgUnit),
    position: ruleProfile.position ? {
      id: ruleProfile.position.id,
      positionCode: ruleProfile.position.positionCode,
      title: ruleProfile.position.title,
    } : null,
    classification: ruleProfile.classification ? {
      id: ruleProfile.classification.id,
      code: ruleProfile.classification.code,
      title: ruleProfile.classification.title,
    } : null,
    dailyOvertimeThreshold: decimalToNumber(ruleProfile.dailyOvertimeThreshold),
    weeklyOvertimeThreshold: decimalToNumber(ruleProfile.weeklyOvertimeThreshold),
    doubleTimeThreshold: ruleProfile.doubleTimeThreshold === null ? null : decimalToNumber(ruleProfile.doubleTimeThreshold),
    minimumRestHours: decimalToNumber(ruleProfile.minimumRestHours),
    scheduledDailyHoursTarget: decimalToNumber(ruleProfile.scheduledDailyHoursTarget),
    shiftPremiumRules: ruleProfile.shiftPremiumRules ?? null,
    holidayTreatment: ruleProfile.holidayTreatment ?? null,
    leaveTreatment: ruleProfile.leaveTreatment ?? null,
    createdAt: toIsoString(ruleProfile.createdAt),
    updatedAt: toIsoString(ruleProfile.updatedAt),
  };
}

function serializeShiftTemplate(shiftTemplate: any) {
  return {
    id: shiftTemplate.id,
    code: shiftTemplate.code,
    name: shiftTemplate.name,
    startTime: shiftTemplate.startTime,
    endTime: shiftTemplate.endTime,
    unpaidBreakMinutes: shiftTemplate.unpaidBreakMinutes,
    paidBreakMinutes: shiftTemplate.paidBreakMinutes,
    status: shiftTemplate.status,
    orgUnit: serializeOrgUnit(shiftTemplate.orgUnit),
    workRuleProfile: shiftTemplate.workRuleProfile ? {
      id: shiftTemplate.workRuleProfile.id,
      code: shiftTemplate.workRuleProfile.code,
      name: shiftTemplate.workRuleProfile.name,
    } : null,
    createdAt: toIsoString(shiftTemplate.createdAt),
    updatedAt: toIsoString(shiftTemplate.updatedAt),
  };
}

function serializeScheduledShift(shift: any) {
  return {
    id: shift.id,
    shiftDate: toIsoString(shift.shiftDate),
    startDateTime: toIsoString(shift.startDateTime),
    endDateTime: toIsoString(shift.endDateTime),
    breakMinutes: shift.breakMinutes,
    scheduledHours: hoursBetween(shift.startDateTime, shift.endDateTime, shift.breakMinutes),
    status: shift.status,
    notes: shift.notes ?? null,
    orgUnit: serializeOrgUnit(shift.orgUnit ?? shift.schedule?.orgUnit),
    employee: serializeEmployee(shift.employee),
    shiftTemplate: shift.shiftTemplate ? {
      id: shift.shiftTemplate.id,
      code: shift.shiftTemplate.code,
      name: shift.shiftTemplate.name,
    } : null,
  };
}

function serializeTimeEntry(entry: any) {
  return {
    id: entry.id,
    scheduledShiftId: entry.scheduledShiftId ?? null,
    workDate: toIsoString(entry.workDate),
    earningType: entry.earningType,
    workedHours: decimalToNumber(entry.workedHours),
    startDateTime: toIsoString(entry.startDateTime),
    endDateTime: toIsoString(entry.endDateTime),
    breakMinutes: entry.breakMinutes,
    notes: entry.notes ?? null,
    exceptionFlags: toFlagList(entry.exceptionFlags),
    isAutoGenerated: entry.isAutoGenerated,
  };
}

function serializeTimeCard(timeCard: any) {
  return {
    id: timeCard.id,
    status: timeCard.status,
    periodStart: toIsoString(timeCard.periodStart),
    periodEnd: toIsoString(timeCard.periodEnd),
    submittedAt: toIsoString(timeCard.submittedAt),
    approvedAt: toIsoString(timeCard.approvedAt),
    rejectedAt: toIsoString(timeCard.rejectedAt),
    recalledAt: toIsoString(timeCard.recalledAt),
    approvalComment: timeCard.approvalComment ?? null,
    regularHours: decimalToNumber(timeCard.regularHours),
    overtimeHours: decimalToNumber(timeCard.overtimeHours),
    doubleTimeHours: decimalToNumber(timeCard.doubleTimeHours),
    leaveHours: decimalToNumber(timeCard.leaveHours),
    holidayHours: decimalToNumber(timeCard.holidayHours),
    totalWorkedHours: decimalToNumber(timeCard.totalWorkedHours),
    exceptionCount: timeCard.exceptionCount,
    employee: serializeEmployee(timeCard.employee),
    approver: serializeEmployee(timeCard.approver),
    orgUnit: serializeOrgUnit(timeCard.orgUnit),
    entries: (timeCard.entries ?? []).map(serializeTimeEntry),
  };
}

async function getManagedEmployeeIds(currentEmployeeId: string | null | undefined) {
  if (!currentEmployeeId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      managerId: currentEmployeeId,
      status: {
        not: TERMINATED_EMPLOYEE_STATUS,
      },
    },
    select: { id: true },
  });

  return employees.map((employee) => employee.id);
}

async function getManagedOrgUnitIds(currentEmployeeId: string | null | undefined) {
  if (!currentEmployeeId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      managerId: currentEmployeeId,
      status: { not: TERMINATED_EMPLOYEE_STATUS },
      positionId: { not: null },
    },
    select: {
      position: {
        select: {
          orgUnitId: true,
        },
      },
    },
  });

  return [...new Set(employees.map((employee) => employee.position?.orgUnitId).filter((value): value is string => Boolean(value)))];
}

function assertManagementContext(context: TimeAttendanceContext, managedEmployeeIds: string[]) {
  if (isHrAdmin(context)) {
    return;
  }

  if (managedEmployeeIds.length === 0) {
    throw createHttpError(403, 'Only managers and HR administrators can access workforce time management.');
  }
}

async function getLinkedEmployee(transaction: Prisma.TransactionClient, employeeId: string | null | undefined) {
  if (!employeeId) {
    throw createHttpError(409, 'Link your account to an employee profile before using time and attendance.');
  }

  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      jobTitle: true,
      status: true,
      managerId: true,
      laborGroupId: true,
      position: {
        select: {
          id: true,
          positionCode: true,
          title: true,
          classificationId: true,
          orgUnitId: true,
          orgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  if (employee.status === TERMINATED_EMPLOYEE_STATUS) {
    throw createHttpError(409, 'Terminated employees cannot use time and attendance.');
  }

  if (!employee.position?.orgUnitId) {
    throw createHttpError(409, 'Assign the employee to a position and org unit before using time and attendance.');
  }

  return employee;
}

async function resolveTimeApprover(
  transaction: Prisma.TransactionClient,
  employee: {
    id: string;
    managerId: string | null;
  },
) {
  if (!employee.managerId || employee.managerId === employee.id) {
    return {
      approverId: null,
      ownerEmployeeId: null,
      assigneeAccountId: null,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
    };
  }

  const approver = await transaction.employee.findUnique({
    where: { id: employee.managerId },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!approver || approver.status === TERMINATED_EMPLOYEE_STATUS) {
    return {
      approverId: null,
      ownerEmployeeId: null,
      assigneeAccountId: null,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
    };
  }

  return {
    approverId: approver.id,
    ownerEmployeeId: approver.id,
    assigneeAccountId: await findActiveAccountIdByEmployeeId(transaction, approver.id),
    assigneeQueueKey: null,
    ownerLabel: `${approver.firstName} ${approver.lastName}`,
  };
}

async function resolveWorkRuleProfile(
  transaction: Prisma.TransactionClient,
  employee: {
    laborGroupId: string | null;
    position: {
      id: string;
      classificationId: string;
      orgUnitId: string;
    } | null;
  },
) {
  const positionId = employee.position?.id ?? null;
  const orgUnitId = employee.position?.orgUnitId ?? null;
  const classificationId = employee.position?.classificationId ?? null;

  const candidates = [
    positionId
      ? await transaction.workRuleProfile.findFirst({
        where: { status: 'Active', positionId },
      })
      : null,
    orgUnitId
      ? await transaction.workRuleProfile.findFirst({
        where: { status: 'Active', orgUnitId },
      })
      : null,
    employee.laborGroupId
      ? await transaction.workRuleProfile.findFirst({
        where: { status: 'Active', laborGroupId: employee.laborGroupId },
      })
      : null,
    classificationId
      ? await transaction.workRuleProfile.findFirst({
        where: { status: 'Active', classificationId },
      })
      : null,
    await transaction.workRuleProfile.findFirst({
      where: {
        status: 'Active',
        positionId: null,
        orgUnitId: null,
        laborGroupId: null,
        classificationId: null,
      },
    }),
  ];

  return candidates.find(Boolean) ?? null;
}

function categorizeAutoEntryFromShift(
  shift: {
    shiftDate: Date;
    startDateTime: Date;
    endDateTime: Date;
    breakMinutes: number;
    id: string;
  },
  leaveRequests: Array<{
    startDate: Date;
    endDate: Date;
    leaveType: { code: string };
  }>,
  holidays: Array<{ holidayDate: Date }>,
) {
  const shiftDay = shift.shiftDate.toISOString().slice(0, 10);
  const holiday = holidays.find((item) => item.holidayDate.toISOString().slice(0, 10) === shiftDay);

  if (holiday) {
    return 'Holiday';
  }

  const leave = leaveRequests.find((item) => {
    const start = startOfUtcDay(item.startDate).getTime();
    const end = endOfUtcDay(item.endDate).getTime();
    const current = shift.shiftDate.getTime();
    return current >= start && current <= end;
  });

  if (!leave) {
    return 'Worked';
  }

  if (leave.leaveType.code === 'VAC') {
    return 'Vacation';
  }

  if (leave.leaveType.code === 'SICK') {
    return 'Sick';
  }

  if (leave.leaveType.code === 'PERS') {
    return 'Personal';
  }

  if (leave.leaveType.code === 'UNPD') {
    return 'Unpaid';
  }

  return 'Leave';
}

async function createAutoEntriesForPeriod(
  transaction: Prisma.TransactionClient,
  timeCardId: string,
  employee: {
    id: string;
    position: { orgUnitId: string } | null;
  },
  periodStart: Date,
  periodEnd: Date,
) {
  const [scheduledShifts, approvedLeave, holidays] = await Promise.all([
    transaction.scheduledShift.findMany({
      where: {
        employeeId: employee.id,
        schedule: {
          status: 'Published',
        },
        shiftDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: [{ shiftDate: 'asc' }, { startDateTime: 'asc' }],
      select: {
        id: true,
        shiftDate: true,
        startDateTime: true,
        endDateTime: true,
        breakMinutes: true,
      },
    }),
    transaction.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: LEAVE_REQUEST_APPROVED_STATUS,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: {
        startDate: true,
        endDate: true,
        leaveType: {
          select: {
            code: true,
          },
        },
      },
    }),
    transaction.holiday.findMany({
      where: {
        holidayDate: {
          gte: periodStart,
          lte: periodEnd,
        },
        OR: [
          { orgUnitId: null },
          { orgUnitId: employee.position?.orgUnitId ?? undefined },
        ],
      },
      select: {
        holidayDate: true,
      },
    }),
  ]);

  if (scheduledShifts.length === 0) {
    return;
  }

  for (const shift of scheduledShifts) {
    const earningType = categorizeAutoEntryFromShift(shift, approvedLeave, holidays);
    await transaction.timeEntry.create({
      data: {
        timeCardId,
        scheduledShiftId: shift.id,
        workDate: shift.shiftDate,
        earningType,
        workedHours: new Prisma.Decimal(hoursBetween(shift.startDateTime, shift.endDateTime, shift.breakMinutes)),
        startDateTime: shift.startDateTime,
        endDateTime: shift.endDateTime,
        breakMinutes: shift.breakMinutes,
        isAutoGenerated: true,
      },
    });
  }
}

function applyEntryFlags(entry: {
  earningType: string;
  scheduledShiftId: string | null;
  workedHours: number;
}) {
  const flags: string[] = [];

  if (entry.earningType === 'Worked' && !entry.scheduledShiftId) {
    flags.push('Unscheduled hours');
  }

  if (entry.workedHours <= 0) {
    flags.push('Zero hours');
  }

  return flags;
}

function calculateTimeCardTotals(
  entries: Array<{
    workDate: Date;
    earningType: string;
    workedHours: number;
    startDateTime: Date | null;
    endDateTime: Date | null;
    scheduledShiftId: string | null;
    breakMinutes: number;
    exceptionFlags?: string[];
  }>,
  ruleProfile: {
    dailyOvertimeThreshold: Prisma.Decimal | number;
    weeklyOvertimeThreshold: Prisma.Decimal | number;
    doubleTimeThreshold: Prisma.Decimal | number | null;
    minimumRestHours: Prisma.Decimal | number;
  } | null,
) {
  const dailyThreshold = Number(ruleProfile?.dailyOvertimeThreshold ?? HOURS_PER_DAY_DEFAULT);
  const weeklyThreshold = Number(ruleProfile?.weeklyOvertimeThreshold ?? 40);
  const doubleThreshold = ruleProfile?.doubleTimeThreshold === null || ruleProfile?.doubleTimeThreshold === undefined
    ? null
    : Number(ruleProfile.doubleTimeThreshold);
  const minimumRestHours = Number(ruleProfile?.minimumRestHours ?? 8);

  const workedEntries = entries.filter((entry) => entry.earningType === 'Worked');
  const leaveEntries = entries.filter((entry) => ['Vacation', 'Sick', 'Personal', 'Unpaid', 'Leave'].includes(entry.earningType));
  const holidayEntries = entries.filter((entry) => entry.earningType === 'Holiday');
  const dailyBuckets = new Map<string, number>();

  for (const entry of workedEntries) {
    const key = startOfUtcDay(entry.workDate).toISOString();
    dailyBuckets.set(key, (dailyBuckets.get(key) ?? 0) + entry.workedHours);
  }

  let overtimeHours = 0;
  let doubleTimeHours = 0;

  for (const totalHours of dailyBuckets.values()) {
    if (doubleThreshold !== null && totalHours > doubleThreshold) {
      doubleTimeHours += totalHours - doubleThreshold;
    }

    const overtimeCap = doubleThreshold === null ? totalHours : Math.min(totalHours, doubleThreshold);
    if (overtimeCap > dailyThreshold) {
      overtimeHours += overtimeCap - dailyThreshold;
    }
  }

  const totalWorkedHours = workedEntries.reduce((total, entry) => total + entry.workedHours, 0);
  overtimeHours += Math.max(totalWorkedHours - weeklyThreshold - overtimeHours - doubleTimeHours, 0);

  const regularHours = Math.max(totalWorkedHours - overtimeHours - doubleTimeHours, 0);
  const leaveHours = leaveEntries.reduce((total, entry) => total + entry.workedHours, 0);
  const holidayHours = holidayEntries.reduce((total, entry) => total + entry.workedHours, 0);

  const restSequence = workedEntries
    .filter((entry) => entry.startDateTime && entry.endDateTime)
    .sort((left, right) => (left.startDateTime?.getTime() ?? 0) - (right.startDateTime?.getTime() ?? 0));

  let restViolations = 0;
  for (let index = 1; index < restSequence.length; index += 1) {
    const previousEnd = restSequence[index - 1].endDateTime?.getTime() ?? 0;
    const currentStart = restSequence[index].startDateTime?.getTime() ?? 0;
    const restHours = (currentStart - previousEnd) / 3600000;
    if (restHours < minimumRestHours) {
      restViolations += 1;
    }
  }

  const entryFlags = entries.reduce((total, entry) => total + (entry.exceptionFlags?.length ?? 0), 0);

  return {
    regularHours,
    overtimeHours,
    doubleTimeHours,
    leaveHours,
    holidayHours,
    totalWorkedHours,
    exceptionCount: entryFlags + restViolations,
  };
}

async function refreshTimeCardTotals(
  transaction: Prisma.TransactionClient,
  timeCardId: string,
) {
  const timeCard = await transaction.timeCard.findUnique({
    where: { id: timeCardId },
    select: {
      id: true,
      employee: {
        select: {
          id: true,
          laborGroupId: true,
          position: {
            select: {
              id: true,
              orgUnitId: true,
              classificationId: true,
            },
          },
        },
      },
      entries: {
        orderBy: [{ workDate: 'asc' }, { startDateTime: 'asc' }],
        select: {
          workDate: true,
          earningType: true,
          workedHours: true,
          startDateTime: true,
          endDateTime: true,
          scheduledShiftId: true,
          breakMinutes: true,
          exceptionFlags: true,
        },
      },
    },
  });

  if (!timeCard) {
    throw createHttpError(404, 'Time card not found.');
  }

  const ruleProfile = await resolveWorkRuleProfile(transaction, timeCard.employee);
  const totals = calculateTimeCardTotals(
    timeCard.entries.map((entry) => ({
      workDate: entry.workDate,
      earningType: entry.earningType,
      workedHours: decimalToNumber(entry.workedHours),
      startDateTime: entry.startDateTime,
      endDateTime: entry.endDateTime,
      scheduledShiftId: entry.scheduledShiftId,
      breakMinutes: entry.breakMinutes,
      exceptionFlags: toFlagList(entry.exceptionFlags),
    })),
    ruleProfile,
  );

  await transaction.timeCard.update({
    where: { id: timeCardId },
    data: {
      regularHours: new Prisma.Decimal(totals.regularHours),
      overtimeHours: new Prisma.Decimal(totals.overtimeHours),
      doubleTimeHours: new Prisma.Decimal(totals.doubleTimeHours),
      leaveHours: new Prisma.Decimal(totals.leaveHours),
      holidayHours: new Prisma.Decimal(totals.holidayHours),
      totalWorkedHours: new Prisma.Decimal(totals.totalWorkedHours),
      exceptionCount: totals.exceptionCount,
    },
  });
}

async function getTimeCardSelect() {
  return {
    id: true,
    status: true,
    periodStart: true,
    periodEnd: true,
    submittedAt: true,
    approvedAt: true,
    rejectedAt: true,
    recalledAt: true,
    approvalComment: true,
    regularHours: true,
    overtimeHours: true,
    doubleTimeHours: true,
    leaveHours: true,
    holidayHours: true,
    totalWorkedHours: true,
    exceptionCount: true,
    employee: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
      },
    },
    approver: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
      },
    },
    orgUnit: {
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    },
    entries: {
      orderBy: [{ workDate: 'asc' }, { startDateTime: 'asc' }],
      select: {
        id: true,
        scheduledShiftId: true,
        workDate: true,
        earningType: true,
        workedHours: true,
        startDateTime: true,
        endDateTime: true,
        breakMinutes: true,
        notes: true,
        exceptionFlags: true,
        isAutoGenerated: true,
      },
    },
  } satisfies Prisma.TimeCardSelect;
}

async function ensureTimeCardForPeriod(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  periodStart: Date,
) {
  const employee = await getLinkedEmployee(transaction, employeeId);
  const periodEnd = getPeriodEnd(periodStart);

  const existing = await transaction.timeCard.findUnique({
    where: {
      employeeId_periodStart_periodEnd: {
        employeeId,
        periodStart,
        periodEnd,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const routing = await resolveTimeApprover(transaction, employee);
  const created = await transaction.timeCard.create({
    data: {
      employeeId: employee.id,
      orgUnitId: employee.position!.orgUnitId,
      approverId: routing.approverId,
      periodStart,
      periodEnd,
      status: 'Draft',
    },
    select: { id: true },
  });

  await createAutoEntriesForPeriod(transaction, created.id, employee, periodStart, periodEnd);
  await refreshTimeCardTotals(transaction, created.id);
  return created.id;
}

async function getTimeCardById(transaction: Prisma.TransactionClient, timeCardId: string) {
  const timeCard = await transaction.timeCard.findUnique({
    where: { id: timeCardId },
    select: await getTimeCardSelect(),
  });

  if (!timeCard) {
    throw createHttpError(404, 'Time card not found.');
  }

  return timeCard;
}

async function assertTimeCardSelfAccess(
  transaction: Prisma.TransactionClient,
  timeCardId: string,
  currentEmployeeId: string | null | undefined,
) {
  if (!currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile before using time and attendance.');
  }

  const timeCard = await transaction.timeCard.findFirst({
    where: {
      id: timeCardId,
      employeeId: currentEmployeeId,
    },
    select: {
      id: true,
      employeeId: true,
      approverId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      exceptionCount: true,
      overtimeHours: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!timeCard) {
    throw createHttpError(404, 'Time card not found.');
  }

  return timeCard;
}

async function assertTimeCardManagementAccess(
  transaction: Prisma.TransactionClient,
  timeCardId: string,
  context: TimeAttendanceContext,
) {
  const timeCard = await transaction.timeCard.findUnique({
    where: { id: timeCardId },
    select: {
      id: true,
      employeeId: true,
      approverId: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      exceptionCount: true,
      overtimeHours: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
    },
  });

  if (!timeCard) {
    throw createHttpError(404, 'Time card not found.');
  }

  if (isHrAdmin(context)) {
    return timeCard;
  }

  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  if (!managedEmployeeIds.includes(timeCard.employeeId)) {
    throw createHttpError(403, 'You can only manage time cards for your direct reports.');
  }

  return timeCard;
}

async function upsertTimeCardApprovalTask(
  transaction: Prisma.TransactionClient,
  timeCard: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    exceptionCount: number;
    overtimeHours: Prisma.Decimal | number;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
    };
  },
  routing: {
    ownerEmployeeId: string | null;
    assigneeAccountId: string | null;
    assigneeQueueKey: string | null;
    ownerLabel: string | null;
  },
) {
  const title = `${timeCard.employee.firstName} ${timeCard.employee.lastName}: time card ${formatPeriodLabel(timeCard.periodStart, timeCard.periodEnd)}`;
  const description = `Submitted time card for ${formatPeriodLabel(timeCard.periodStart, timeCard.periodEnd)}.`;

  const existingApproval = await transaction.workflowTask.findFirst({
    where: {
      taskType: TIME_CARD_APPROVAL_TASK,
      relatedEntityType: TIME_CARD_ENTITY_TYPE,
      relatedEntityId: timeCard.id,
    },
    select: { id: true },
  });

  if (existingApproval) {
    await transaction.workflowTask.update({
      where: { id: existingApproval.id },
      data: {
        title,
        description,
        employeeId: timeCard.employee.id,
        ownerEmployeeId: routing.ownerEmployeeId,
        assigneeAccountId: routing.assigneeAccountId,
        assigneeQueueKey: routing.assigneeQueueKey,
        ownerLabel: routing.ownerLabel,
        dueDate: timeCard.periodEnd,
        priority: 'High',
        status: WORKFLOW_STATUS_OPEN,
        comments: null,
        completedAt: null,
      },
    });
  } else {
    await createWorkflowTask(transaction, {
      taskType: TIME_CARD_APPROVAL_TASK,
      title,
      description,
      employeeId: timeCard.employee.id,
      ownerEmployeeId: routing.ownerEmployeeId,
      assigneeAccountId: routing.assigneeAccountId,
      assigneeQueueKey: routing.assigneeQueueKey,
      ownerLabel: routing.ownerLabel,
      relatedEntityType: TIME_CARD_ENTITY_TYPE,
      relatedEntityId: timeCard.id,
      dueDate: timeCard.periodEnd,
      priority: 'High',
    });
  }

  await transaction.workflowTask.updateMany({
    where: {
      taskType: TIME_CARD_CORRECTION_TASK,
      relatedEntityType: TIME_CARD_ENTITY_TYPE,
      relatedEntityId: timeCard.id,
      status: { in: [WORKFLOW_STATUS_OPEN, WORKFLOW_STATUS_COMPLETED] },
    },
    data: {
      status: WORKFLOW_STATUS_CANCELLED,
      completedAt: new Date(),
    },
  });

  if (decimalToNumber(timeCard.overtimeHours) > 0 || timeCard.exceptionCount > 0) {
    const overtimeTask = await transaction.workflowTask.findFirst({
      where: {
        taskType: OVERTIME_REVIEW_TASK,
        relatedEntityType: TIME_CARD_ENTITY_TYPE,
        relatedEntityId: timeCard.id,
      },
      select: { id: true },
    });

    if (overtimeTask) {
      await transaction.workflowTask.update({
        where: { id: overtimeTask.id },
        data: {
          status: WORKFLOW_STATUS_OPEN,
          completedAt: null,
          employeeId: timeCard.employee.id,
          ownerEmployeeId: routing.ownerEmployeeId,
          assigneeAccountId: routing.assigneeAccountId,
          assigneeQueueKey: routing.assigneeQueueKey,
          ownerLabel: routing.ownerLabel,
          dueDate: timeCard.periodEnd,
          title: `${timeCard.employee.firstName} ${timeCard.employee.lastName}: overtime review`,
          description: `Review ${decimalToNumber(timeCard.overtimeHours)} overtime hours and ${timeCard.exceptionCount} exceptions.`,
        },
      });
    } else {
      await createWorkflowTask(transaction, {
        taskType: OVERTIME_REVIEW_TASK,
        title: `${timeCard.employee.firstName} ${timeCard.employee.lastName}: overtime review`,
        description: `Review ${decimalToNumber(timeCard.overtimeHours)} overtime hours and ${timeCard.exceptionCount} exceptions.`,
        employeeId: timeCard.employee.id,
        ownerEmployeeId: routing.ownerEmployeeId,
        assigneeAccountId: routing.assigneeAccountId,
        assigneeQueueKey: routing.assigneeQueueKey,
        ownerLabel: routing.ownerLabel,
        relatedEntityType: TIME_CARD_ENTITY_TYPE,
        relatedEntityId: timeCard.id,
        dueDate: timeCard.periodEnd,
        priority: 'Normal',
      });
    }
  }
}

async function createTimeCardCorrectionTask(
  transaction: Prisma.TransactionClient,
  timeCard: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    employeeId: string;
    employee: {
      firstName: string;
      lastName: string;
    };
  },
  assigneeAccountId: string | null,
  comments: string | null,
) {
  await transaction.workflowTask.updateMany({
    where: {
      taskType: TIME_CARD_APPROVAL_TASK,
      relatedEntityType: TIME_CARD_ENTITY_TYPE,
      relatedEntityId: timeCard.id,
      status: { in: [WORKFLOW_STATUS_OPEN, WORKFLOW_STATUS_COMPLETED] },
    },
    data: {
      status: WORKFLOW_STATUS_COMPLETED,
      completedAt: new Date(),
      comments,
    },
  });

  await createWorkflowTask(transaction, {
    taskType: TIME_CARD_CORRECTION_TASK,
    title: `${timeCard.employee.firstName} ${timeCard.employee.lastName}: correct time card ${formatPeriodLabel(timeCard.periodStart, timeCard.periodEnd)}`,
    description: comments ?? 'Manager requested corrections on the submitted time card.',
    employeeId: timeCard.employeeId,
    ownerEmployeeId: timeCard.employeeId,
    assigneeAccountId,
    assigneeQueueKey: null,
    ownerLabel: 'Employee',
    relatedEntityType: TIME_CARD_ENTITY_TYPE,
    relatedEntityId: timeCard.id,
    dueDate: addUtcDays(new Date(), 3),
    priority: 'High',
  });
}

export async function getTimeAttendanceSummary(context: TimeAttendanceContext) {
  if (!context.currentEmployeeId) {
    return {
      access: {
        accountLinked: false,
      },
      currentTimeCard: null,
      scheduledHoursThisWeek: 0,
      approvedLeaveUpcoming: 0,
      exceptionCount: 0,
    };
  }

  return prisma.$transaction(async (transaction) => {
    const employee = await getLinkedEmployee(transaction, context.currentEmployeeId);
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = endOfUtcDay(addUtcDays(weekStart, 6));
    const currentPeriodStart = getPeriodStart(now);
    const currentTimeCardId = await ensureTimeCardForPeriod(transaction, employee.id, currentPeriodStart);
    const [timeCard, scheduledShifts, approvedLeaveCount] = await Promise.all([
      getTimeCardById(transaction, currentTimeCardId),
      transaction.scheduledShift.findMany({
        where: {
          employeeId: employee.id,
          schedule: { status: 'Published' },
          shiftDate: { gte: weekStart, lte: weekEnd },
        },
        select: {
          startDateTime: true,
          endDateTime: true,
          breakMinutes: true,
        },
      }),
      transaction.leaveRequest.count({
        where: {
          employeeId: employee.id,
          status: LEAVE_REQUEST_APPROVED_STATUS,
          endDate: { gte: now },
        },
      }),
    ]);

    return {
      access: {
        accountLinked: true,
      },
      currentTimeCard: {
        id: timeCard.id,
        status: timeCard.status,
        periodStart: toIsoString(timeCard.periodStart),
        periodEnd: toIsoString(timeCard.periodEnd),
      },
      scheduledHoursThisWeek: Number(scheduledShifts.reduce((total, shift) => total + hoursBetween(shift.startDateTime, shift.endDateTime, shift.breakMinutes), 0).toFixed(2)),
      approvedLeaveUpcoming: approvedLeaveCount,
      exceptionCount: timeCard.exceptionCount,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function getMySchedule(query: ScheduleRangeQuery, context: TimeAttendanceContext) {
  if (!context.currentEmployeeId) {
    return {
      shifts: [],
      approvedLeave: [],
      holidays: [],
    };
  }

  const dateFrom = startOfUtcDay((toDateValue(query.dateFrom) as Date | null | undefined) ?? new Date());
  const dateTo = endOfUtcDay((toDateValue(query.dateTo) as Date | null | undefined) ?? addUtcDays(dateFrom, 13));

  const employee = await prisma.employee.findUnique({
    where: { id: context.currentEmployeeId },
    select: {
      id: true,
      position: {
        select: {
          orgUnitId: true,
        },
      },
    },
  });

  const [shifts, leaveRequests, holidays] = await Promise.all([
    prisma.scheduledShift.findMany({
      where: {
        employeeId: context.currentEmployeeId,
        schedule: { status: 'Published' },
        shiftDate: { gte: dateFrom, lte: dateTo },
      },
      orderBy: [{ shiftDate: 'asc' }, { startDateTime: 'asc' }],
      select: {
        id: true,
        shiftDate: true,
        startDateTime: true,
        endDateTime: true,
        breakMinutes: true,
        status: true,
        notes: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
          },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        shiftTemplate: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: context.currentEmployeeId,
        status: LEAVE_REQUEST_APPROVED_STATUS,
        startDate: { lte: dateTo },
        endDate: { gte: dateFrom },
      },
      orderBy: [{ startDate: 'asc' }],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        requestedHours: true,
        status: true,
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),
    prisma.holiday.findMany({
      where: {
        holidayDate: { gte: dateFrom, lte: dateTo },
        OR: [
          { orgUnitId: null },
          { orgUnitId: employee?.position?.orgUnitId ?? undefined },
        ],
      },
      orderBy: [{ holidayDate: 'asc' }],
      select: {
        id: true,
        name: true,
        holidayDate: true,
        note: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    }),
  ]);

  return {
    shifts: shifts.map(serializeScheduledShift),
    approvedLeave: leaveRequests.map((leaveRequest) => ({
      id: leaveRequest.id,
      startDate: toIsoString(leaveRequest.startDate),
      endDate: toIsoString(leaveRequest.endDate),
      requestedHours: decimalToNumber(leaveRequest.requestedHours),
      status: leaveRequest.status,
      leaveType: leaveRequest.leaveType,
    })),
    holidays: holidays.map((holiday) => ({
      id: holiday.id,
      name: holiday.name,
      holidayDate: toIsoString(holiday.holidayDate),
      note: holiday.note ?? null,
      orgUnit: serializeOrgUnit(holiday.orgUnit),
    })),
  };
}

export async function getMyTimeCard(query: MyTimeCardQuery, context: TimeAttendanceContext) {
  if (!context.currentEmployeeId) {
    return null;
  }

  const periodStart = getPeriodStart((toDateValue(query.periodStart) as Date | null | undefined) ?? new Date());
  const timeCard = await prisma.$transaction(async (transaction) => {
    const timeCardId = await ensureTimeCardForPeriod(transaction, context.currentEmployeeId!, periodStart);
    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(timeCard);
}

export async function createMyTimeCard(context: TimeAttendanceContext) {
  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile before using time and attendance.');
  }

  const periodStart = getPeriodStart(new Date());
  const timeCard = await prisma.$transaction(async (transaction) => {
    const timeCardId = await ensureTimeCardForPeriod(transaction, context.currentEmployeeId!, periodStart);
    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(timeCard);
}

export async function updateMyTimeCardEntries(
  timeCardId: string,
  data: UpdateTimeCardEntriesInput,
  context: TimeAttendanceContext,
) {
  const updated = await prisma.$transaction(async (transaction) => {
    const timeCard = await assertTimeCardSelfAccess(transaction, timeCardId, context.currentEmployeeId);

    if (!['Draft', 'Rejected', 'Recalled'].includes(timeCard.status)) {
      throw createHttpError(409, 'Only draft, recalled, or rejected time cards can be edited.');
    }

    await transaction.timeEntry.deleteMany({
      where: { timeCardId },
    });

    for (const entry of data.entries) {
      const flags = applyEntryFlags({
        earningType: entry.earningType,
        scheduledShiftId: entry.scheduledShiftId ?? null,
        workedHours: entry.workedHours,
      });

      await transaction.timeEntry.create({
        data: {
          timeCardId,
          scheduledShiftId: entry.scheduledShiftId ?? null,
          workDate: toDateValue(entry.workDate) as Date,
          earningType: entry.earningType,
          workedHours: new Prisma.Decimal(entry.workedHours),
          startDateTime: (toDateValue(entry.startDateTime ?? null) as Date | null | undefined) ?? null,
          endDateTime: (toDateValue(entry.endDateTime ?? null) as Date | null | undefined) ?? null,
          breakMinutes: entry.breakMinutes ?? 0,
          notes: trimToNull(entry.notes ?? null),
          exceptionFlags: toFlagString([...(entry.exceptionFlags ?? []), ...flags]),
          isAutoGenerated: entry.isAutoGenerated ?? false,
        },
      });
    }

    await refreshTimeCardTotals(transaction, timeCardId);
    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(updated);
}

export async function submitMyTimeCard(timeCardId: string, context: TimeAttendanceContext) {
  const updated = await prisma.$transaction(async (transaction) => {
    const timeCard = await assertTimeCardSelfAccess(transaction, timeCardId, context.currentEmployeeId);

    if (!['Draft', 'Rejected', 'Recalled'].includes(timeCard.status)) {
      throw createHttpError(409, 'Only draft, recalled, or rejected time cards can be submitted.');
    }

    const employee = await getLinkedEmployee(transaction, context.currentEmployeeId);
    const routing = await resolveTimeApprover(transaction, employee);

    await transaction.timeCard.update({
      where: { id: timeCardId },
      data: {
        status: 'Submitted',
        approverId: routing.approverId,
        submittedAt: new Date(),
        approvedAt: null,
        rejectedAt: null,
        recalledAt: null,
        approvalComment: null,
      },
    });

    await refreshTimeCardTotals(transaction, timeCardId);

    const refreshed = await transaction.timeCard.findUniqueOrThrow({
      where: { id: timeCardId },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        exceptionCount: true,
        overtimeHours: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await upsertTimeCardApprovalTask(transaction, refreshed, routing);
    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(updated);
}

export async function recallMyTimeCard(timeCardId: string, context: TimeAttendanceContext) {
  const updated = await prisma.$transaction(async (transaction) => {
    const timeCard = await assertTimeCardSelfAccess(transaction, timeCardId, context.currentEmployeeId);

    if (timeCard.status !== 'Submitted') {
      throw createHttpError(409, 'Only submitted time cards can be recalled.');
    }

    await transaction.timeCard.update({
      where: { id: timeCardId },
      data: {
        status: 'Recalled',
        recalledAt: new Date(),
      },
    });

    await cancelWorkflowTasksForEntity(transaction, TIME_CARD_ENTITY_TYPE, timeCardId, 'Time card was recalled by the employee.');
    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(updated);
}

export async function getTimeAttendanceHistory(context: TimeAttendanceContext) {
  if (!context.currentEmployeeId) {
    return {
      timeCards: [],
      leaveRequests: [],
    };
  }

  const [timeCards, leaveRequests] = await Promise.all([
    prisma.timeCard.findMany({
      where: { employeeId: context.currentEmployeeId },
      orderBy: [{ periodStart: 'desc' }],
      take: 12,
      select: await getTimeCardSelect(),
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: context.currentEmployeeId },
      orderBy: [{ startDate: 'desc' }],
      take: 12,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        requestedHours: true,
        status: true,
        leaveType: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    timeCards: timeCards.map(serializeTimeCard),
    leaveRequests: leaveRequests.map((leaveRequest) => ({
      id: leaveRequest.id,
      startDate: toIsoString(leaveRequest.startDate),
      endDate: toIsoString(leaveRequest.endDate),
      requestedHours: decimalToNumber(leaveRequest.requestedHours),
      status: leaveRequest.status,
      leaveType: leaveRequest.leaveType,
    })),
  };
}

export async function getManagementSummary(context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const periodStart = getPeriodStart(new Date());
  const periodEnd = getPeriodEnd(periodStart);
  const employeeWhere = managerScoped ? { id: { in: managedEmployeeIds } } : {};
  const orgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  const [pendingApprovals, timeCards, uncoveredShifts, openExceptionCount] = await Promise.all([
    prisma.timeCard.count({
      where: {
        status: 'Submitted',
        employee: employeeWhere,
      },
    }),
    prisma.timeCard.findMany({
      where: {
        periodStart,
        periodEnd,
        employee: employeeWhere,
      },
      select: {
        overtimeHours: true,
      },
    }),
    prisma.scheduledShift.count({
      where: {
        employeeId: null,
        schedule: {
          status: 'Published',
        },
        ...(managerScoped ? { orgUnitId: { in: orgUnitIds } } : {}),
        shiftDate: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.timeCard.count({
      where: {
        exceptionCount: { gt: 0 },
        employee: employeeWhere,
        status: { in: ['Draft', 'Submitted', 'Rejected', 'Recalled'] },
      },
    }),
  ]);

  return {
    pendingApprovals,
    openExceptions: openExceptionCount,
    overtimeHoursCurrentPeriod: Number(timeCards.reduce((total, timeCard) => total + decimalToNumber(timeCard.overtimeHours), 0).toFixed(2)),
    uncoveredShifts,
  };
}

export async function listManagementSchedules(query: ListManagementSchedulesQuery, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const orgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];
  const dateFrom = (toDateValue(query.dateFrom) as Date | null | undefined) ?? addUtcDays(new Date(), -14);
  const dateTo = (toDateValue(query.dateTo) as Date | null | undefined) ?? addUtcDays(new Date(), 28);

  const where: Prisma.WorkScheduleWhereInput = {
    periodStart: { lte: dateTo },
    periodEnd: { gte: dateFrom },
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.orgUnitId) {
    where.orgUnitId = query.orgUnitId;
  }

  if (managerScoped) {
    where.orgUnitId = query.orgUnitId
      ? query.orgUnitId
      : { in: orgUnitIds };
  }

  const schedules = await prisma.workSchedule.findMany({
    where,
    orderBy: [{ periodStart: 'asc' }, { orgUnit: { name: 'asc' } }],
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      notes: true,
      publishedAt: true,
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      scheduledShifts: {
        orderBy: [{ shiftDate: 'asc' }, { startDateTime: 'asc' }],
        select: {
          id: true,
          shiftDate: true,
          startDateTime: true,
          endDateTime: true,
          breakMinutes: true,
          status: true,
          notes: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
              jobTitle: true,
            },
          },
          orgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
            },
          },
          shiftTemplate: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return schedules.map((schedule) => ({
    id: schedule.id,
    periodStart: toIsoString(schedule.periodStart),
    periodEnd: toIsoString(schedule.periodEnd),
    status: schedule.status,
    notes: schedule.notes ?? null,
    publishedAt: toIsoString(schedule.publishedAt),
    orgUnit: serializeOrgUnit(schedule.orgUnit),
    shiftCount: schedule.scheduledShifts.length,
    uncoveredShiftCount: schedule.scheduledShifts.filter((shift) => !shift.employee).length,
    shifts: schedule.scheduledShifts.map(serializeScheduledShift),
  }));
}

export async function createManagementSchedule(data: CreateScheduleInput, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const managerOrgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  if (managerScoped && !managerOrgUnitIds.includes(data.orgUnitId)) {
    throw createHttpError(403, 'You can only create schedules for org units in your management scope.');
  }

  const created = await prisma.$transaction(async (transaction) => {
    const periodStart = startOfUtcDay(toDateValue(data.periodStart) as Date);
    const periodEnd = endOfUtcDay(toDateValue(data.periodEnd) as Date);

    const schedule = await transaction.workSchedule.create({
      data: {
        orgUnitId: data.orgUnitId,
        periodStart,
        periodEnd,
        notes: trimToNull(data.notes ?? null),
        status: 'Draft',
      },
      select: { id: true },
    });

    for (const shift of data.shifts) {
      await transaction.scheduledShift.create({
        data: {
          scheduleId: schedule.id,
          employeeId: shift.employeeId ?? null,
          orgUnitId: data.orgUnitId,
          shiftTemplateId: shift.shiftTemplateId ?? null,
          shiftDate: startOfUtcDay(toDateValue(shift.shiftDate) as Date),
          startDateTime: toDateValue(shift.startDateTime) as Date,
          endDateTime: toDateValue(shift.endDateTime) as Date,
          breakMinutes: shift.breakMinutes ?? 0,
          status: shift.status ?? 'Scheduled',
          notes: trimToNull(shift.notes ?? null),
        },
      });
    }

    return schedule.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const schedules = await listManagementSchedules({ dateFrom: data.periodStart, dateTo: data.periodEnd }, context);
  return schedules.find((schedule) => schedule.id === created) ?? null;
}

export async function updateManagementSchedule(scheduleId: string, data: UpdateScheduleInput, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const managerOrgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  await prisma.$transaction(async (transaction) => {
    const schedule = await transaction.workSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        orgUnitId: true,
      },
    });

    if (!schedule) {
      throw createHttpError(404, 'Schedule not found.');
    }

    if (managerScoped && !managerOrgUnitIds.includes(schedule.orgUnitId)) {
      throw createHttpError(403, 'You can only update schedules for org units in your management scope.');
    }

    await transaction.workSchedule.update({
      where: { id: scheduleId },
      data: {
        notes: data.notes === undefined ? undefined : trimToNull(data.notes ?? null),
      },
    });

    if (data.shifts) {
      await transaction.scheduledShift.deleteMany({
        where: { scheduleId },
      });

      for (const shift of data.shifts) {
        await transaction.scheduledShift.create({
          data: {
            scheduleId,
            employeeId: shift.employeeId ?? null,
            orgUnitId: schedule.orgUnitId,
            shiftTemplateId: shift.shiftTemplateId ?? null,
            shiftDate: startOfUtcDay(toDateValue(shift.shiftDate) as Date),
            startDateTime: toDateValue(shift.startDateTime) as Date,
            endDateTime: toDateValue(shift.endDateTime) as Date,
            breakMinutes: shift.breakMinutes ?? 0,
            status: shift.status ?? 'Scheduled',
            notes: trimToNull(shift.notes ?? null),
          },
        });
      }
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const schedule = await prisma.workSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      periodStart: true,
      periodEnd: true,
    },
  });

  const schedules = await listManagementSchedules({
    dateFrom: toIsoString(schedule?.periodStart) ?? undefined,
    dateTo: toIsoString(schedule?.periodEnd) ?? undefined,
  }, context);
  return schedules.find((item) => item.id === scheduleId) ?? null;
}

export async function publishManagementSchedule(scheduleId: string, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const managerOrgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  await prisma.$transaction(async (transaction) => {
    const schedule = await transaction.workSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        orgUnitId: true,
      },
    });

    if (!schedule) {
      throw createHttpError(404, 'Schedule not found.');
    }

    if (managerScoped && !managerOrgUnitIds.includes(schedule.orgUnitId)) {
      throw createHttpError(403, 'You can only publish schedules for org units in your management scope.');
    }

    await transaction.workSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'Published',
        publishedAt: new Date(),
      },
    });

    await transaction.scheduledShift.updateMany({
      where: { scheduleId },
      data: { status: 'Published' },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return { id: scheduleId };
}

export async function listManagementTimeCards(query: ListManagementTimeCardsQuery, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);

  const periodStart = query.periodStart ? getPeriodStart(toDateValue(query.periodStart) as Date) : undefined;
  const periodEnd = periodStart ? getPeriodEnd(periodStart) : undefined;
  const where: Prisma.TimeCardWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (periodStart && periodEnd) {
    where.periodStart = periodStart;
    where.periodEnd = periodEnd;
  }

  if (query.orgUnitId) {
    where.orgUnitId = query.orgUnitId;
  }

  if (managerScoped) {
    where.employeeId = { in: managedEmployeeIds };
  }

  if (query.search?.trim()) {
    where.OR = [
      { employee: { is: { firstName: { contains: query.search.trim() } } } },
      { employee: { is: { lastName: { contains: query.search.trim() } } } },
      { employee: { is: { employeeNumber: { contains: query.search.trim() } } } },
    ];
  }

  const timeCards = await prisma.timeCard.findMany({
    where,
    orderBy: [{ periodStart: 'desc' }, { employee: { lastName: 'asc' } }],
    select: await getTimeCardSelect(),
  });

  return timeCards.map(serializeTimeCard);
}

export async function getManagementTimeCardDetail(timeCardId: string, context: TimeAttendanceContext) {
  await assertTimeCardManagementAccess(prisma, timeCardId, context);
  const timeCard = await prisma.timeCard.findUnique({
    where: { id: timeCardId },
    select: await getTimeCardSelect(),
  });

  return timeCard ? serializeTimeCard(timeCard) : null;
}

export async function approveManagementTimeCard(
  timeCardId: string,
  data: TimeCardDecisionInput,
  context: TimeAttendanceContext,
) {
  const updated = await prisma.$transaction(async (transaction) => {
    const timeCard = await assertTimeCardManagementAccess(transaction, timeCardId, context);

    if (timeCard.status !== 'Submitted') {
      throw createHttpError(409, 'Only submitted time cards can be approved.');
    }

    await transaction.timeCard.update({
      where: { id: timeCardId },
      data: {
        status: 'Approved',
        approvedAt: new Date(),
        rejectedAt: null,
        approvalComment: trimToNull(data.comments ?? null),
      },
    });

    await completeWorkflowTasksForEntity(transaction, TIME_CARD_ENTITY_TYPE, timeCardId, data.comments ?? null);
    const approvalTask = await transaction.workflowTask.findFirst({
      where: {
        taskType: TIME_CARD_APPROVAL_TASK,
        relatedEntityType: TIME_CARD_ENTITY_TYPE,
        relatedEntityId: timeCardId,
      },
      select: { id: true },
    });

    if (approvalTask) {
      await createApprovalAction(transaction, approvalTask.id, 'Approved', context.currentEmployeeId, data.comments ?? null);
    }

    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(updated);
}

export async function rejectManagementTimeCard(
  timeCardId: string,
  data: TimeCardDecisionInput,
  context: TimeAttendanceContext,
) {
  const updated = await prisma.$transaction(async (transaction) => {
    const timeCard = await assertTimeCardManagementAccess(transaction, timeCardId, context);

    if (timeCard.status !== 'Submitted') {
      throw createHttpError(409, 'Only submitted time cards can be rejected.');
    }

    await transaction.timeCard.update({
      where: { id: timeCardId },
      data: {
        status: 'Rejected',
        rejectedAt: new Date(),
        approvedAt: null,
        approvalComment: trimToNull(data.comments ?? null),
      },
    });

    const approvalTask = await transaction.workflowTask.findFirst({
      where: {
        taskType: TIME_CARD_APPROVAL_TASK,
        relatedEntityType: TIME_CARD_ENTITY_TYPE,
        relatedEntityId: timeCardId,
      },
      select: { id: true },
    });

    if (approvalTask) {
      await createApprovalAction(transaction, approvalTask.id, 'Rejected', context.currentEmployeeId, data.comments ?? null);
    }

    await createTimeCardCorrectionTask(
      transaction,
      {
        id: timeCard.id,
        periodStart: timeCard.periodStart,
        periodEnd: timeCard.periodEnd,
        employeeId: timeCard.employeeId,
        employee: timeCard.employee,
      },
      await findActiveAccountIdByEmployeeId(transaction, timeCard.employeeId),
      trimToNull(data.comments ?? null),
    );

    return getTimeCardById(transaction, timeCardId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeTimeCard(updated);
}

export async function listManagementExceptions(query: ListManagementExceptionsQuery, context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const periodStart = getPeriodStart((toDateValue(query.periodStart) as Date | null | undefined) ?? new Date());
  const periodEnd = getPeriodEnd(periodStart);
  const orgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  const [timeCards, uncoveredShifts, leaveConflicts] = await Promise.all([
    prisma.timeCard.findMany({
      where: {
        periodStart,
        periodEnd,
        status: { in: ['Draft', 'Submitted', 'Rejected', 'Recalled'] },
        exceptionCount: { gt: 0 },
        ...(managerScoped ? { employeeId: { in: managedEmployeeIds } } : {}),
        ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
      },
      orderBy: [{ exceptionCount: 'desc' }, { periodStart: 'asc' }],
      select: {
        id: true,
        status: true,
        exceptionCount: true,
        overtimeHours: true,
        periodStart: true,
        periodEnd: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
          },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        entries: {
          select: {
            id: true,
            workDate: true,
            exceptionFlags: true,
          },
        },
      },
    }),
    prisma.scheduledShift.findMany({
      where: {
        employeeId: null,
        schedule: {
          status: 'Published',
        },
        shiftDate: { gte: periodStart, lte: periodEnd },
        ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
        ...(managerScoped ? { orgUnitId: { in: orgUnitIds } } : {}),
      },
      orderBy: [{ shiftDate: 'asc' }],
      select: {
        id: true,
        shiftDate: true,
        startDateTime: true,
        endDateTime: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    }),
    prisma.scheduledShift.findMany({
      where: {
        employeeId: managerScoped ? { in: managedEmployeeIds } : undefined,
        shiftDate: { gte: periodStart, lte: periodEnd },
        ...(query.orgUnitId ? { orgUnitId: query.orgUnitId } : {}),
      },
      orderBy: [{ shiftDate: 'asc' }],
      select: {
        id: true,
        shiftDate: true,
        employeeId: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
          },
        },
      },
    }),
  ]);

  const relevantEmployeeIds = leaveConflicts.map((shift) => shift.employeeId).filter((value): value is string => Boolean(value));
  const leaveRequests = relevantEmployeeIds.length > 0
    ? await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: relevantEmployeeIds },
        status: LEAVE_REQUEST_APPROVED_STATUS,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
        leaveType: {
          select: {
            name: true,
          },
        },
      },
    })
    : [];

  const exceptions = [
    ...timeCards.flatMap((timeCard) => {
      const base = timeCard.entries.flatMap((entry) => toFlagList(entry.exceptionFlags).map((flag) => ({
        id: `${timeCard.id}-${entry.id}-${flag}`,
        category: 'Time Card',
        severity: 'Warning',
        title: flag,
        detail: `${timeCard.employee.firstName} ${timeCard.employee.lastName} | ${timeCard.status} | ${formatPeriodLabel(timeCard.periodStart, timeCard.periodEnd)}`,
        date: toIsoString(entry.workDate),
        employee: serializeEmployee(timeCard.employee),
        orgUnit: serializeOrgUnit(timeCard.orgUnit),
        relatedEntityType: TIME_CARD_ENTITY_TYPE,
        relatedEntityId: timeCard.id,
      })));

      if (decimalToNumber(timeCard.overtimeHours) > 0) {
        base.push({
          id: `${timeCard.id}-overtime`,
          category: 'Overtime',
          severity: 'Info',
          title: 'Overtime review',
          detail: `${decimalToNumber(timeCard.overtimeHours)} overtime hours in ${formatPeriodLabel(timeCard.periodStart, timeCard.periodEnd)}`,
          date: toIsoString(timeCard.periodStart),
          employee: serializeEmployee(timeCard.employee),
          orgUnit: serializeOrgUnit(timeCard.orgUnit),
          relatedEntityType: TIME_CARD_ENTITY_TYPE,
          relatedEntityId: timeCard.id,
        });
      }

      return base;
    }),
    ...uncoveredShifts.map((shift) => ({
      id: `uncovered-${shift.id}`,
      category: 'Coverage',
      severity: 'High',
      title: 'Uncovered shift',
      detail: `Open coverage on ${shift.orgUnit.name}`,
      date: toIsoString(shift.shiftDate),
      employee: null,
      orgUnit: serializeOrgUnit(shift.orgUnit),
      relatedEntityType: 'ScheduledShift',
      relatedEntityId: shift.id,
    })),
    ...leaveConflicts.flatMap((shift) => {
      const matchingLeave = leaveRequests.find((leaveRequest) => {
        if (!shift.employeeId || leaveRequest.employeeId !== shift.employeeId) {
          return false;
        }

        const shiftTime = shift.shiftDate.getTime();
        return shiftTime >= startOfUtcDay(leaveRequest.startDate).getTime()
          && shiftTime <= endOfUtcDay(leaveRequest.endDate).getTime();
      });

      if (!matchingLeave || !shift.employee) {
        return [];
      }

      return [{
        id: `leave-conflict-${shift.id}`,
        category: 'Leave Conflict',
        severity: 'Warning',
        title: 'Approved leave overlaps a scheduled shift',
        detail: `${matchingLeave.leaveType.name} overlaps the published shift.`,
        date: toIsoString(shift.shiftDate),
        employee: serializeEmployee(shift.employee),
        orgUnit: serializeOrgUnit(shift.orgUnit),
        relatedEntityType: 'ScheduledShift',
        relatedEntityId: shift.id,
      }];
    }),
  ];

  return exceptions.sort((left, right) => (left.date ?? '').localeCompare(right.date ?? ''));
}

export async function listLaborGroups(context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);

  const laborGroups = await prisma.laborGroup.findMany({
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      agreementReference: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          employees: true,
          workRuleProfiles: true,
        },
      },
    },
  });

  return laborGroups.map(serializeLaborGroup);
}

export async function createLaborGroup(data: CreateLaborGroupInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage labor groups.');
  }

  const laborGroup = await prisma.laborGroup.create({
    data: {
      code: data.code,
      name: data.name,
      status: data.status,
      agreementReference: trimToNull(data.agreementReference ?? null),
      description: trimToNull(data.description ?? null),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      agreementReference: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          employees: true,
          workRuleProfiles: true,
        },
      },
    },
  });

  return serializeLaborGroup(laborGroup);
}

export async function updateLaborGroup(laborGroupId: string, data: UpdateLaborGroupInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage labor groups.');
  }

  const laborGroup = await prisma.laborGroup.update({
    where: { id: laborGroupId },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      status: data.status ?? undefined,
      agreementReference: data.agreementReference === undefined ? undefined : trimToNull(data.agreementReference ?? null),
      description: data.description === undefined ? undefined : trimToNull(data.description ?? null),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      agreementReference: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          employees: true,
          workRuleProfiles: true,
        },
      },
    },
  });

  return serializeLaborGroup(laborGroup);
}

export async function listRuleProfiles(context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);

  const ruleProfiles = await prisma.workRuleProfile.findMany({
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      dailyOvertimeThreshold: true,
      weeklyOvertimeThreshold: true,
      doubleTimeThreshold: true,
      minimumRestHours: true,
      scheduledDailyHoursTarget: true,
      shiftPremiumRules: true,
      holidayTreatment: true,
      leaveTreatment: true,
      createdAt: true,
      updatedAt: true,
      laborGroup: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          agreementReference: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              employees: true,
              workRuleProfiles: true,
            },
          },
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      position: {
        select: {
          id: true,
          positionCode: true,
          title: true,
        },
      },
      classification: {
        select: {
          id: true,
          code: true,
          title: true,
        },
      },
    },
  });

  return ruleProfiles.map(serializeRuleProfile);
}

export async function createRuleProfile(data: CreateRuleProfileInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage work rule profiles.');
  }

  const ruleProfile = await prisma.workRuleProfile.create({
    data: {
      code: data.code,
      name: data.name,
      status: data.status,
      laborGroupId: data.laborGroupId ?? null,
      orgUnitId: data.orgUnitId ?? null,
      positionId: data.positionId ?? null,
      classificationId: data.classificationId ?? null,
      dailyOvertimeThreshold: new Prisma.Decimal(data.dailyOvertimeThreshold),
      weeklyOvertimeThreshold: new Prisma.Decimal(data.weeklyOvertimeThreshold),
      doubleTimeThreshold: data.doubleTimeThreshold === null || data.doubleTimeThreshold === undefined ? null : new Prisma.Decimal(data.doubleTimeThreshold),
      minimumRestHours: new Prisma.Decimal(data.minimumRestHours),
      scheduledDailyHoursTarget: new Prisma.Decimal(data.scheduledDailyHoursTarget),
      shiftPremiumRules: trimToNull(data.shiftPremiumRules ?? null),
      holidayTreatment: trimToNull(data.holidayTreatment ?? null),
      leaveTreatment: trimToNull(data.leaveTreatment ?? null),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      dailyOvertimeThreshold: true,
      weeklyOvertimeThreshold: true,
      doubleTimeThreshold: true,
      minimumRestHours: true,
      scheduledDailyHoursTarget: true,
      shiftPremiumRules: true,
      holidayTreatment: true,
      leaveTreatment: true,
      createdAt: true,
      updatedAt: true,
      laborGroup: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          agreementReference: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              employees: true,
              workRuleProfiles: true,
            },
          },
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      position: {
        select: {
          id: true,
          positionCode: true,
          title: true,
        },
      },
      classification: {
        select: {
          id: true,
          code: true,
          title: true,
        },
      },
    },
  });

  return serializeRuleProfile(ruleProfile);
}

export async function updateRuleProfile(ruleProfileId: string, data: UpdateRuleProfileInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage work rule profiles.');
  }

  const ruleProfile = await prisma.workRuleProfile.update({
    where: { id: ruleProfileId },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      status: data.status ?? undefined,
      laborGroupId: data.laborGroupId === undefined ? undefined : data.laborGroupId,
      orgUnitId: data.orgUnitId === undefined ? undefined : data.orgUnitId,
      positionId: data.positionId === undefined ? undefined : data.positionId,
      classificationId: data.classificationId === undefined ? undefined : data.classificationId,
      dailyOvertimeThreshold: data.dailyOvertimeThreshold === undefined ? undefined : new Prisma.Decimal(data.dailyOvertimeThreshold),
      weeklyOvertimeThreshold: data.weeklyOvertimeThreshold === undefined ? undefined : new Prisma.Decimal(data.weeklyOvertimeThreshold),
      doubleTimeThreshold: data.doubleTimeThreshold === undefined
        ? undefined
        : (data.doubleTimeThreshold === null ? null : new Prisma.Decimal(data.doubleTimeThreshold)),
      minimumRestHours: data.minimumRestHours === undefined ? undefined : new Prisma.Decimal(data.minimumRestHours),
      scheduledDailyHoursTarget: data.scheduledDailyHoursTarget === undefined ? undefined : new Prisma.Decimal(data.scheduledDailyHoursTarget),
      shiftPremiumRules: data.shiftPremiumRules === undefined ? undefined : trimToNull(data.shiftPremiumRules ?? null),
      holidayTreatment: data.holidayTreatment === undefined ? undefined : trimToNull(data.holidayTreatment ?? null),
      leaveTreatment: data.leaveTreatment === undefined ? undefined : trimToNull(data.leaveTreatment ?? null),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      dailyOvertimeThreshold: true,
      weeklyOvertimeThreshold: true,
      doubleTimeThreshold: true,
      minimumRestHours: true,
      scheduledDailyHoursTarget: true,
      shiftPremiumRules: true,
      holidayTreatment: true,
      leaveTreatment: true,
      createdAt: true,
      updatedAt: true,
      laborGroup: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          agreementReference: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              employees: true,
              workRuleProfiles: true,
            },
          },
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      position: {
        select: {
          id: true,
          positionCode: true,
          title: true,
        },
      },
      classification: {
        select: {
          id: true,
          code: true,
          title: true,
        },
      },
    },
  });

  return serializeRuleProfile(ruleProfile);
}

export async function listShiftTemplates(context: TimeAttendanceContext) {
  const managedEmployeeIds = await getManagedEmployeeIds(context.currentEmployeeId);
  assertManagementContext(context, managedEmployeeIds);
  const managerScoped = !isHrAdmin(context);
  const managerOrgUnitIds = managerScoped ? await getManagedOrgUnitIds(context.currentEmployeeId) : [];

  const shiftTemplates = await prisma.shiftTemplate.findMany({
    where: managerScoped ? { orgUnitId: { in: managerOrgUnitIds } } : {},
    orderBy: [{ orgUnit: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      unpaidBreakMinutes: true,
      paidBreakMinutes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      workRuleProfile: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  return shiftTemplates.map(serializeShiftTemplate);
}

export async function createShiftTemplate(data: CreateShiftTemplateInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage shift templates.');
  }

  const shiftTemplate = await prisma.shiftTemplate.create({
    data: {
      orgUnitId: data.orgUnitId,
      workRuleProfileId: data.workRuleProfileId ?? null,
      code: data.code,
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      unpaidBreakMinutes: data.unpaidBreakMinutes,
      paidBreakMinutes: data.paidBreakMinutes,
      status: data.status,
    },
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      unpaidBreakMinutes: true,
      paidBreakMinutes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      workRuleProfile: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  return serializeShiftTemplate(shiftTemplate);
}

export async function updateShiftTemplate(shiftTemplateId: string, data: UpdateShiftTemplateInput, context: TimeAttendanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage shift templates.');
  }

  const shiftTemplate = await prisma.shiftTemplate.update({
    where: { id: shiftTemplateId },
    data: {
      orgUnitId: data.orgUnitId ?? undefined,
      workRuleProfileId: data.workRuleProfileId === undefined ? undefined : data.workRuleProfileId,
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      startTime: data.startTime ?? undefined,
      endTime: data.endTime ?? undefined,
      unpaidBreakMinutes: data.unpaidBreakMinutes ?? undefined,
      paidBreakMinutes: data.paidBreakMinutes ?? undefined,
      status: data.status ?? undefined,
    },
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      unpaidBreakMinutes: true,
      paidBreakMinutes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      workRuleProfile: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  return serializeShiftTemplate(shiftTemplate);
}

export async function getTimeAttendanceReport() {
  const currentPeriodStart = getPeriodStart(new Date());
  const currentPeriodEnd = getPeriodEnd(currentPeriodStart);
  const [timeCards, uncoveredShifts, schedules] = await Promise.all([
    prisma.timeCard.findMany({
      where: {
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
      },
      orderBy: [{ employee: { lastName: 'asc' } }],
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        overtimeHours: true,
        exceptionCount: true,
        approvalComment: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    }),
    prisma.scheduledShift.findMany({
      where: {
        employeeId: null,
        schedule: { status: 'Published' },
        shiftDate: { gte: currentPeriodStart, lte: currentPeriodEnd },
      },
      orderBy: [{ shiftDate: 'asc' }],
      select: {
        id: true,
        shiftDate: true,
        startDateTime: true,
        endDateTime: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    }),
    prisma.workSchedule.findMany({
      where: {
        periodStart: { lte: currentPeriodEnd },
        periodEnd: { gte: currentPeriodStart },
      },
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        scheduledShifts: {
          select: {
            id: true,
            employeeId: true,
          },
        },
      },
    }),
  ]);

  return {
    overview: {
      pendingApprovals: timeCards.filter((timeCard) => timeCard.status === 'Submitted').length,
      openExceptions: timeCards.filter((timeCard) => timeCard.exceptionCount > 0).length,
      uncoveredShifts: uncoveredShifts.length,
      overtimeHours: Number(timeCards.reduce((total, timeCard) => total + decimalToNumber(timeCard.overtimeHours), 0).toFixed(2)),
    },
    timeCards: timeCards.map((timeCard) => ({
      id: timeCard.id,
      employee: timeCard.employee ? {
        id: timeCard.employee.id,
        employeeNumber: timeCard.employee.employeeNumber,
        fullName: `${timeCard.employee.firstName} ${timeCard.employee.lastName}`,
        department: timeCard.employee.department,
      } : null,
      orgUnit: serializeOrgUnit(timeCard.orgUnit),
      status: timeCard.status,
      periodStart: toIsoString(timeCard.periodStart),
      periodEnd: toIsoString(timeCard.periodEnd),
      overtimeHours: decimalToNumber(timeCard.overtimeHours),
      exceptionCount: timeCard.exceptionCount,
      approvalComment: timeCard.approvalComment ?? null,
    })),
    coverage: schedules.map((schedule) => ({
      id: schedule.id,
      orgUnit: serializeOrgUnit(schedule.orgUnit),
      periodStart: toIsoString(schedule.periodStart),
      periodEnd: toIsoString(schedule.periodEnd),
      status: schedule.status,
      shiftCount: schedule.scheduledShifts.length,
      uncoveredShiftCount: schedule.scheduledShifts.filter((shift) => !shift.employeeId).length,
    })),
    exceptions: [
      ...timeCards
        .filter((timeCard) => timeCard.exceptionCount > 0 || decimalToNumber(timeCard.overtimeHours) > 0)
        .map((timeCard) => ({
          id: timeCard.id,
          category: decimalToNumber(timeCard.overtimeHours) > 0 ? 'Overtime' : 'Time Card',
          employee: timeCard.employee ? `${timeCard.employee.firstName} ${timeCard.employee.lastName}` : 'Unknown employee',
          orgUnit: timeCard.orgUnit?.name ?? 'Unknown org unit',
          date: toIsoString(timeCard.periodStart),
          detail: `${timeCard.exceptionCount} exceptions | ${decimalToNumber(timeCard.overtimeHours)} overtime hours`,
        })),
      ...uncoveredShifts.map((shift) => ({
        id: shift.id,
        category: 'Coverage',
        employee: 'Unassigned',
        orgUnit: shift.orgUnit?.name ?? 'Unknown org unit',
        date: toIsoString(shift.shiftDate),
        detail: `Shift runs ${shift.startDateTime.toISOString().slice(11, 16)} to ${shift.endDateTime.toISOString().slice(11, 16)}`,
      })),
    ],
  };
}
