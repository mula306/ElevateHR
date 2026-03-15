import { NextFunction, Request, Response, Router } from 'express';
import { Prisma } from '../generated/prisma';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/rbac';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from '../schemas/employee';
import { logger } from '../utils/logger';

const EMPLOYEE_NUMBER_SEQUENCE_KEY = 'employee_number';
const router = Router();

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

// ──────────────────────────────────────────────────
// GET /api/employees — List employees (all authenticated)
// ──────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEmployeesQuerySchema.parse(req.query);
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

    res.json({
      success: true,
      data: employees.map(serializeEmployee),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────
// GET /api/employees/:id — Get single employee
// ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
        },
        reports: {
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
        },
      },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        error: { code: 404, message: 'Employee not found' },
      });
      return;
    }

    res.json({ success: true, data: serializeEmployee(employee) });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────
// POST /api/employees — Create employee (Admin, HR.Manager)
// ──────────────────────────────────────────────────
router.post(
  '/',
  requireRole('Admin', 'HR.Manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createEmployeeSchema.parse(req.body);
      const employee = await prisma.$transaction(async (transaction) => {
        const employeeNumber = await generateEmployeeNumber(transaction);

        return transaction.employee.create({
          data: {
            ...data,
            employeeNumber,
            hireDate: new Date(data.hireDate),
            dateOfBirth: toDateValue(data.dateOfBirth) ?? null,
            salary: new Prisma.Decimal(data.salary),
            createdBy: req.user?.oid ?? null,
            updatedBy: req.user?.oid ?? null,
          } satisfies Prisma.EmployeeUncheckedCreateInput,
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      logger.info({ employeeId: employee.id, createdBy: req.user?.oid }, 'Employee created');

      res.status(201).json({ success: true, data: serializeEmployee(employee) });
    } catch (error) {
      next(error);
    }
  }
);

// ──────────────────────────────────────────────────
// PUT /api/employees/:id — Update employee (Admin, HR.Manager)
// ──────────────────────────────────────────────────
router.put(
  '/:id',
  requireRole('Admin', 'HR.Manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateEmployeeSchema.parse(req.body);
      const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 404, message: 'Employee not found' },
        });
        return;
      }

      const updateData = {
        ...data,
        hireDate: toDateValue(data.hireDate),
        dateOfBirth: toDateValue(data.dateOfBirth),
        salary: data.salary === undefined ? undefined : new Prisma.Decimal(data.salary),
        updatedBy: req.user?.oid ?? null,
      } satisfies Prisma.EmployeeUncheckedUpdateInput;

      const employee = await prisma.employee.update({
        where: { id: req.params.id },
        data: updateData,
      });

      logger.info({ employeeId: employee.id, updatedBy: req.user?.oid }, 'Employee updated');

      res.json({ success: true, data: serializeEmployee(employee) });
    } catch (error) {
      next(error);
    }
  }
);

// ──────────────────────────────────────────────────
// DELETE /api/employees/:id — Soft delete (Admin only)
// ──────────────────────────────────────────────────
router.delete(
  '/:id',
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 404, message: 'Employee not found' },
        });
        return;
      }

      await prisma.employee.update({
        where: { id: req.params.id },
        data: {
          status: 'Terminated',
          terminationDate: new Date(),
          updatedBy: req.user?.oid ?? null,
        },
      });

      logger.info({ employeeId: req.params.id, deletedBy: req.user?.oid }, 'Employee terminated');

      res.json({ success: true, message: 'Employee record terminated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
