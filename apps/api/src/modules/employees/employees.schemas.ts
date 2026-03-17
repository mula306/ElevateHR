import { z } from 'zod';

const employeeStatusSchema = z.enum(['Active', 'On Leave', 'Terminated', 'Probation']);
const payFrequencySchema = z.enum(['Biweekly', 'Monthly', 'Weekly']);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');
const isoDateSchema = z.union([z.string().datetime(), dateOnlySchema]);

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').max(255),
  phone: z.string().max(20).optional().nullable(),
  dateOfBirth: isoDateSchema.optional().nullable(),
  hireDate: isoDateSchema,
  jobTitle: z.string().min(1, 'Job title is required').max(150),
  department: z.string().min(1, 'Department is required').max(100),
  positionId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
  salary: z.number().positive('Salary must be positive'),
  payFrequency: payFrequencySchema.default('Biweekly'),
  status: employeeStatusSchema.default('Active'),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).default('Canada'),
  emergencyName: z.string().max(200).optional().nullable(),
  emergencyPhone: z.string().max(20).optional().nullable(),
  emergencyRelation: z.string().max(100).optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: employeeStatusSchema.optional(),
  department: z.string().optional(),
  sortBy: z.enum([
    'employeeNumber',
    'firstName',
    'lastName',
    'email',
    'hireDate',
    'department',
    'status',
    'createdAt',
  ]).default('lastName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
