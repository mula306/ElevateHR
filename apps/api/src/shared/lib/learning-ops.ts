import { Prisma } from '../../generated/prisma';
import {
  cancelWorkflowTasksForEntity,
  createWorkflowTask,
  TERMINATED_EMPLOYEE_STATUS,
  WORKFLOW_STATUS_OPEN,
} from './hr-ops';

export const LEARNING_ASSIGNMENT_TYPE_CONTENT = 'Content';
export const LEARNING_ASSIGNMENT_TYPE_PATH = 'Path';
export const LEARNING_REQUIREMENT_REQUIRED = 'Required';
export const LEARNING_REQUIREMENT_RECOMMENDED = 'Recommended';
export const LEARNING_RECORD_STATUS_ASSIGNED = 'Assigned';
export const LEARNING_RECORD_STATUS_IN_PROGRESS = 'In Progress';
export const LEARNING_RECORD_STATUS_COMPLETED = 'Completed';
export const LEARNING_RECORD_STATUS_EXPIRED = 'Expired';
export const LEARNING_RECORD_STATUS_CANCELLED = 'Cancelled';
export const LEARNING_SOURCE_MANUAL = 'Manual';
export const LEARNING_SOURCE_RULE = 'Rule';
export const LEARNING_TASK_DUE = 'LearningDue';
export const LEARNING_TASK_RENEWAL = 'LearningRenewal';

export function addUtcDays(date: Date, offset: number) {
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

export function parseLearningTagList(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function serializeLearningTagList(tags: string[] | null | undefined) {
  if (!tags || tags.length === 0) {
    return null;
  }

  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
}

function calculateRenewalDueDate(baseDate: Date, renewalDays: number | null | undefined) {
  if (!renewalDays || renewalDays <= 0) {
    return null;
  }

  return addUtcDays(baseDate, Math.max(renewalDays - 30, 0));
}

async function setLearningWorkflowTaskState(
  transaction: Prisma.TransactionClient,
  taskType: string,
  learningRecordId: string,
  state: 'open' | 'complete' | 'cancel',
  input?: {
    title: string;
    employeeId: string;
    ownerEmployeeId: string | null;
    ownerLabel: string;
    dueDate: Date | null;
    priority: string;
  },
) {
  if (state === 'open' && input) {
    const updated = await transaction.workflowTask.updateMany({
      where: {
        taskType,
        relatedEntityType: 'LearningRecord',
        relatedEntityId: learningRecordId,
      },
      data: {
        title: input.title,
        status: WORKFLOW_STATUS_OPEN,
        dueDate: input.dueDate,
        employeeId: input.employeeId,
        ownerEmployeeId: input.ownerEmployeeId,
        ownerLabel: input.ownerLabel,
        priority: input.priority,
        completedAt: null,
        comments: null,
      },
    });

    if (updated.count === 0) {
      await createWorkflowTask(transaction, {
        taskType,
        title: input.title,
        employeeId: input.employeeId,
        ownerEmployeeId: input.ownerEmployeeId,
        ownerLabel: input.ownerLabel,
        dueDate: input.dueDate,
        priority: input.priority,
        relatedEntityType: 'LearningRecord',
        relatedEntityId: learningRecordId,
      });
    }

    return;
  }

  if (state === 'complete') {
    await transaction.workflowTask.updateMany({
      where: {
        taskType,
        relatedEntityType: 'LearningRecord',
        relatedEntityId: learningRecordId,
        status: WORKFLOW_STATUS_OPEN,
      },
      data: {
        status: 'Completed',
        completedAt: new Date(),
        comments: null,
      },
    });
    return;
  }

  await transaction.workflowTask.updateMany({
    where: {
      taskType,
      relatedEntityType: 'LearningRecord',
      relatedEntityId: learningRecordId,
      status: { in: [WORKFLOW_STATUS_OPEN, 'Completed'] },
    },
    data: {
      status: 'Cancelled',
      completedAt: new Date(),
      comments: 'Learning work no longer requires action.',
    },
  });
}

export async function syncLearningWorkflowTasks(
  transaction: Prisma.TransactionClient,
  record: {
    id: string;
    status: string;
    requirementType: string;
    mandatory: boolean;
    dueDate: Date | null;
    renewalDueDate: Date | null;
    employeeId: string;
    employee: {
      firstName: string;
      lastName: string;
      managerId: string | null;
    };
    content: {
      title: string;
      certificateEligible: boolean;
    };
  },
) {
  const dueTaskInput = {
    title: `${record.employee.firstName} ${record.employee.lastName}: ${record.content.title}`,
    employeeId: record.employeeId,
    ownerEmployeeId: record.employeeId,
    ownerLabel: 'Employee',
    dueDate: record.dueDate,
    priority: record.mandatory ? 'High' : 'Normal',
  };

  const renewalTaskInput = {
    title: `${record.employee.firstName} ${record.employee.lastName}: renew ${record.content.title}`,
    employeeId: record.employeeId,
    ownerEmployeeId: record.employeeId,
    ownerLabel: 'Employee',
    dueDate: record.renewalDueDate,
    priority: 'High',
  };

  const requiresDueTask = (
    record.status === LEARNING_RECORD_STATUS_ASSIGNED
    || record.status === LEARNING_RECORD_STATUS_IN_PROGRESS
  )
    && (record.mandatory || record.requirementType === LEARNING_REQUIREMENT_REQUIRED)
    && Boolean(record.dueDate);

  if (requiresDueTask) {
    await setLearningWorkflowTaskState(transaction, LEARNING_TASK_DUE, record.id, 'open', dueTaskInput);
  } else if (record.status === LEARNING_RECORD_STATUS_COMPLETED || record.status === LEARNING_RECORD_STATUS_EXPIRED) {
    await setLearningWorkflowTaskState(transaction, LEARNING_TASK_DUE, record.id, 'complete');
  } else {
    await setLearningWorkflowTaskState(transaction, LEARNING_TASK_DUE, record.id, 'cancel');
  }

  const requiresRenewalTask = (
    record.status === LEARNING_RECORD_STATUS_COMPLETED
    || record.status === LEARNING_RECORD_STATUS_EXPIRED
  )
    && record.content.certificateEligible
    && Boolean(record.renewalDueDate);

  if (requiresRenewalTask) {
    await setLearningWorkflowTaskState(transaction, LEARNING_TASK_RENEWAL, record.id, 'open', renewalTaskInput);
  } else {
    await setLearningWorkflowTaskState(transaction, LEARNING_TASK_RENEWAL, record.id, 'cancel');
  }
}

async function getLearningItemsForSource(
  transaction: Prisma.TransactionClient,
  input: {
    assignmentType: string;
    contentId?: string | null;
    pathId?: string | null;
  },
) {
  if (input.assignmentType === LEARNING_ASSIGNMENT_TYPE_CONTENT && input.contentId) {
    const content = await transaction.learningContent.findFirst({
      where: {
        id: input.contentId,
        contentStatus: 'Active',
      },
      select: {
        id: true,
        title: true,
        certificateEligible: true,
      },
    });

    return content ? {
      pathId: null,
      items: [content],
    } : { pathId: null, items: [] };
  }

  if (!input.pathId) {
    return { pathId: null, items: [] };
  }

  const path = await transaction.learningPath.findFirst({
    where: {
      id: input.pathId,
      status: 'Active',
    },
    select: {
      id: true,
      items: {
        orderBy: [{ sortOrder: 'asc' }],
        select: {
          content: {
            select: {
              id: true,
              title: true,
              certificateEligible: true,
              contentStatus: true,
            },
          },
        },
      },
    },
  });

  if (!path) {
    return { pathId: null, items: [] };
  }

  return {
    pathId: path.id,
    items: path.items
      .map((item) => item.content)
      .filter((content) => content.contentStatus === 'Active')
      .map((content) => ({
        id: content.id,
        title: content.title,
        certificateEligible: content.certificateEligible,
      })),
  };
}

async function resolveAudienceEmployees(
  transaction: Prisma.TransactionClient,
  input: {
    employeeId?: string | null;
    orgUnitId?: string | null;
    positionId?: string | null;
    classificationId?: string | null;
    managerEmployeeId?: string | null;
  },
) {
  return transaction.employee.findMany({
    where: {
      status: { not: TERMINATED_EMPLOYEE_STATUS },
      ...(input.employeeId ? { id: input.employeeId } : {}),
      ...(input.managerEmployeeId ? { managerId: input.managerEmployeeId } : {}),
      ...(input.positionId ? { positionId: input.positionId } : {}),
      ...(input.orgUnitId ? {
        position: {
          is: {
            orgUnitId: input.orgUnitId,
          },
        },
      } : {}),
      ...(input.classificationId ? {
        position: {
          is: {
            classificationId: input.classificationId,
          },
        },
      } : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      managerId: true,
    },
  });
}

function getTargetDueDate(baseDate: Date, dueDate: Date | null | undefined, defaultDueDays: number | null | undefined) {
  if (dueDate) {
    return dueDate;
  }

  if (defaultDueDays === undefined || defaultDueDays === null) {
    return null;
  }

  return addUtcDays(baseDate, defaultDueDays);
}

export async function materializeLearningRecordsForSource(
  transaction: Prisma.TransactionClient,
  input: {
    assignmentId?: string | null;
    assignmentRuleId?: string | null;
    assignmentType: string;
    contentId?: string | null;
    pathId?: string | null;
    employeeId?: string | null;
    orgUnitId?: string | null;
    positionId?: string | null;
    classificationId?: string | null;
    managerEmployeeId?: string | null;
    requirementType: string;
    mandatory: boolean;
    dueDate?: Date | null;
    defaultDueDays?: number | null;
    renewalDays?: number | null;
    sourceType: string;
  },
) {
  const audienceEmployees = await resolveAudienceEmployees(transaction, input);
  const learningItems = await getLearningItemsForSource(transaction, input);
  const now = new Date();
  let createdCount = 0;
  let updatedCount = 0;

  for (const employee of audienceEmployees) {
    for (const item of learningItems.items) {
      const nextDueDate = getTargetDueDate(now, input.dueDate, input.defaultDueDays);
      const existingRecord = await transaction.learningRecord.findFirst({
        where: {
          employeeId: employee.id,
          contentId: item.id,
          assignmentId: input.assignmentId ?? null,
          assignmentRuleId: input.assignmentRuleId ?? null,
        },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          status: true,
          progressPercent: true,
          completedAt: true,
          certificateExpiresAt: true,
        },
      });

      const nextRenewalDueDate = existingRecord?.certificateExpiresAt
        ? addUtcDays(existingRecord.certificateExpiresAt, -30)
        : (existingRecord?.completedAt ? calculateRenewalDueDate(existingRecord.completedAt, input.renewalDays) : null);
      const nextStatus = existingRecord?.status === LEARNING_RECORD_STATUS_COMPLETED || existingRecord?.status === LEARNING_RECORD_STATUS_EXPIRED
        ? existingRecord.status
        : ((existingRecord?.progressPercent ?? 0) > 0 ? LEARNING_RECORD_STATUS_IN_PROGRESS : LEARNING_RECORD_STATUS_ASSIGNED);

      const record = existingRecord
        ? await transaction.learningRecord.update({
          where: { id: existingRecord.id },
          data: {
            assignmentId: input.assignmentId ?? null,
            assignmentRuleId: input.assignmentRuleId ?? null,
            pathId: learningItems.pathId,
            status: nextStatus,
            requirementType: input.requirementType,
            mandatory: input.mandatory,
            dueDate: nextDueDate,
            renewalDays: input.renewalDays ?? null,
            renewalDueDate: nextRenewalDueDate,
            sourceType: input.sourceType,
          },
          select: {
            id: true,
            status: true,
            requirementType: true,
            mandatory: true,
            dueDate: true,
            renewalDueDate: true,
            employeeId: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
                managerId: true,
              },
            },
            content: {
              select: {
                title: true,
                certificateEligible: true,
              },
            },
          },
        })
        : await transaction.learningRecord.create({
          data: {
            employeeId: employee.id,
            contentId: item.id,
            assignmentId: input.assignmentId ?? null,
            assignmentRuleId: input.assignmentRuleId ?? null,
            pathId: learningItems.pathId,
            status: LEARNING_RECORD_STATUS_ASSIGNED,
            requirementType: input.requirementType,
            mandatory: input.mandatory,
            dueDate: nextDueDate,
            renewalDays: input.renewalDays ?? null,
            renewalDueDate: null,
            sourceType: input.sourceType,
          },
          select: {
            id: true,
            status: true,
            requirementType: true,
            mandatory: true,
            dueDate: true,
            renewalDueDate: true,
            employeeId: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
                managerId: true,
              },
            },
            content: {
              select: {
                title: true,
                certificateEligible: true,
              },
            },
          },
        });

      await syncLearningWorkflowTasks(transaction, record);
      if (existingRecord) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }
  }

  return {
    matchedEmployees: audienceEmployees.length,
    materializedContent: learningItems.items.length,
    createdCount,
    updatedCount,
  };
}

export async function applyActiveLearningRulesForEmployee(
  transaction: Prisma.TransactionClient,
  employeeId: string,
) {
  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      status: true,
      managerId: true,
      positionId: true,
      position: {
        select: {
          orgUnitId: true,
          classificationId: true,
        },
      },
    },
  });

  if (!employee || employee.status === TERMINATED_EMPLOYEE_STATUS) {
    return;
  }

  const orClauses: Prisma.LearningAssignmentRuleWhereInput[] = [];

  if (employee.position?.orgUnitId) {
    orClauses.push({ orgUnitId: employee.position.orgUnitId });
  }

  if (employee.positionId) {
    orClauses.push({ positionId: employee.positionId });
  }

  if (employee.position?.classificationId) {
    orClauses.push({ classificationId: employee.position.classificationId });
  }

  if (employee.managerId) {
    orClauses.push({ managerEmployeeId: employee.managerId });
  }

  if (orClauses.length === 0) {
    return;
  }

  const rules = await transaction.learningAssignmentRule.findMany({
    where: {
      isActive: true,
      OR: orClauses,
    },
    select: {
      id: true,
      assignmentType: true,
      contentId: true,
      pathId: true,
      requirementType: true,
      mandatory: true,
      renewalDays: true,
      defaultDueDays: true,
    },
  });

  for (const rule of rules) {
    await materializeLearningRecordsForSource(transaction, {
      assignmentRuleId: rule.id,
      assignmentType: rule.assignmentType,
      contentId: rule.contentId,
      pathId: rule.pathId,
      employeeId: employee.id,
      requirementType: rule.requirementType,
      mandatory: rule.mandatory,
      defaultDueDays: rule.defaultDueDays,
      renewalDays: rule.renewalDays,
      sourceType: LEARNING_SOURCE_RULE,
    });
  }
}

export async function cancelActiveLearningForEmployee(
  transaction: Prisma.TransactionClient,
  employeeId: string,
) {
  const records = await transaction.learningRecord.findMany({
    where: {
      employeeId,
      status: {
        in: [LEARNING_RECORD_STATUS_ASSIGNED, LEARNING_RECORD_STATUS_IN_PROGRESS],
      },
    },
    select: { id: true },
  });

  await transaction.learningRecord.updateMany({
    where: {
      employeeId,
      status: {
        in: [LEARNING_RECORD_STATUS_ASSIGNED, LEARNING_RECORD_STATUS_IN_PROGRESS],
      },
    },
    data: {
      status: LEARNING_RECORD_STATUS_CANCELLED,
    },
  });

  for (const record of records) {
    await cancelWorkflowTasksForEntity(transaction, 'LearningRecord', record.id, 'Employee is no longer active.');
  }
}
