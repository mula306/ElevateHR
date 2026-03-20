import { Prisma } from '../../generated/prisma';
import {
  ACCOUNT_QUEUE_ADMIN_REVIEW,
  ACCOUNT_QUEUE_FINANCE,
  ACCOUNT_QUEUE_HR_OPERATIONS,
  ACCOUNT_QUEUE_HRBP,
  ACCOUNT_QUEUE_IT,
} from '../../shared/lib/accounts';
import { getFeatureStateRecord, isFeatureEnabled, taskTypeFeatureMap } from '../../shared/lib/features';
import { prisma } from '../../shared/lib/prisma';
import { createHttpError, toIsoString } from '../../shared/lib/service-utils';
import { ListInboxItemsQuery } from './inbox.schemas';

function startOfToday(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
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

function getQueueDisplayLabel(queueKey: string | null | undefined) {
  if (queueKey === ACCOUNT_QUEUE_HR_OPERATIONS) {
    return 'HR Operations';
  }

  if (queueKey === ACCOUNT_QUEUE_IT) {
    return 'IT';
  }

  if (queueKey === ACCOUNT_QUEUE_ADMIN_REVIEW) {
    return 'Admin Review';
  }

  if (queueKey === ACCOUNT_QUEUE_FINANCE) {
    return 'Finance';
  }

  if (queueKey === ACCOUNT_QUEUE_HRBP) {
    return 'HR Business Partner';
  }

  return queueKey ?? null;
}

function getLegacyOwnerLabels(queueKeys: string[]) {
  return queueKeys.flatMap((queueKey) => {
    if (queueKey === ACCOUNT_QUEUE_HR_OPERATIONS) {
      return ['HR Operations'];
    }

    if (queueKey === ACCOUNT_QUEUE_IT) {
      return ['IT'];
    }

    if (queueKey === ACCOUNT_QUEUE_ADMIN_REVIEW) {
      return ['Admin Review'];
    }

    if (queueKey === ACCOUNT_QUEUE_FINANCE) {
      return ['Finance'];
    }

    if (queueKey === ACCOUNT_QUEUE_HRBP) {
      return ['HRBP', 'HR Business Partner'];
    }

    return [];
  });
}

function getSourceType(taskType: string) {
  if (taskType === 'LeaveApproval') {
    return 'Leave';
  }

  if (taskType === 'JobRequestApproval' || taskType === 'JobRequestRework' || taskType === 'HiringCloseout') {
    return 'Recruitment';
  }

  if (
    taskType === 'TimeCardApproval'
    || taskType === 'TimeCardCorrection'
    || taskType === 'OvertimeReview'
  ) {
    return 'Time';
  }

  if (
    taskType === 'PerformanceSelfReview'
    || taskType === 'PerformanceManagerReview'
    || taskType === 'PerformanceAcknowledgment'
  ) {
    return 'Performance';
  }

  if (taskType === 'LearningDue' || taskType === 'LearningRenewal') {
    return 'Learning';
  }

  if (taskType === 'Checklist') {
    return 'Checklist';
  }

  if (taskType === 'DocumentAcknowledgment') {
    return 'Document';
  }

  return 'Operational';
}

function getActionKind(task: { taskType: string; status: string }) {
  if (task.taskType === 'LeaveApproval' && task.status === 'Open') {
    return 'approve_leave';
  }

  if (task.taskType === 'TimeCardApproval' && task.status === 'Open') {
    return 'approve_time_card';
  }

  if ((task.taskType === 'JobRequestApproval' || task.taskType === 'JobRequestRework' || task.taskType === 'HiringCloseout') && task.status === 'Open') {
    return 'open_record';
  }

  if (
    task.status === 'Open'
    && (task.taskType === 'PerformanceSelfReview' || task.taskType === 'PerformanceManagerReview' || task.taskType === 'PerformanceAcknowledgment')
  ) {
    return 'open_record';
  }

  if (task.status === 'Open' && (task.taskType === 'Checklist' || task.taskType === 'Operational')) {
    return 'complete_task';
  }

  return 'open_record';
}

function serializeInboxItem(task: any, currentAccount: Express.Request['account']) {
  const currentEmployeeId = currentAccount?.employeeId ?? null;
  const directlyAssigned = Boolean(currentAccount?.id && task.assigneeAccountId === currentAccount.id)
    || Boolean(currentEmployeeId && task.ownerEmployeeId === currentEmployeeId && !task.assigneeQueueKey);
  const assigneeLabel = directlyAssigned
    ? 'You'
    : getQueueDisplayLabel(task.assigneeQueueKey) ?? task.ownerLabel ?? 'Assigned';

  return {
    id: task.id,
    sourceType: getSourceType(task.taskType),
    taskType: task.taskType,
    title: task.title,
    dueDate: toIsoString(task.dueDate),
    priority: task.priority,
    status: task.status,
    assignee: {
      type: task.assigneeQueueKey ? 'Queue' : 'Account',
      label: assigneeLabel,
      queueKey: task.assigneeQueueKey ?? null,
    },
    subjectEmployee: task.employee ? {
      id: task.employee.id,
      employeeNumber: task.employee.employeeNumber,
      fullName: `${task.employee.firstName} ${task.employee.lastName}`,
      department: task.employee.department,
      jobTitle: task.employee.jobTitle,
    } : null,
    relatedEntityType: task.relatedEntityType ?? null,
    relatedEntityId: task.relatedEntityId ?? null,
    actionKind: getActionKind(task),
  };
}

function buildOwnershipWhere(currentAccount: Express.Request['account']): Prisma.WorkflowTaskWhereInput {
  if (!currentAccount) {
    return { id: '__no-account__' };
  }

  const ownershipClauses: Prisma.WorkflowTaskWhereInput[] = [];
  const legacyOwnerLabels = getLegacyOwnerLabels(currentAccount.queueMemberships);

  ownershipClauses.push({ assigneeAccountId: currentAccount.id });

  if (currentAccount.queueMemberships.length > 0) {
    ownershipClauses.push({
      assigneeQueueKey: {
        in: currentAccount.queueMemberships,
      },
    });
  }

  if (currentAccount.employeeId) {
    ownershipClauses.push({
      assigneeAccountId: null,
      assigneeQueueKey: null,
      ownerEmployeeId: currentAccount.employeeId,
    });
  }

  if (legacyOwnerLabels.length > 0) {
    ownershipClauses.push({
      assigneeAccountId: null,
      assigneeQueueKey: null,
      ownerEmployeeId: null,
      ownerLabel: {
        in: legacyOwnerLabels,
      },
    });
  }

  return {
    OR: ownershipClauses,
  };
}

function buildTaskTypeWhere(query: ListInboxItemsQuery): Prisma.WorkflowTaskWhereInput {
  if (query.tab === 'approvals') {
    return { taskType: 'LeaveApproval' };
  }

  if (query.tab === 'tasks') {
    return {
      taskType: {
        not: 'LeaveApproval',
      },
    };
  }

  if (!query.source) {
    return {};
  }

  if (query.source === 'Leave') {
    return { taskType: 'LeaveApproval' };
  }

  if (query.source === 'Time') {
    return {
      taskType: {
        in: ['TimeCardApproval', 'TimeCardCorrection', 'OvertimeReview'],
      },
    };
  }

  if (query.source === 'Recruitment') {
    return {
      taskType: {
        in: ['JobRequestApproval', 'JobRequestRework', 'HiringCloseout'],
      },
    };
  }

  if (query.source === 'Checklist') {
    return { taskType: 'Checklist' };
  }

  if (query.source === 'Document') {
    return { taskType: 'DocumentAcknowledgment' };
  }

  if (query.source === 'Performance') {
    return {
      taskType: {
        in: ['PerformanceSelfReview', 'PerformanceManagerReview', 'PerformanceAcknowledgment'],
      },
    };
  }

  if (query.source === 'Learning') {
    return {
      taskType: {
        in: ['LearningDue', 'LearningRenewal'],
      },
    };
  }

  return {
    taskType: {
      notIn: ['LeaveApproval', 'TimeCardApproval', 'TimeCardCorrection', 'OvertimeReview', 'Checklist', 'DocumentAcknowledgment', 'PerformanceSelfReview', 'PerformanceManagerReview', 'PerformanceAcknowledgment', 'LearningDue', 'LearningRenewal', 'JobRequestApproval', 'JobRequestRework', 'HiringCloseout'],
    },
  };
}

function buildStatusWhere(query: ListInboxItemsQuery) {
  if (query.status) {
    return { status: query.status };
  }

  if (query.tab === 'completed') {
    return { status: 'Completed' };
  }

  return { status: 'Open' };
}

function buildDueWindowWhere(query: ListInboxItemsQuery, now: Date): Prisma.WorkflowTaskWhereInput {
  if (query.dueWindow === 'all') {
    return {};
  }

  if (query.dueWindow === 'overdue') {
    return {
      dueDate: {
        lt: now,
      },
    };
  }

  const today = startOfToday(now);
  const tomorrow = addUtcDays(today, 1);

  if (query.dueWindow === 'today') {
    return {
      dueDate: {
        gte: today,
        lt: tomorrow,
      },
    };
  }

  return {
    dueDate: {
      gte: today,
      lte: addUtcDays(today, 7),
    },
  };
}

function buildSearchWhere(query: ListInboxItemsQuery): Prisma.WorkflowTaskWhereInput {
  const search = query.search?.trim();

  if (!search) {
    return {};
  }

  return {
    OR: [
      { title: { contains: search } },
      { description: { contains: search } },
      { employee: { is: { firstName: { contains: search } } } },
      { employee: { is: { lastName: { contains: search } } } },
      { employee: { is: { employeeNumber: { contains: search } } } },
    ],
  };
}

function getInboxTaskSelect() {
  return {
    id: true,
    taskType: true,
    title: true,
    status: true,
    priority: true,
    dueDate: true,
    ownerEmployeeId: true,
    ownerLabel: true,
    assigneeAccountId: true,
    assigneeQueueKey: true,
    relatedEntityType: true,
    relatedEntityId: true,
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
  } satisfies Prisma.WorkflowTaskSelect;
}

function getDisabledTaskTypes() {
  return getFeatureStateRecord().then((featureStates) => Object.entries(taskTypeFeatureMap)
    .filter(([, featureKey]) => featureKey && !isFeatureEnabled(featureStates, featureKey))
    .map(([taskType]) => taskType));
}

export async function getInboxSummary(currentAccount: Express.Request['account']) {
  const now = new Date();
  const today = startOfToday(now);
  const disabledTaskTypes = await getDisabledTaskTypes();

  const where = buildOwnershipWhere(currentAccount);
  const [openCount, overdueCount, approvalCount, urgentPreview] = await Promise.all([
    prisma.workflowTask.count({
      where: {
        AND: [
          where,
          { status: 'Open' },
          disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
        ],
      },
    }),
    prisma.workflowTask.count({
      where: {
        AND: [
          where,
          { status: 'Open' },
          { dueDate: { lt: now } },
          disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
        ],
      },
    }),
    prisma.workflowTask.count({
      where: {
        AND: [
          where,
          { status: 'Open' },
          { taskType: 'LeaveApproval' },
          disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
        ],
      },
    }),
    prisma.workflowTask.findMany({
      where: {
        AND: [
          where,
          { status: 'Open' },
          disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
        ],
      },
      orderBy: [
        { dueDate: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 5,
      select: getInboxTaskSelect(),
    }),
  ]);

  return {
    openCount,
    overdueCount,
    approvalCount,
    dueTodayCount: await prisma.workflowTask.count({
      where: {
        AND: [
          where,
          { status: 'Open' },
          disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
          {
            dueDate: {
              gte: today,
              lt: addUtcDays(today, 1),
            },
          },
        ],
      },
    }),
    urgentPreview: urgentPreview.map((task) => serializeInboxItem(task, currentAccount)),
  };
}

export async function listInboxItems(
  currentAccount: Express.Request['account'],
  query: ListInboxItemsQuery,
) {
  if (!currentAccount) {
    throw createHttpError(401, 'No active account is available for this inbox.');
  }

  const now = new Date();
  const disabledTaskTypes = await getDisabledTaskTypes();
  const where: Prisma.WorkflowTaskWhereInput = {
    AND: [
      buildOwnershipWhere(currentAccount),
      buildStatusWhere(query),
      buildTaskTypeWhere(query),
      buildDueWindowWhere(query, now),
      buildSearchWhere(query),
      disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.workflowTask.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [
        { dueDate: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      select: getInboxTaskSelect(),
    }),
    prisma.workflowTask.count({ where }),
  ]);

  return {
    data: items.map((task) => serializeInboxItem(task, currentAccount)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
