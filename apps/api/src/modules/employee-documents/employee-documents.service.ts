import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import {
  ACK_STATUS_ACKNOWLEDGED,
  ACK_STATUS_PENDING,
  createWorkflowTask,
  DOCUMENT_STATUS_CURRENT,
  DOCUMENT_STATUS_EXPIRED,
  DOCUMENT_STATUS_PENDING_ACK,
} from '../../shared/lib/hr-ops';
import { createHttpError, toDateValue, toIsoString, trimToNull } from '../../shared/lib/service-utils';
import {
  CreateEmployeeDocumentInput,
  ListEmployeeDocumentsQuery,
  UpdateEmployeeDocumentInput,
} from './employee-documents.schemas';

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

function deriveDocumentStatus(requiresAcknowledgement: boolean, isAcknowledged: boolean, expiryDate: Date | null) {
  if (expiryDate && expiryDate < new Date()) {
    return DOCUMENT_STATUS_EXPIRED;
  }

  if (requiresAcknowledgement && !isAcknowledged) {
    return DOCUMENT_STATUS_PENDING_ACK;
  }

  return DOCUMENT_STATUS_CURRENT;
}

function serializeDocumentCategory(category: any) {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description ?? null,
    isActive: category.isActive,
  };
}

function serializeDocumentTemplate(template: any) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    requiresAcknowledgement: template.requiresAcknowledgement,
    defaultExpiryDays: template.defaultExpiryDays ?? null,
    isActive: template.isActive,
    category: template.category ? serializeDocumentCategory(template.category) : null,
  };
}

function serializeEmployeeDocument(document: any) {
  const acknowledgments = (document.acknowledgments ?? []).map((ack: any) => ({
    id: ack.id,
    status: ack.status,
    dueDate: toIsoString(ack.dueDate),
    acknowledgedAt: toIsoString(ack.acknowledgedAt),
    createdAt: toIsoString(ack.createdAt),
    updatedAt: toIsoString(ack.updatedAt),
    employee: ack.employee ? {
      id: ack.employee.id,
      employeeNumber: ack.employee.employeeNumber,
      firstName: ack.employee.firstName,
      lastName: ack.employee.lastName,
      fullName: `${ack.employee.firstName} ${ack.employee.lastName}`,
      status: ack.employee.status,
    } : null,
  }));

  return {
    id: document.id,
    title: document.title,
    status: document.status,
    required: document.required,
    issueDate: toIsoString(document.issueDate),
    expiryDate: toIsoString(document.expiryDate),
    notes: document.notes ?? null,
    createdAt: toIsoString(document.createdAt),
    updatedAt: toIsoString(document.updatedAt),
    employee: document.employee ? {
      id: document.employee.id,
      employeeNumber: document.employee.employeeNumber,
      firstName: document.employee.firstName,
      lastName: document.employee.lastName,
      fullName: `${document.employee.firstName} ${document.employee.lastName}`,
      jobTitle: document.employee.jobTitle,
      department: document.employee.department,
      status: document.employee.status,
    } : null,
    category: document.category ? serializeDocumentCategory(document.category) : null,
    template: document.template ? serializeDocumentTemplate(document.template) : null,
    acknowledgments,
  };
}

async function getEmployeeDocumentById(documentId: string) {
  const document = await prisma.employeeDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      status: true,
      required: true,
      issueDate: true,
      expiryDate: true,
      notes: true,
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
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
        },
      },
      template: {
        select: {
          id: true,
          code: true,
          name: true,
          requiresAcknowledgement: true,
          defaultExpiryDays: true,
          isActive: true,
          category: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              isActive: true,
            },
          },
        },
      },
      acknowledgments: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          status: true,
          dueDate: true,
          acknowledgedAt: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!document) {
    throw createHttpError(404, 'Employee document not found.');
  }

  return document;
}

async function validateDocumentReferences(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  categoryId: string,
  templateId?: string | null,
) {
  const [employee, category, template] = await Promise.all([
    transaction.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    }),
    transaction.documentCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        isActive: true,
      },
    }),
    templateId ? transaction.documentTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        categoryId: true,
        name: true,
        requiresAcknowledgement: true,
        defaultExpiryDays: true,
        isActive: true,
      },
    }) : Promise.resolve(null),
  ]);

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  if (!category || !category.isActive) {
    throw createHttpError(404, 'Document category not found.');
  }

  if (templateId) {
    if (!template || !template.isActive) {
      throw createHttpError(404, 'Document template not found.');
    }

    if (template.categoryId !== category.id) {
      throw createHttpError(409, 'Selected template does not belong to the chosen category.');
    }
  }

  return { employee, category, template };
}

async function syncDocumentAcknowledgment(
  transaction: Prisma.TransactionClient,
  documentId: string,
  employeeId: string,
  title: string,
  requiresAcknowledgement: boolean,
  issueDate: Date | null,
) {
  if (!requiresAcknowledgement) {
    await transaction.documentAcknowledgment.deleteMany({
      where: { employeeDocumentId: documentId },
    });

    await transaction.workflowTask.updateMany({
      where: {
        relatedEntityType: 'DocumentAcknowledgment',
        relatedEntityId: documentId,
      },
      data: {
        status: 'Cancelled',
        completedAt: new Date(),
      },
    });
    return { status: DOCUMENT_STATUS_CURRENT, acknowledgmentStatus: ACK_STATUS_ACKNOWLEDGED };
  }

  const dueDate = addUtcDays(issueDate ?? new Date(), 7);
  const existingAck = await transaction.documentAcknowledgment.findFirst({
    where: {
      employeeDocumentId: documentId,
      employeeId,
    },
  });

  if (existingAck) {
    if (existingAck.status === ACK_STATUS_ACKNOWLEDGED) {
      return { status: DOCUMENT_STATUS_CURRENT, acknowledgmentStatus: ACK_STATUS_ACKNOWLEDGED };
    }

    await transaction.documentAcknowledgment.update({
      where: { id: existingAck.id },
      data: { dueDate },
    });

    return { status: DOCUMENT_STATUS_PENDING_ACK, acknowledgmentStatus: ACK_STATUS_PENDING };
  }

  await transaction.documentAcknowledgment.create({
    data: {
      employeeDocumentId: documentId,
      employeeId,
      status: ACK_STATUS_PENDING,
      dueDate,
    },
  });

  await createWorkflowTask(transaction, {
    taskType: 'DocumentAcknowledgment',
    title,
    description: 'Employee acknowledgment required',
    employeeId,
    ownerEmployeeId: employeeId,
    ownerLabel: 'Employee',
    relatedEntityType: 'DocumentAcknowledgment',
    relatedEntityId: documentId,
    dueDate,
    priority: 'Normal',
  });

  return { status: DOCUMENT_STATUS_PENDING_ACK, acknowledgmentStatus: ACK_STATUS_PENDING };
}

export async function listDocumentReferenceData() {
  const [categories, templates] = await Promise.all([
    prisma.documentCategory.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
      },
    }),
    prisma.documentTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        requiresAcknowledgement: true,
        defaultExpiryDays: true,
        isActive: true,
        category: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  return {
    categories: categories.map(serializeDocumentCategory),
    templates: templates.map(serializeDocumentTemplate),
  };
}

export async function listEmployeeDocuments(query: ListEmployeeDocumentsQuery) {
  const search = query.search?.trim();
  const where: Prisma.EmployeeDocumentWhereInput = {};

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.expiresWithinDays !== undefined) {
    const now = new Date();
    const expiryLimit = addUtcDays(now, query.expiresWithinDays);
    where.expiryDate = {
      gte: now,
      lte: expiryLimit,
    };
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { employee: { is: { firstName: { contains: search } } } },
      { employee: { is: { lastName: { contains: search } } } },
      { category: { is: { name: { contains: search } } } },
    ];
  }

  const documents = await prisma.employeeDocument.findMany({
    where,
    orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      status: true,
      required: true,
      issueDate: true,
      expiryDate: true,
      notes: true,
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
      category: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
        },
      },
      template: {
        select: {
          id: true,
          code: true,
          name: true,
          requiresAcknowledgement: true,
          defaultExpiryDays: true,
          isActive: true,
          category: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              isActive: true,
            },
          },
        },
      },
      acknowledgments: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          status: true,
          dueDate: true,
          acknowledgedAt: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return documents.map(serializeEmployeeDocument);
}

export async function createEmployeeDocument(data: CreateEmployeeDocumentInput) {
  const document = await prisma.$transaction(async (transaction) => {
    const { employee, category, template } = await validateDocumentReferences(
      transaction,
      data.employeeId,
      data.categoryId,
      data.templateId,
    );

    const issueDate = (toDateValue(data.issueDate) ?? new Date()) as Date;
    const expiryDate = data.expiryDate
      ? (toDateValue(data.expiryDate) as Date)
      : (template?.defaultExpiryDays ? addUtcDays(issueDate, template.defaultExpiryDays) : null);
    const requiresAcknowledgement = data.required || Boolean(template?.requiresAcknowledgement);
    const createdDocument = await transaction.employeeDocument.create({
      data: {
        employeeId: employee.id,
        categoryId: category.id,
        templateId: template?.id ?? null,
        title: data.title,
        status: DOCUMENT_STATUS_CURRENT,
        required: requiresAcknowledgement,
        issueDate,
        expiryDate,
        notes: trimToNull(data.notes),
      },
    });

    const syncResult = await syncDocumentAcknowledgment(
      transaction,
      createdDocument.id,
      employee.id,
      `${employee.firstName} ${employee.lastName}: ${data.title}`,
      requiresAcknowledgement,
      issueDate,
    );

    await transaction.employeeDocument.update({
      where: { id: createdDocument.id },
      data: {
        status: deriveDocumentStatus(
          requiresAcknowledgement,
          syncResult.acknowledgmentStatus === ACK_STATUS_ACKNOWLEDGED,
          expiryDate,
        ),
      },
    });

    return createdDocument.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployeeDocument(await getEmployeeDocumentById(document));
}

export async function updateEmployeeDocument(documentId: string, data: UpdateEmployeeDocumentInput) {
  const updatedDocumentId = await prisma.$transaction(async (transaction) => {
    const existingDocument = await transaction.employeeDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        employeeId: true,
        categoryId: true,
        templateId: true,
        title: true,
      },
    });

    if (!existingDocument) {
      throw createHttpError(404, 'Employee document not found.');
    }

    const employeeId = data.employeeId ?? existingDocument.employeeId;
    const categoryId = data.categoryId ?? existingDocument.categoryId;
    const templateId = data.templateId === undefined ? existingDocument.templateId : data.templateId;
    const { employee, category, template } = await validateDocumentReferences(transaction, employeeId, categoryId, templateId);
    const issueDate = data.issueDate === undefined
      ? null
      : (toDateValue(data.issueDate) as Date | null);
    const expiryDate = data.expiryDate === undefined
      ? null
      : (toDateValue(data.expiryDate) as Date | null);
    const resolvedIssueDate = issueDate ?? new Date();
    const resolvedExpiryDate = expiryDate ?? (template?.defaultExpiryDays ? addUtcDays(resolvedIssueDate, template.defaultExpiryDays) : null);
    const requiresAcknowledgement = data.required ?? Boolean(template?.requiresAcknowledgement);

    await transaction.employeeDocument.update({
      where: { id: documentId },
      data: {
        employeeId: employee.id,
        categoryId: category.id,
        templateId: template?.id ?? null,
        title: data.title ?? existingDocument.title,
        required: requiresAcknowledgement,
        issueDate: issueDate ?? undefined,
        expiryDate: resolvedExpiryDate,
        notes: data.notes === undefined ? undefined : trimToNull(data.notes),
      },
    });

    const syncResult = await syncDocumentAcknowledgment(
      transaction,
      documentId,
      employee.id,
      `${employee.firstName} ${employee.lastName}: ${data.title ?? existingDocument.title}`,
      requiresAcknowledgement,
      resolvedIssueDate,
    );

    await transaction.employeeDocument.update({
      where: { id: documentId },
      data: {
        status: deriveDocumentStatus(
          requiresAcknowledgement,
          syncResult.acknowledgmentStatus === ACK_STATUS_ACKNOWLEDGED,
          resolvedExpiryDate,
        ),
      },
    });

    return documentId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployeeDocument(await getEmployeeDocumentById(updatedDocumentId));
}

export async function acknowledgeEmployeeDocument(documentId: string) {
  const updatedDocumentId = await prisma.$transaction(async (transaction) => {
    const document = await transaction.employeeDocument.findUnique({
      where: { id: documentId },
      include: {
        acknowledgments: {
          where: { status: ACK_STATUS_PENDING },
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
        },
      },
    });

    if (!document) {
      throw createHttpError(404, 'Employee document not found.');
    }

    const pendingAck = document.acknowledgments[0];
    if (!pendingAck) {
      throw createHttpError(409, 'This document does not have a pending acknowledgment.');
    }

    await transaction.documentAcknowledgment.update({
      where: { id: pendingAck.id },
      data: {
        status: ACK_STATUS_ACKNOWLEDGED,
        acknowledgedAt: new Date(),
      },
    });

    await transaction.workflowTask.updateMany({
      where: {
        relatedEntityType: 'DocumentAcknowledgment',
        relatedEntityId: documentId,
      },
      data: {
        status: 'Completed',
        completedAt: new Date(),
      },
    });

    await transaction.employeeDocument.update({
      where: { id: documentId },
      data: {
        status: deriveDocumentStatus(true, true, document.expiryDate),
      },
    });

    return documentId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployeeDocument(await getEmployeeDocumentById(updatedDocumentId));
}
