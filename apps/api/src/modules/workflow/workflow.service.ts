import { prisma } from '../../shared/lib/prisma';
import {
  createWorkflowTask as createWorkflowTaskRecord,
  WORKFLOW_STATUS_COMPLETED,
} from '../../shared/lib/hr-ops';
import { createHttpError, toDateValue, toIsoString, trimToNull } from '../../shared/lib/service-utils';
import {
  CreateWorkflowTaskInput,
  ListWorkflowTasksQuery,
  UpdateWorkflowTaskInput,
} from './workflow.schemas';

function serializeWorkflowTask(task: any) {
  return {
    id: task.id,
    taskType: task.taskType,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: toIsoString(task.dueDate),
    ownerLabel: task.ownerLabel ?? null,
    assigneeQueueKey: task.assigneeQueueKey ?? null,
    relatedEntityType: task.relatedEntityType ?? null,
    relatedEntityId: task.relatedEntityId ?? null,
    comments: task.comments ?? null,
    completedAt: toIsoString(task.completedAt),
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
    employee: task.employee ? {
      id: task.employee.id,
      employeeNumber: task.employee.employeeNumber,
      firstName: task.employee.firstName,
      lastName: task.employee.lastName,
      fullName: `${task.employee.firstName} ${task.employee.lastName}`,
      jobTitle: task.employee.jobTitle,
      department: task.employee.department,
      status: task.employee.status,
    } : null,
    ownerEmployee: task.ownerEmployee ? {
      id: task.ownerEmployee.id,
      employeeNumber: task.ownerEmployee.employeeNumber,
      firstName: task.ownerEmployee.firstName,
      lastName: task.ownerEmployee.lastName,
      fullName: `${task.ownerEmployee.firstName} ${task.ownerEmployee.lastName}`,
      jobTitle: task.ownerEmployee.jobTitle,
    } : null,
    assigneeAccount: task.assigneeAccount ? {
      id: task.assigneeAccount.id,
      email: task.assigneeAccount.email,
      displayName: task.assigneeAccount.displayName,
      employeeId: task.assigneeAccount.employeeId ?? null,
    } : null,
    approvalActions: (task.approvalActions ?? []).map((action: any) => ({
      id: action.id,
      action: action.action,
      comments: action.comments ?? null,
      createdAt: toIsoString(action.createdAt),
      actorEmployee: action.actorEmployee ? {
        id: action.actorEmployee.id,
        firstName: action.actorEmployee.firstName,
        lastName: action.actorEmployee.lastName,
        fullName: `${action.actorEmployee.firstName} ${action.actorEmployee.lastName}`,
      } : null,
    })),
  };
}

async function getTaskById(taskId: string) {
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskType: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      ownerLabel: true,
      assigneeQueueKey: true,
      relatedEntityType: true,
      relatedEntityId: true,
      comments: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: true,
          status: true,
        },
      },
      ownerEmployee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
        },
      },
      assigneeAccount: {
        select: {
          id: true,
          email: true,
          displayName: true,
          employeeId: true,
        },
      },
      approvalActions: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          action: true,
          comments: true,
          createdAt: true,
          actorEmployee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw createHttpError(404, 'Workflow task not found.');
  }

  return task;
}

export async function listWorkflowTasks(query: ListWorkflowTasksQuery) {
  const search = query.search?.trim();
  const now = new Date();
  const where: any = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.taskType) {
    where.taskType = query.taskType;
  }

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.ownerEmployeeId) {
    where.ownerEmployeeId = query.ownerEmployeeId;
  }

  if (query.assigneeAccountId) {
    where.assigneeAccountId = query.assigneeAccountId;
  }

  if (query.assigneeQueueKey) {
    where.assigneeQueueKey = query.assigneeQueueKey;
  }

  if (query.overdueOnly) {
    where.dueDate = { lt: now };
    where.status = 'Open';
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { employee: { is: { firstName: { contains: search } } } },
      { employee: { is: { lastName: { contains: search } } } },
    ];
  }

  const tasks = await prisma.workflowTask.findMany({
    where,
    orderBy: [
      { status: 'asc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      taskType: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      ownerLabel: true,
      assigneeQueueKey: true,
      relatedEntityType: true,
      relatedEntityId: true,
      comments: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: true,
          status: true,
        },
      },
      ownerEmployee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
        },
      },
      assigneeAccount: {
        select: {
          id: true,
          email: true,
          displayName: true,
          employeeId: true,
        },
      },
      approvalActions: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          action: true,
          comments: true,
          createdAt: true,
          actorEmployee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  return tasks.map(serializeWorkflowTask);
}

export async function createWorkflowTask(data: CreateWorkflowTaskInput) {
  const task = await prisma.$transaction((transaction) => {
    return createWorkflowTaskRecord(transaction, {
      taskType: data.taskType,
      title: data.title,
      description: data.description,
      employeeId: data.employeeId,
      ownerEmployeeId: data.ownerEmployeeId,
      assigneeAccountId: data.assigneeAccountId,
      assigneeQueueKey: data.assigneeQueueKey,
      ownerLabel: data.ownerLabel,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      dueDate: toDateValue(data.dueDate) ?? null,
      priority: data.priority,
      comments: data.comments,
    });
  });

  return serializeWorkflowTask(await getTaskById(task.id));
}

export async function updateWorkflowTask(taskId: string, data: UpdateWorkflowTaskInput) {
  const existingTask = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    select: { id: true },
  });

  if (!existingTask) {
    throw createHttpError(404, 'Workflow task not found.');
  }

  await prisma.workflowTask.update({
    where: { id: taskId },
    data: {
      status: data.status,
      dueDate: data.dueDate === undefined ? undefined : toDateValue(data.dueDate),
      ownerEmployeeId: data.ownerEmployeeId === undefined ? undefined : data.ownerEmployeeId,
      assigneeAccountId: data.assigneeAccountId === undefined ? undefined : data.assigneeAccountId,
      assigneeQueueKey: data.assigneeQueueKey === undefined ? undefined : trimToNull(data.assigneeQueueKey),
      ownerLabel: data.ownerLabel === undefined ? undefined : trimToNull(data.ownerLabel),
      comments: data.comments === undefined ? undefined : trimToNull(data.comments),
      completedAt: data.status === undefined
        ? undefined
        : (data.status === WORKFLOW_STATUS_COMPLETED ? new Date() : null),
    },
  });

  return serializeWorkflowTask(await getTaskById(taskId));
}
