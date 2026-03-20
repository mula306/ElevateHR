import { Prisma } from '../../generated/prisma';
import { resolveWorkflowAssignment } from './accounts';
import { createHttpError, trimToNull } from './service-utils';

export const TERMINATED_EMPLOYEE_STATUS = 'Terminated';
export const LEAVE_REQUEST_PENDING_STATUS = 'Pending';
export const LEAVE_REQUEST_APPROVED_STATUS = 'Approved';
export const LEAVE_REQUEST_REJECTED_STATUS = 'Rejected';
export const WORKFLOW_STATUS_OPEN = 'Open';
export const WORKFLOW_STATUS_COMPLETED = 'Completed';
export const WORKFLOW_STATUS_CANCELLED = 'Cancelled';
export const CHECKLIST_STATUS_IN_PROGRESS = 'In Progress';
export const CHECKLIST_STATUS_COMPLETED = 'Completed';
export const CHECKLIST_ITEM_STATUS_OPEN = 'Open';
export const CHECKLIST_ITEM_STATUS_COMPLETED = 'Completed';
export const DOCUMENT_STATUS_CURRENT = 'Current';
export const DOCUMENT_STATUS_PENDING_ACK = 'Pending Acknowledgment';
export const DOCUMENT_STATUS_EXPIRED = 'Expired';
export const ACK_STATUS_PENDING = 'Pending';
export const ACK_STATUS_ACKNOWLEDGED = 'Acknowledged';

const FALLBACK_CHECKLISTS = {
  Onboarding: [
    { title: 'Provision system access', ownerLabel: 'IT', dueDaysOffset: 0 },
    { title: 'Complete payroll and policy setup', ownerLabel: 'HR Operations', dueDaysOffset: 1 },
    { title: 'Schedule manager introduction', ownerLabel: 'Manager', dueDaysOffset: 2 },
  ],
  Offboarding: [
    { title: 'Disable access and collect equipment', ownerLabel: 'IT', dueDaysOffset: 0 },
    { title: 'Complete final pay and benefits review', ownerLabel: 'HR Operations', dueDaysOffset: 1 },
    { title: 'Conduct exit handoff', ownerLabel: 'Manager', dueDaysOffset: 2 },
  ],
} as const;

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

export interface WorkflowTaskInput {
  taskType: string;
  title: string;
  description?: string | null;
  employeeId?: string | null;
  ownerEmployeeId?: string | null;
  assigneeAccountId?: string | null;
  assigneeQueueKey?: string | null;
  ownerLabel?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  dueDate?: Date | null;
  priority?: string | null;
  comments?: string | null;
}

export async function createWorkflowTask(
  transaction: Prisma.TransactionClient,
  input: WorkflowTaskInput,
) {
  const assignment = await resolveWorkflowAssignment(transaction, {
    assigneeAccountId: input.assigneeAccountId,
    assigneeQueueKey: input.assigneeQueueKey,
    ownerEmployeeId: input.ownerEmployeeId,
    ownerLabel: input.ownerLabel,
  });

  return transaction.workflowTask.create({
    data: {
      taskType: input.taskType,
      title: input.title,
      description: trimToNull(input.description),
      employeeId: input.employeeId ?? null,
      ownerEmployeeId: input.ownerEmployeeId ?? null,
      assigneeAccountId: assignment.assigneeAccountId,
      assigneeQueueKey: assignment.assigneeQueueKey,
      ownerLabel: trimToNull(input.ownerLabel),
      relatedEntityType: trimToNull(input.relatedEntityType),
      relatedEntityId: trimToNull(input.relatedEntityId),
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? 'Normal',
      comments: trimToNull(input.comments),
      status: WORKFLOW_STATUS_OPEN,
    },
  });
}

export async function completeWorkflowTasksForEntity(
  transaction: Prisma.TransactionClient,
  relatedEntityType: string,
  relatedEntityId: string,
  comments?: string | null,
) {
  await transaction.workflowTask.updateMany({
    where: {
      relatedEntityType,
      relatedEntityId,
      status: WORKFLOW_STATUS_OPEN,
    },
    data: {
      status: WORKFLOW_STATUS_COMPLETED,
      comments: trimToNull(comments),
      completedAt: new Date(),
    },
  });
}

export async function cancelWorkflowTasksForEntity(
  transaction: Prisma.TransactionClient,
  relatedEntityType: string,
  relatedEntityId: string,
  comments?: string | null,
) {
  await transaction.workflowTask.updateMany({
    where: {
      relatedEntityType,
      relatedEntityId,
      status: { in: [WORKFLOW_STATUS_OPEN, WORKFLOW_STATUS_COMPLETED] },
    },
    data: {
      status: WORKFLOW_STATUS_CANCELLED,
      comments: trimToNull(comments),
      completedAt: new Date(),
    },
  });
}

export async function createApprovalAction(
  transaction: Prisma.TransactionClient,
  taskId: string,
  action: string,
  actorEmployeeId?: string | null,
  comments?: string | null,
) {
  return transaction.approvalAction.create({
    data: {
      taskId,
      action,
      actorEmployeeId: actorEmployeeId ?? null,
      comments: trimToNull(comments),
    },
  });
}

async function getChecklistTemplateItems(
  transaction: Prisma.TransactionClient,
  lifecycleType: 'Onboarding' | 'Offboarding',
) {
  const template = await transaction.checklistTemplate.findFirst({
    where: {
      lifecycleType,
      isActive: true,
    },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      },
    },
  });

  if (!template || template.items.length === 0) {
    return {
      templateId: null,
      title: `${lifecycleType} checklist`,
      items: FALLBACK_CHECKLISTS[lifecycleType].map((item, index) => ({
        title: item.title,
        ownerLabel: item.ownerLabel,
        dueDaysOffset: item.dueDaysOffset,
        isRequired: true,
        sortOrder: index,
      })),
    };
  }

  return {
    templateId: template.id,
    title: template.name,
    items: template.items.map((item) => ({
      title: item.title,
      ownerLabel: item.ownerLabel,
      dueDaysOffset: item.dueDaysOffset,
      isRequired: item.isRequired,
      sortOrder: item.sortOrder,
    })),
  };
}

async function refreshChecklistStatus(
  transaction: Prisma.TransactionClient,
  checklistId: string,
) {
  const checklist = await transaction.employeeChecklist.findUnique({
    where: { id: checklistId },
    include: {
      items: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!checklist) {
    throw createHttpError(404, 'Checklist not found.');
  }

  const isCompleted = checklist.items.length > 0
    && checklist.items.every((item) => item.status === CHECKLIST_ITEM_STATUS_COMPLETED);

  await transaction.employeeChecklist.update({
    where: { id: checklistId },
    data: {
      status: isCompleted ? CHECKLIST_STATUS_COMPLETED : CHECKLIST_STATUS_IN_PROGRESS,
      completedAt: isCompleted ? new Date() : null,
    },
  });
}

export async function ensureLifecycleChecklist(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  lifecycleType: 'Onboarding' | 'Offboarding',
) {
  const existingChecklist = await transaction.employeeChecklist.findFirst({
    where: {
      employeeId,
      lifecycleType,
      status: CHECKLIST_STATUS_IN_PROGRESS,
    },
  });

  if (existingChecklist) {
    return existingChecklist;
  }

  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      hireDate: true,
      terminationDate: true,
      managerId: true,
      status: true,
    },
  });

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  const baseDate = lifecycleType === 'Offboarding'
    ? (employee.terminationDate ?? new Date())
    : employee.hireDate;
  const template = await getChecklistTemplateItems(transaction, lifecycleType);
  const finalOffset = template.items.reduce((highest, item) => Math.max(highest, item.dueDaysOffset), 0);

  const checklist = await transaction.employeeChecklist.create({
    data: {
      employeeId,
      templateId: template.templateId,
      title: template.title,
      lifecycleType,
      status: CHECKLIST_STATUS_IN_PROGRESS,
      dueDate: addUtcDays(baseDate, finalOffset),
    },
  });

  for (const item of template.items) {
    const checklistItem = await transaction.checklistItem.create({
      data: {
        checklistId: checklist.id,
        title: item.title,
        ownerLabel: item.ownerLabel,
        dueDate: addUtcDays(baseDate, item.dueDaysOffset),
        status: CHECKLIST_ITEM_STATUS_OPEN,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
      },
    });

    await createWorkflowTask(transaction, {
      taskType: 'Checklist',
      title: `${employee.firstName} ${employee.lastName}: ${item.title}`,
      description: `${lifecycleType} checklist item`,
      employeeId: employee.id,
      ownerEmployeeId: item.ownerLabel === 'Manager' ? employee.managerId : null,
      ownerLabel: item.ownerLabel,
      relatedEntityType: 'ChecklistItem',
      relatedEntityId: checklistItem.id,
      dueDate: checklistItem.dueDate,
      priority: lifecycleType === 'Offboarding' ? 'High' : 'Normal',
    });
  }

  return checklist;
}

export async function updateChecklistItemStatus(
  transaction: Prisma.TransactionClient,
  checklistItemId: string,
  status: 'Open' | 'Completed',
) {
  const checklistItem = await transaction.checklistItem.findUnique({
    where: { id: checklistItemId },
    select: {
      id: true,
      checklistId: true,
    },
  });

  if (!checklistItem) {
    throw createHttpError(404, 'Checklist item not found.');
  }

  await transaction.checklistItem.update({
    where: { id: checklistItemId },
    data: {
      status,
      completedAt: status === CHECKLIST_ITEM_STATUS_COMPLETED ? new Date() : null,
    },
  });

  if (status === CHECKLIST_ITEM_STATUS_COMPLETED) {
    await completeWorkflowTasksForEntity(transaction, 'ChecklistItem', checklistItemId);
  } else {
    await transaction.workflowTask.updateMany({
      where: {
        relatedEntityType: 'ChecklistItem',
        relatedEntityId: checklistItemId,
      },
      data: {
        status: WORKFLOW_STATUS_OPEN,
        completedAt: null,
      },
    });
  }

  await refreshChecklistStatus(transaction, checklistItem.checklistId);
}
