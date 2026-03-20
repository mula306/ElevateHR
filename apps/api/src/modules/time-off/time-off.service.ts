import { Prisma } from '../../generated/prisma';
import {
  ACCOUNT_QUEUE_HR_OPERATIONS,
  findActiveAccountIdByEmployeeId,
} from '../../shared/lib/accounts';
import { prisma } from '../../shared/lib/prisma';
import {
  cancelWorkflowTasksForEntity,
  createApprovalAction,
  createWorkflowTask,
  LEAVE_REQUEST_APPROVED_STATUS,
  LEAVE_REQUEST_PENDING_STATUS,
  LEAVE_REQUEST_REJECTED_STATUS,
  TERMINATED_EMPLOYEE_STATUS,
  WORKFLOW_STATUS_COMPLETED,
  WORKFLOW_STATUS_OPEN,
} from '../../shared/lib/hr-ops';
import {
  createHttpError,
  decimalToNumber,
  toDateValue,
  toIsoString,
  trimToNull,
} from '../../shared/lib/service-utils';
import {
  CancelLeaveRequestInput,
  CreateLeaveRequestInput,
  LeaveDecisionInput,
  ListLeaveRequestsQuery,
  UpdateLeaveRequestInput,
} from './time-off.schemas';

const LEAVE_REQUEST_CANCELLED_STATUS = 'Cancelled';
const LEAVE_REQUEST_ENTITY_TYPE = 'LeaveRequest';
const HR_OPERATIONS_LABEL = 'HR Operations';

function serializeLeaveType(leaveType: any) {
  return {
    id: leaveType.id,
    code: leaveType.code,
    name: leaveType.name,
    description: leaveType.description ?? null,
    accentColor: leaveType.accentColor ?? null,
    isActive: leaveType.isActive,
  };
}

function serializeHoliday(holiday: any) {
  return {
    id: holiday.id,
    name: holiday.name,
    holidayDate: toIsoString(holiday.holidayDate),
    note: holiday.note ?? null,
    orgUnit: holiday.orgUnit ? {
      id: holiday.orgUnit.id,
      code: holiday.orgUnit.code,
      name: holiday.orgUnit.name,
      type: holiday.orgUnit.type,
    } : null,
  };
}

function serializeLeaveRequest(leaveRequest: any, requesterEmployeeId?: string | null) {
  const belongsToRequester = Boolean(requesterEmployeeId && leaveRequest.employee?.id === requesterEmployeeId);
  const canManagePendingRequest = belongsToRequester && leaveRequest.status === LEAVE_REQUEST_PENDING_STATUS;

  return {
    id: leaveRequest.id,
    startDate: toIsoString(leaveRequest.startDate),
    endDate: toIsoString(leaveRequest.endDate),
    requestedHours: decimalToNumber(leaveRequest.requestedHours),
    status: leaveRequest.status,
    notes: leaveRequest.notes ?? null,
    decisionComment: leaveRequest.decisionComment ?? null,
    respondedAt: toIsoString(leaveRequest.respondedAt),
    createdAt: toIsoString(leaveRequest.createdAt),
    updatedAt: toIsoString(leaveRequest.updatedAt),
    employee: leaveRequest.employee ? {
      id: leaveRequest.employee.id,
      employeeNumber: leaveRequest.employee.employeeNumber,
      firstName: leaveRequest.employee.firstName,
      lastName: leaveRequest.employee.lastName,
      fullName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
      status: leaveRequest.employee.status,
      jobTitle: leaveRequest.employee.jobTitle,
      department: leaveRequest.employee.department,
    } : null,
    approver: leaveRequest.approver ? {
      id: leaveRequest.approver.id,
      employeeNumber: leaveRequest.approver.employeeNumber,
      firstName: leaveRequest.approver.firstName,
      lastName: leaveRequest.approver.lastName,
      fullName: `${leaveRequest.approver.firstName} ${leaveRequest.approver.lastName}`,
      jobTitle: leaveRequest.approver.jobTitle,
    } : null,
    leaveType: leaveRequest.leaveType ? serializeLeaveType(leaveRequest.leaveType) : null,
    canEdit: canManagePendingRequest,
    canCancel: canManagePendingRequest,
  };
}

function getLeaveRequestSelect() {
  return {
    id: true,
    startDate: true,
    endDate: true,
    requestedHours: true,
    status: true,
    notes: true,
    decisionComment: true,
    respondedAt: true,
    createdAt: true,
    updatedAt: true,
    employee: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        jobTitle: true,
        department: true,
      },
    },
    approver: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
      },
    },
    leaveType: {
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        accentColor: true,
        isActive: true,
      },
    },
  } satisfies Prisma.LeaveRequestSelect;
}

function buildLeaveRequestTaskTitle(
  employee: { firstName: string; lastName: string },
  leaveType: { name: string },
) {
  return `${employee.firstName} ${employee.lastName}: ${leaveType.name} request`;
}

function buildLeaveRequestTaskDescription(
  requestedHours: Prisma.Decimal | number,
  startDate: Date,
  endDate: Date,
) {
  return `${requestedHours.toString()} hours from ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`;
}

async function getEmployeeForLeave(transaction: Prisma.TransactionClient, employeeId: string) {
  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      department: true,
      status: true,
      managerId: true,
    },
  });

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  if (employee.status === TERMINATED_EMPLOYEE_STATUS) {
    throw createHttpError(409, 'Terminated employees cannot submit leave requests.');
  }

  return employee;
}

async function getRequesterEmployee(
  transaction: Prisma.TransactionClient,
  requesterEmployeeId: string | null | undefined,
) {
  if (!requesterEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile before requesting time off.');
  }

  return getEmployeeForLeave(transaction, requesterEmployeeId);
}

async function getLeaveTypeForValidation(transaction: Prisma.TransactionClient, leaveTypeId: string) {
  const leaveType = await transaction.leaveType.findUnique({
    where: { id: leaveTypeId },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  });

  if (!leaveType) {
    throw createHttpError(404, 'Leave type not found.');
  }

  if (!leaveType.isActive) {
    throw createHttpError(409, 'Selected leave type is inactive.');
  }

  return leaveType;
}

async function resolveLeaveApprovalRoute(
  transaction: Prisma.TransactionClient,
  employee: {
    id: string;
    managerId: string | null;
  },
) {
  if (!employee.managerId || employee.managerId === employee.id) {
    return {
      approver: null,
      assigneeAccountId: null,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerEmployeeId: null,
      ownerLabel: HR_OPERATIONS_LABEL,
    };
  }

  const approver = await transaction.employee.findUnique({
    where: { id: employee.managerId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      status: true,
    },
  });

  if (!approver || approver.status === TERMINATED_EMPLOYEE_STATUS) {
    return {
      approver: null,
      assigneeAccountId: null,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerEmployeeId: null,
      ownerLabel: HR_OPERATIONS_LABEL,
    };
  }

  const assigneeAccountId = await findActiveAccountIdByEmployeeId(transaction, approver.id);

  if (!assigneeAccountId) {
    return {
      approver: null,
      assigneeAccountId: null,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerEmployeeId: null,
      ownerLabel: HR_OPERATIONS_LABEL,
    };
  }

  return {
    approver,
    assigneeAccountId,
    assigneeQueueKey: null,
    ownerEmployeeId: approver.id,
    ownerLabel: `${approver.firstName} ${approver.lastName}`,
  };
}

async function assertNoOverlappingLeave(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  startDate: Date,
  endDate: Date,
  currentLeaveRequestId?: string,
) {
  const overlappingRequest = await transaction.leaveRequest.findFirst({
    where: {
      employeeId,
      id: currentLeaveRequestId ? { not: currentLeaveRequestId } : undefined,
      status: { in: [LEAVE_REQUEST_PENDING_STATUS, LEAVE_REQUEST_APPROVED_STATUS] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });

  if (overlappingRequest) {
    throw createHttpError(409, 'This leave request overlaps an existing pending or approved request.');
  }
}

async function syncLeaveRequestTaskStatus(
  transaction: Prisma.TransactionClient,
  leaveRequestId: string,
  status: string,
  comments?: string | null,
) {
  if (status === LEAVE_REQUEST_CANCELLED_STATUS) {
    await cancelWorkflowTasksForEntity(transaction, LEAVE_REQUEST_ENTITY_TYPE, leaveRequestId, comments);
    return;
  }

  const data = status === LEAVE_REQUEST_PENDING_STATUS
    ? {
      status: WORKFLOW_STATUS_OPEN,
      completedAt: null,
      comments: trimToNull(comments),
    }
    : {
      status: WORKFLOW_STATUS_COMPLETED,
      completedAt: new Date(),
      comments: trimToNull(comments),
    };

  await transaction.workflowTask.updateMany({
    where: {
      relatedEntityType: LEAVE_REQUEST_ENTITY_TYPE,
      relatedEntityId: leaveRequestId,
    },
    data,
  });
}

async function upsertLeaveRequestTask(
  transaction: Prisma.TransactionClient,
  input: {
    leaveRequestId: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
    };
    leaveType: {
      name: string;
    };
    startDate: Date;
    endDate: Date;
    requestedHours: Prisma.Decimal | number;
    ownerEmployeeId: string | null;
    assigneeAccountId: string | null;
    assigneeQueueKey: string | null;
    ownerLabel: string | null;
  },
) {
  const title = buildLeaveRequestTaskTitle(input.employee, input.leaveType);
  const description = buildLeaveRequestTaskDescription(
    input.requestedHours,
    input.startDate,
    input.endDate,
  );

  const updateResult = await transaction.workflowTask.updateMany({
    where: {
      relatedEntityType: LEAVE_REQUEST_ENTITY_TYPE,
      relatedEntityId: input.leaveRequestId,
    },
    data: {
      title,
      description,
      employeeId: input.employee.id,
      ownerEmployeeId: input.ownerEmployeeId,
      assigneeAccountId: input.assigneeAccountId,
      assigneeQueueKey: input.assigneeQueueKey,
      ownerLabel: trimToNull(input.ownerLabel),
      dueDate: input.startDate,
      priority: 'Normal',
      status: WORKFLOW_STATUS_OPEN,
      completedAt: null,
      comments: null,
    },
  });

  if (updateResult.count > 0) {
    return;
  }

  await createWorkflowTask(transaction, {
    taskType: 'LeaveApproval',
    title,
    description,
    employeeId: input.employee.id,
    ownerEmployeeId: input.ownerEmployeeId,
    assigneeAccountId: input.assigneeAccountId,
    assigneeQueueKey: input.assigneeQueueKey,
    ownerLabel: input.ownerLabel,
    relatedEntityType: LEAVE_REQUEST_ENTITY_TYPE,
    relatedEntityId: input.leaveRequestId,
    dueDate: input.startDate,
    priority: 'Normal',
  });
}

async function selectLeaveRequestById(leaveRequestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: getLeaveRequestSelect(),
  });

  if (!leaveRequest) {
    throw createHttpError(404, 'Leave request not found.');
  }

  return leaveRequest;
}

async function getRequesterLeaveRequest(
  transaction: Prisma.TransactionClient,
  leaveRequestId: string,
  requesterEmployeeId: string | null | undefined,
) {
  const requesterEmployee = await getRequesterEmployee(transaction, requesterEmployeeId);
  const leaveRequest = await transaction.leaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      employeeId: requesterEmployee.id,
    },
    select: {
      id: true,
      employeeId: true,
      leaveTypeId: true,
      approverId: true,
      startDate: true,
      endDate: true,
      requestedHours: true,
      status: true,
      notes: true,
    },
  });

  if (!leaveRequest) {
    throw createHttpError(404, 'Leave request not found.');
  }

  return {
    requesterEmployee,
    leaveRequest,
  };
}

export async function listLeaveTypes() {
  const leaveTypes = await prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      accentColor: true,
      isActive: true,
    },
  });

  return leaveTypes.map(serializeLeaveType);
}

export async function listHolidays() {
  const holidays = await prisma.holiday.findMany({
    orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
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
  });

  return holidays.map(serializeHoliday);
}

export async function listLeaveRequests(
  query: ListLeaveRequestsQuery,
  requesterEmployeeId?: string | null,
) {
  if (!requesterEmployeeId) {
    return {
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const search = query.search?.trim();
  const now = new Date();
  const where: Prisma.LeaveRequestWhereInput = {
    employeeId: requesterEmployeeId,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.upcomingOnly) {
    where.endDate = { gte: now };
    where.status = LEAVE_REQUEST_APPROVED_STATUS;
  }

  if (search) {
    where.OR = [
      { leaveType: { is: { name: { contains: search } } } },
      { leaveType: { is: { code: { contains: search } } } },
      { notes: { contains: search } },
      { decisionComment: { contains: search } },
    ];
  }

  const [leaveRequests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      select: getLeaveRequestSelect(),
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return {
    data: leaveRequests.map((leaveRequest) => serializeLeaveRequest(leaveRequest, requesterEmployeeId)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function createLeaveRequest(
  data: CreateLeaveRequestInput,
  context: {
    requesterEmployeeId?: string | null;
    userId?: string | null;
  } = {},
) {
  const createdLeaveRequestId = await prisma.$transaction(async (transaction) => {
    const employee = await getRequesterEmployee(transaction, context.requesterEmployeeId);
    const leaveType = await getLeaveTypeForValidation(transaction, data.leaveTypeId);
    const approvalRoute = await resolveLeaveApprovalRoute(transaction, employee);
    const startDate = toDateValue(data.startDate);
    const endDate = toDateValue(data.endDate);

    if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
      throw createHttpError(400, 'Start and end dates are required.');
    }

    await assertNoOverlappingLeave(transaction, employee.id, startDate, endDate);

    const createdLeaveRequest = await transaction.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        approverId: approvalRoute.approver?.id ?? null,
        startDate,
        endDate,
        requestedHours: new Prisma.Decimal(data.requestedHours),
        status: LEAVE_REQUEST_PENDING_STATUS,
        notes: trimToNull(data.notes),
        createdBy: context.userId ?? null,
        updatedBy: context.userId ?? null,
      },
      select: {
        id: true,
        requestedHours: true,
      },
    });

    await upsertLeaveRequestTask(transaction, {
      leaveRequestId: createdLeaveRequest.id,
      employee,
      leaveType,
      startDate,
      endDate,
      requestedHours: createdLeaveRequest.requestedHours,
      ownerEmployeeId: approvalRoute.ownerEmployeeId,
      assigneeAccountId: approvalRoute.assigneeAccountId,
      assigneeQueueKey: approvalRoute.assigneeQueueKey,
      ownerLabel: approvalRoute.ownerLabel,
    });

    return createdLeaveRequest.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLeaveRequest(
    await selectLeaveRequestById(createdLeaveRequestId),
    context.requesterEmployeeId,
  );
}

export async function updateLeaveRequest(
  leaveRequestId: string,
  data: UpdateLeaveRequestInput,
  context: {
    requesterEmployeeId?: string | null;
    userId?: string | null;
  } = {},
) {
  const updatedLeaveRequestId = await prisma.$transaction(async (transaction) => {
    const { requesterEmployee, leaveRequest } = await getRequesterLeaveRequest(
      transaction,
      leaveRequestId,
      context.requesterEmployeeId,
    );

    if (leaveRequest.status !== LEAVE_REQUEST_PENDING_STATUS) {
      throw createHttpError(409, 'Only pending leave requests can be edited.');
    }

    const startDate = (toDateValue(data.startDate) as Date | undefined) ?? leaveRequest.startDate;
    const endDate = (toDateValue(data.endDate) as Date | undefined) ?? leaveRequest.endDate;

    if (startDate > endDate) {
      throw createHttpError(409, 'The start date must be on or before the end date.');
    }

    await assertNoOverlappingLeave(
      transaction,
      requesterEmployee.id,
      startDate,
      endDate,
      leaveRequestId,
    );

    const leaveType = data.leaveTypeId
      ? await getLeaveTypeForValidation(transaction, data.leaveTypeId)
      : await transaction.leaveType.findUnique({
        where: { id: leaveRequest.leaveTypeId },
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      });

    if (!leaveType) {
      throw createHttpError(404, 'Leave type not found.');
    }

    const approvalRoute = await resolveLeaveApprovalRoute(transaction, requesterEmployee);
    const requestedHours = data.requestedHours === undefined
      ? leaveRequest.requestedHours
      : new Prisma.Decimal(data.requestedHours);

    await transaction.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        leaveTypeId: leaveType.id,
        approverId: approvalRoute.approver?.id ?? null,
        startDate,
        endDate,
        requestedHours,
        notes: data.notes === undefined ? undefined : trimToNull(data.notes),
        updatedBy: context.userId ?? null,
      },
    });

    await upsertLeaveRequestTask(transaction, {
      leaveRequestId,
      employee: requesterEmployee,
      leaveType,
      startDate,
      endDate,
      requestedHours,
      ownerEmployeeId: approvalRoute.ownerEmployeeId,
      assigneeAccountId: approvalRoute.assigneeAccountId,
      assigneeQueueKey: approvalRoute.assigneeQueueKey,
      ownerLabel: approvalRoute.ownerLabel,
    });

    return leaveRequestId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLeaveRequest(
    await selectLeaveRequestById(updatedLeaveRequestId),
    context.requesterEmployeeId,
  );
}

export async function cancelLeaveRequest(
  leaveRequestId: string,
  data: CancelLeaveRequestInput,
  context: {
    requesterEmployeeId?: string | null;
    userId?: string | null;
  } = {},
) {
  const cancelledLeaveRequestId = await prisma.$transaction(async (transaction) => {
    const { leaveRequest } = await getRequesterLeaveRequest(
      transaction,
      leaveRequestId,
      context.requesterEmployeeId,
    );

    if (leaveRequest.status !== LEAVE_REQUEST_PENDING_STATUS) {
      throw createHttpError(409, 'Only pending leave requests can be cancelled.');
    }

    await transaction.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: LEAVE_REQUEST_CANCELLED_STATUS,
        decisionComment: trimToNull(data.comments),
        respondedAt: new Date(),
        updatedBy: context.userId ?? null,
      },
    });

    await syncLeaveRequestTaskStatus(
      transaction,
      leaveRequestId,
      LEAVE_REQUEST_CANCELLED_STATUS,
      data.comments,
    );

    return leaveRequestId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLeaveRequest(
    await selectLeaveRequestById(cancelledLeaveRequestId),
    context.requesterEmployeeId,
  );
}

async function decideLeaveRequest(
  leaveRequestId: string,
  nextStatus: 'Approved' | 'Rejected',
  data: LeaveDecisionInput,
  actorEmployeeId?: string | null,
) {
  const leaveRequest = await prisma.$transaction(async (transaction) => {
    const existingLeaveRequest = await transaction.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        leaveType: {
          select: { name: true },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!existingLeaveRequest) {
      throw createHttpError(404, 'Leave request not found.');
    }

    if (existingLeaveRequest.status !== LEAVE_REQUEST_PENDING_STATUS) {
      throw createHttpError(409, `Only pending leave requests can be ${nextStatus.toLowerCase()}.`);
    }

    const updatedLeaveRequest = await transaction.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: nextStatus,
        decisionComment: trimToNull(data.comments),
        respondedAt: new Date(),
      },
    });

    await syncLeaveRequestTaskStatus(
      transaction,
      leaveRequestId,
      nextStatus,
      data.comments,
    );

    const relatedTask = await transaction.workflowTask.findFirst({
      where: {
        relatedEntityType: LEAVE_REQUEST_ENTITY_TYPE,
        relatedEntityId: leaveRequestId,
      },
      select: {
        id: true,
      },
    });

    if (relatedTask) {
      await createApprovalAction(transaction, relatedTask.id, nextStatus, actorEmployeeId, data.comments);
    }

    return updatedLeaveRequest;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLeaveRequest(await selectLeaveRequestById(leaveRequest.id));
}

export async function approveLeaveRequest(
  leaveRequestId: string,
  data: LeaveDecisionInput,
  actorEmployeeId?: string | null,
) {
  return decideLeaveRequest(leaveRequestId, LEAVE_REQUEST_APPROVED_STATUS, data, actorEmployeeId);
}

export async function rejectLeaveRequest(
  leaveRequestId: string,
  data: LeaveDecisionInput,
  actorEmployeeId?: string | null,
) {
  return decideLeaveRequest(leaveRequestId, LEAVE_REQUEST_REJECTED_STATUS, data, actorEmployeeId);
}
