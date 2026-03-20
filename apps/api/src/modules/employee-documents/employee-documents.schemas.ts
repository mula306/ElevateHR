import { z } from 'zod';

const documentStatusSchema = z.enum(['Current', 'Pending Acknowledgment', 'Expired']);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');
const isoDateSchema = z.union([z.string().datetime(), dateOnlySchema]);

const trimmedOptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().optional());

const uuidQuerySchema = z.preprocess((value) => {
  if (value === '' || value === null) {
    return undefined;
  }

  return value;
}, z.string().uuid().optional());

export const listEmployeeDocumentsQuerySchema = z.object({
  employeeId: uuidQuerySchema,
  status: documentStatusSchema.optional(),
  expiresWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  search: trimmedOptionalStringSchema,
});

export const createEmployeeDocumentSchema = z.object({
  employeeId: z.string().uuid(),
  categoryId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(150),
  required: z.coerce.boolean().default(false),
  issueDate: isoDateSchema.optional().nullable(),
  expiryDate: isoDateSchema.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateEmployeeDocumentSchema = createEmployeeDocumentSchema.partial();

export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
export type ListEmployeeDocumentsQuery = z.infer<typeof listEmployeeDocumentsQuerySchema>;
export type UpdateEmployeeDocumentInput = z.infer<typeof updateEmployeeDocumentSchema>;
