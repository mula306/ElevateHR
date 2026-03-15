import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
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

function toDateValue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return new Date(value);
}

function serializeEmployee<T extends { salary: unknown }>(employee: T): Omit<T, 'salary'> & { salary: number } {
  return {
    ...employee,
    salary: Number(employee.salary),
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

export async function listEmployees(query: ListEmployeesQuery) {
  const search = query.search?.trim();
  const where: Prisma.EmployeeWhereInput = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { email: { contains: search } },
      { employeeNumber: { contains: search } },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.department) {
    where.department = query.department;
  }

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
        hireDate: true,
        jobTitle: true,
        department: true,
        salary: true,
        status: true,
        createdAt: true,
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
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      manager: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      },
      reports: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      },
    },
  });

  return employee ? serializeEmployee(employee) : null;
}

export async function createEmployee(data: CreateEmployeeInput, userId?: string) {
  const employee = await prisma.$transaction(async (transaction) => {
    const employeeNumber = await generateEmployeeNumber(transaction);

    return transaction.employee.create({
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
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeEmployee(employee);
}

export async function updateEmployee(employeeId: string, data: UpdateEmployeeInput, userId?: string) {
  const existingEmployee = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!existingEmployee) {
    return null;
  }

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

  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: updateData,
  });

  return serializeEmployee(employee);
}

export async function terminateEmployee(employeeId: string, userId?: string) {
  const existingEmployee = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!existingEmployee) {
    return false;
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      status: 'Terminated',
      terminationDate: new Date(),
      updatedBy: userId ?? null,
    },
  });

  return true;
}
