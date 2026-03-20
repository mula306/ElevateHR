import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import {
  CHECKLIST_ITEM_STATUS_COMPLETED,
  CHECKLIST_ITEM_STATUS_OPEN,
  CHECKLIST_STATUS_COMPLETED,
  CHECKLIST_STATUS_IN_PROGRESS,
  createWorkflowTask,
  ensureLifecycleChecklist,
  updateChecklistItemStatus as updateChecklistItemStatusRecord,
} from '../../shared/lib/hr-ops';
import { createHttpError, toIsoString } from '../../shared/lib/service-utils';
import {
  CreateEmployeeChecklistInput,
  ListEmployeeChecklistsQuery,
  UpdateChecklistItemInput,
} from './employee-checklists.schemas';

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

function serializeChecklistTemplate(template: any) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    lifecycleType: template.lifecycleType,
    description: template.description ?? null,
    isActive: template.isActive,
    items: (template.items ?? []).map((item: any) => ({
      id: item.id,
      title: item.title,
      ownerLabel: item.ownerLabel,
      dueDaysOffset: item.dueDaysOffset,
      sortOrder: item.sortOrder,
      isRequired: item.isRequired,
    })),
  };
}

function serializeEmployeeChecklist(checklist: any) {
  const items = (checklist.items ?? []).map((item: any) => ({
    id: item.id,
    title: item.title,
    ownerLabel: item.ownerLabel,
    dueDate: toIsoString(item.dueDate),
    status: item.status,
    isRequired: item.isRequired,
    sortOrder: item.sortOrder,
    completedAt: toIsoString(item.completedAt),
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  }));

  return {
    id: checklist.id,
    title: checklist.title,
    lifecycleType: checklist.lifecycleType,
    status: checklist.status,
    dueDate: toIsoString(checklist.dueDate),
    startedAt: toIsoString(checklist.startedAt),
    completedAt: toIsoString(checklist.completedAt),
    createdAt: toIsoString(checklist.createdAt),
    updatedAt: toIsoString(checklist.updatedAt),
    employee: checklist.employee ? {
      id: checklist.employee.id,
      employeeNumber: checklist.employee.employeeNumber,
      firstName: checklist.employee.firstName,
      lastName: checklist.employee.lastName,
      fullName: `${checklist.employee.firstName} ${checklist.employee.lastName}`,
      jobTitle: checklist.employee.jobTitle,
      department: checklist.employee.department,
      status: checklist.employee.status,
    } : null,
    template: checklist.template ? {
      id: checklist.template.id,
      code: checklist.template.code,
      name: checklist.template.name,
      lifecycleType: checklist.template.lifecycleType,
    } : null,
    items,
    summary: {
      totalItems: items.length,
      completedItems: items.filter((item: any) => item.status === CHECKLIST_ITEM_STATUS_COMPLETED).length,
      openItems: items.filter((item: any) => item.status === CHECKLIST_ITEM_STATUS_OPEN).length,
    },
  };
}

async function getEmployeeChecklistById(checklistId: string) {
  const checklist = await prisma.employeeChecklist.findUnique({
    where: { id: checklistId },
    select: {
      id: true,
      title: true,
      lifecycleType: true,
      status: true,
      dueDate: true,
      startedAt: true,
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
      template: {
        select: {
          id: true,
          code: true,
          name: true,
          lifecycleType: true,
        },
      },
      items: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          ownerLabel: true,
          dueDate: true,
          status: true,
          isRequired: true,
          sortOrder: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!checklist) {
    throw createHttpError(404, 'Checklist not found.');
  }

  return checklist;
}

async function createChecklistFromTemplate(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  templateId: string,
) {
  const [employee, template] = await Promise.all([
    transaction.employee.findUnique({
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
    }),
    transaction.checklistTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        },
      },
    }),
  ]);

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  if (!template || !template.isActive) {
    throw createHttpError(404, 'Checklist template not found.');
  }

  const existingChecklist = await transaction.employeeChecklist.findFirst({
    where: {
      employeeId,
      templateId,
      status: CHECKLIST_STATUS_IN_PROGRESS,
    },
  });

  if (existingChecklist) {
    return existingChecklist;
  }

  const baseDate = template.lifecycleType === 'Offboarding'
    ? (employee.terminationDate ?? new Date())
    : employee.hireDate;
  const finalOffset = template.items.reduce((highest, item) => Math.max(highest, item.dueDaysOffset), 0);
  const checklist = await transaction.employeeChecklist.create({
    data: {
      employeeId,
      templateId: template.id,
      title: template.name,
      lifecycleType: template.lifecycleType,
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
      description: `${template.lifecycleType} checklist item`,
      employeeId,
      ownerEmployeeId: item.ownerLabel === 'Manager' ? employee.managerId : null,
      ownerLabel: item.ownerLabel,
      relatedEntityType: 'ChecklistItem',
      relatedEntityId: checklistItem.id,
      dueDate: checklistItem.dueDate,
      priority: template.lifecycleType === 'Offboarding' ? 'High' : 'Normal',
    });
  }

  return checklist;
}

export async function listChecklistTemplates() {
  const templates = await prisma.checklistTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ lifecycleType: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      },
    },
  });

  return templates.map(serializeChecklistTemplate);
}

export async function listEmployeeChecklists(query: ListEmployeeChecklistsQuery) {
  const where: Prisma.EmployeeChecklistWhereInput = {};

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.lifecycleType) {
    where.lifecycleType = query.lifecycleType;
  }

  const checklists = await prisma.employeeChecklist.findMany({
    where,
    orderBy: [
      { status: 'asc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      title: true,
      lifecycleType: true,
      status: true,
      dueDate: true,
      startedAt: true,
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
      template: {
        select: {
          id: true,
          code: true,
          name: true,
          lifecycleType: true,
        },
      },
      items: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          ownerLabel: true,
          dueDate: true,
          status: true,
          isRequired: true,
          sortOrder: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return checklists.map(serializeEmployeeChecklist);
}

export async function createEmployeeChecklist(data: CreateEmployeeChecklistInput) {
  const checklist = await prisma.$transaction(async (transaction) => {
    if (data.templateId) {
      return createChecklistFromTemplate(transaction, data.employeeId, data.templateId);
    }

    if (!data.lifecycleType) {
      throw createHttpError(409, 'Choose a lifecycle type or template before creating a checklist.');
    }

    return ensureLifecycleChecklist(transaction, data.employeeId, data.lifecycleType);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployeeChecklist(await getEmployeeChecklistById(checklist.id));
}

export async function updateChecklistItem(itemId: string, data: UpdateChecklistItemInput) {
  await prisma.$transaction(async (transaction) => {
    await updateChecklistItemStatusRecord(transaction, itemId, data.status);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const checklistItem = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { checklistId: true },
  });

  if (!checklistItem) {
    throw createHttpError(404, 'Checklist item not found.');
  }

  return serializeEmployeeChecklist(await getEmployeeChecklistById(checklistItem.checklistId));
}
