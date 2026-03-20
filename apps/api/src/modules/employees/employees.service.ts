import { Prisma } from '../../generated/prisma';
import {
  ACK_STATUS_PENDING,
  DOCUMENT_STATUS_EXPIRED,
  DOCUMENT_STATUS_PENDING_ACK,
  ensureLifecycleChecklist,
  TERMINATED_EMPLOYEE_STATUS,
} from '../../shared/lib/hr-ops';
import { applyActiveLearningRulesForEmployee, cancelActiveLearningForEmployee } from '../../shared/lib/learning-ops';
import { prisma } from '../../shared/lib/prisma';
import { toDateValue } from '../../shared/lib/service-utils';
import {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from './employees.schemas';

const EMPLOYEE_NUMBER_SEQUENCE_KEY = 'employee_number';

function formatEmployeeNumber(value: number): string {
  return `EMP-${value.toString().padStart(4, '0')}`;
}

function parseEmployeeNumber(employeeNumber: string): number {
  const match = employeeNumber.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1000;
}

function serializeEmployee(employee: any) {
  const openChecklistItems = (employee.checklists ?? []).reduce((total: number, checklist: any) => {
    return total + (checklist.items?.length ?? 0);
  }, 0);
  const pendingAcknowledgments = (employee.documents ?? []).reduce((total: number, document: any) => {
    return total + (document.acknowledgments?.length ?? 0);
  }, 0);
  const expiringDocuments = (employee.documents ?? []).filter((document: any) => {
    return document.status === DOCUMENT_STATUS_EXPIRED || Boolean(document.expiryDate);
  }).length;
  const assignedLearning = (employee.learningRecords ?? []).filter((record: any) => !['Completed', 'Cancelled'].includes(record.status)).length;
  const overdueLearning = (employee.learningRecords ?? []).filter((record: any) => {
    return record.dueDate && record.dueDate < new Date() && !['Completed', 'Cancelled'].includes(record.status);
  }).length;
  const completedLearning = (employee.learningRecords ?? []).filter((record: any) => record.status === 'Completed').length;
  const learningCertificateAlerts = (employee.learningRecords ?? []).filter((record: any) => Boolean(record.certificateExpiresAt)).length;

  return {
    ...employee,
    salary: Number(employee.salary),
    terminationDate: employee.terminationDate ? employee.terminationDate.toISOString() : null,
    hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
    dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.toISOString() : null,
    createdAt: employee.createdAt ? employee.createdAt.toISOString() : null,
    updatedAt: employee.updatedAt ? employee.updatedAt.toISOString() : null,
    opsSummary: {
      openChecklistItems,
      pendingAcknowledgments,
      expiringDocuments,
      needsAttention: openChecklistItems > 0 || pendingAcknowledgments > 0 || expiringDocuments > 0,
    },
    learningSummary: {
      assigned: assignedLearning,
      overdue: overdueLearning,
      completed: completedLearning,
      certificateAlerts: learningCertificateAlerts,
    },
  };
}

async function generateEmployeeNumber(transaction: Prisma.TransactionClient): Promise<string> {
  const existingSequence = await transaction.sequence.findUnique({
    where: { key: EMPLOYEE_NUMBER_SEQUENCE_KEY },
  });

  if (existingSequence) {
    const nextValue = await transaction.sequence.update({
      where: { key: EMPLOYEE_NUMBER_SEQUENCE_KEY },
      data: { currentValue: { increment: 1 } },
    });

    return formatEmployeeNumber(nextValue.currentValue);
  }

  const employeeNumbers = await transaction.employee.findMany({
    select: { employeeNumber: true },
  });

  const highestEmployeeNumber = employeeNumbers.reduce((currentHighest, employee) => {
    return Math.max(currentHighest, parseEmployeeNumber(employee.employeeNumber));
  }, 1000);

  const nextValue = highestEmployeeNumber + 1;

  await transaction.sequence.create({
    data: {
      key: EMPLOYEE_NUMBER_SEQUENCE_KEY,
      currentValue: nextValue,
    },
  });

  return formatEmployeeNumber(nextValue);
}

function buildEmployeeWhere(query: ListEmployeesQuery) {
  const now = new Date();
  const nextThirtyDays = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 30,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
  const conditions: Prisma.EmployeeWhereInput[] = [];
  const search = query.search?.trim();

  if (search) {
    conditions.push({
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { employeeNumber: { contains: search } },
      ],
    });
  }

  if (query.status) {
    conditions.push({ status: query.status });
  }

  if (query.department) {
    conditions.push({ department: query.department });
  }

  if (query.attentionOnly) {
    conditions.push({
      OR: [
        {
          checklists: {
            some: {
              status: { not: 'Completed' },
              items: {
                some: { status: { not: 'Completed' } },
              },
            },
          },
        },
        {
          documents: {
            some: {
              OR: [
                { status: DOCUMENT_STATUS_PENDING_ACK },
                { status: DOCUMENT_STATUS_EXPIRED },
                {
                  expiryDate: {
                    gte: now,
                    lte: nextThirtyDays,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  }

  if (conditions.length === 0) {
    return {};
  }

  return { AND: conditions };
}

export async function listEmployees(query: ListEmployeesQuery) {
  const now = new Date();
  const nextThirtyDays = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 30,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
  const where = buildEmployeeWhere(query);

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dateOfBirth: true,
        hireDate: true,
        terminationDate: true,
        jobTitle: true,
        department: true,
        managerId: true,
        positionId: true,
        salary: true,
        payFrequency: true,
        status: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        province: true,
        postalCode: true,
        country: true,
        emergencyName: true,
        emergencyPhone: true,
        emergencyRelation: true,
        createdAt: true,
        updatedAt: true,
        checklists: {
          where: { status: { not: 'Completed' } },
          select: {
            id: true,
            items: {
              where: { status: { not: 'Completed' } },
              select: { id: true },
            },
          },
        },
        documents: {
          where: {
            OR: [
              { status: DOCUMENT_STATUS_PENDING_ACK },
              { status: DOCUMENT_STATUS_EXPIRED },
              {
                expiryDate: {
                  gte: now,
                  lte: nextThirtyDays,
                },
              },
            ],
          },
          select: {
            id: true,
            status: true,
            expiryDate: true,
            acknowledgments: {
              where: { status: ACK_STATUS_PENDING },
              select: { id: true },
            },
          },
        },
        learningRecords: {
          where: {
            OR: [
              { status: { not: 'Cancelled' } },
              {
                certificateExpiresAt: {
                  gte: now,
                  lte: nextThirtyDays,
                },
              },
            ],
          },
          select: {
            id: true,
            status: true,
            dueDate: true,
            certificateExpiresAt: true,
          },
        },
      },
    }),
    prisma.employee.count({ where }),
  ]);

  return {
    data: employees.map(serializeEmployee),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getEmployeeById(employeeId: string) {
  const now = new Date();
  const nextThirtyDays = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 30,
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      hireDate: true,
      terminationDate: true,
      jobTitle: true,
      department: true,
      managerId: true,
      positionId: true,
      salary: true,
      payFrequency: true,
      status: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      province: true,
      postalCode: true,
      country: true,
      emergencyName: true,
      emergencyPhone: true,
      emergencyRelation: true,
      createdAt: true,
      updatedAt: true,
      manager: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      },
      position: {
        select: { id: true, positionCode: true, title: true },
      },
      reports: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      },
      checklists: {
        where: { status: { not: 'Completed' } },
        select: {
          id: true,
          items: {
            where: { status: { not: 'Completed' } },
            select: { id: true },
          },
        },
      },
      documents: {
        where: {
          OR: [
            { status: DOCUMENT_STATUS_PENDING_ACK },
            { status: DOCUMENT_STATUS_EXPIRED },
            {
              expiryDate: {
                gte: now,
                lte: nextThirtyDays,
              },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          expiryDate: true,
          acknowledgments: {
            where: { status: ACK_STATUS_PENDING },
            select: { id: true },
          },
          },
        },
      learningRecords: {
        where: {
          OR: [
            { status: { not: 'Cancelled' } },
            {
              certificateExpiresAt: {
                gte: now,
                lte: nextThirtyDays,
              },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          dueDate: true,
          certificateExpiresAt: true,
        },
      },
    },
  });

  return employee ? serializeEmployee(employee) : null;
}

export async function createEmployee(data: CreateEmployeeInput, userId?: string) {
  const employee = await prisma.$transaction(async (transaction) => {
    const employeeNumber = await generateEmployeeNumber(transaction);

    const createdEmployee = await transaction.employee.create({
      data: {
        ...data,
        employeeNumber,
        hireDate: new Date(data.hireDate),
        dateOfBirth: toDateValue(data.dateOfBirth) ?? null,
        salary: new Prisma.Decimal(data.salary),
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      } satisfies Prisma.EmployeeUncheckedCreateInput,
    });

    await ensureLifecycleChecklist(transaction, createdEmployee.id, 'Onboarding');
    await applyActiveLearningRulesForEmployee(transaction, createdEmployee.id);

    return createdEmployee;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployee(employee);
}

export async function updateEmployee(employeeId: string, data: UpdateEmployeeInput, userId?: string) {
  const existingEmployee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existingEmployee) {
    return null;
  }

  const employee = await prisma.$transaction(async (transaction) => {
    const updateData: Prisma.EmployeeUncheckedUpdateInput = {
      ...data,
      updatedBy: userId ?? null,
    };

    if (data.hireDate !== undefined) {
      updateData.hireDate = new Date(data.hireDate);
    }

    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    }

    if (data.salary !== undefined) {
      updateData.salary = new Prisma.Decimal(data.salary);
    }

    const updatedEmployee = await transaction.employee.update({
      where: { id: employeeId },
      data: updateData,
    });

    if (existingEmployee.status !== TERMINATED_EMPLOYEE_STATUS && updatedEmployee.status === TERMINATED_EMPLOYEE_STATUS) {
      await ensureLifecycleChecklist(transaction, employeeId, 'Offboarding');
      await cancelActiveLearningForEmployee(transaction, employeeId);
    }

    if (updatedEmployee.status !== TERMINATED_EMPLOYEE_STATUS) {
      await applyActiveLearningRulesForEmployee(transaction, employeeId);
    }

    return updatedEmployee;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployee(employee);
}

export async function terminateEmployee(employeeId: string, userId?: string) {
  const existingEmployee = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!existingEmployee) {
    return false;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.employee.update({
      where: { id: employeeId },
      data: {
        status: TERMINATED_EMPLOYEE_STATUS,
        terminationDate: new Date(),
        updatedBy: userId ?? null,
      },
    });

    await ensureLifecycleChecklist(transaction, employeeId, 'Offboarding');
    await cancelActiveLearningForEmployee(transaction, employeeId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return true;
}
