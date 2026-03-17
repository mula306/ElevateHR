import { z } from 'zod';

const recordStatusSchema = z.enum(['Active', 'Archived']);
const positionStatusSchema = z.enum(['Active', 'Vacant', 'On Hold']);

const trimmedOptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().optional());

const nullableUuidSchema = z.union([z.string().uuid(), z.null()]).optional();
const uuidQuerySchema = z.preprocess((value) => {
  if (value === '' || value === null) {
    return undefined;
  }

  return value;
}, z.string().uuid().optional());

export const archiveRecordSchema = z.object({
  archiveReason: z.string().max(500).optional().nullable(),
});

export const organizationListQuerySchema = z.object({
  search: trimmedOptionalStringSchema,
  includeArchived: z.coerce.boolean().default(false),
  recordStatus: recordStatusSchema.optional(),
});

export const listOrgUnitsQuerySchema = organizationListQuerySchema.extend({
  parentId: uuidQuerySchema,
});

export const createOrgUnitSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(50),
  name: z.string().trim().min(1, 'Name is required').max(150),
  type: z.string().trim().min(1, 'Type is required').max(50),
  parentId: nullableUuidSchema,
});

export const updateOrgUnitSchema = createOrgUnitSchema.omit({ code: true });

export const listPositionsQuerySchema = organizationListQuerySchema.extend({
  orgUnitId: uuidQuerySchema,
  classificationId: uuidQuerySchema,
  levelId: uuidQuerySchema,
  reportsToPositionId: uuidQuerySchema,
  positionStatus: positionStatusSchema.optional(),
});

export const createPositionSchema = z.object({
  positionCode: z.string().trim().min(1, 'Position code is required').max(50),
  title: z.string().trim().min(1, 'Title is required').max(150),
  orgUnitId: z.string().uuid(),
  classificationId: z.string().uuid(),
  levelId: z.string().uuid(),
  reportsToPositionId: nullableUuidSchema,
  headcount: z.coerce.number().int().min(1, 'Headcount must be at least 1'),
  positionStatus: positionStatusSchema.default('Active'),
  incumbentEmployeeIds: z.array(z.string().uuid()).default([]).refine((value) => {
    return new Set(value).size === value.length;
  }, 'Duplicate incumbents are not allowed'),
});

export const updatePositionSchema = createPositionSchema.omit({ positionCode: true });

export const createClassificationSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(50),
  title: z.string().trim().min(1, 'Title is required').max(150),
  occupationCode: z.string().trim().min(1, 'Occupation code is required').max(20),
  annualHours: z.coerce.number().int().positive('Annual hours must be greater than zero'),
  family: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const updateClassificationSchema = createClassificationSchema.omit({ code: true });

export const listLevelsQuerySchema = organizationListQuerySchema.extend({
  classificationId: uuidQuerySchema,
});

const positionRangeFieldsSchema = z.object({
  rangeMin: z.coerce.number().min(0, 'Range start must be zero or greater'),
  rangeMid: z.coerce.number().min(0, 'Range midpoint must be zero or greater'),
  rangeMax: z.coerce.number().min(0, 'Range top must be zero or greater'),
});

function withValidRangeOrder<TShape extends z.ZodRawShape>(schema: z.ZodObject<TShape>) {
  return schema.refine((value) => {
    const range = value as { rangeMin: number; rangeMid: number; rangeMax: number };
    return range.rangeMin <= range.rangeMid;
  }, {
    message: 'Range midpoint must be greater than or equal to the start of range.',
    path: ['rangeMid'],
  }).refine((value) => {
    const range = value as { rangeMin: number; rangeMid: number; rangeMax: number };
    return range.rangeMid <= range.rangeMax;
  }, {
    message: 'Range top must be greater than or equal to the midpoint.',
    path: ['rangeMax'],
  });
}

const createLevelFieldsSchema = positionRangeFieldsSchema.extend({
  classificationId: z.string().uuid(),
  levelCode: z.string().trim().min(1, 'Level code is required').max(20),
  currency: z.string().trim().min(1, 'Currency is required').max(10).default('CAD'),
});

const updateLevelFieldsSchema = positionRangeFieldsSchema.extend({
  currency: z.string().trim().min(1, 'Currency is required').max(10).default('CAD'),
});

export const createLevelSchema = withValidRangeOrder(createLevelFieldsSchema);
export const updateLevelSchema = withValidRangeOrder(updateLevelFieldsSchema);

export const listEmployeeOptionsQuerySchema = z.object({
  search: trimmedOptionalStringSchema,
});

export type ArchiveRecordInput = z.infer<typeof archiveRecordSchema>;
export type CreateClassificationInput = z.infer<typeof createClassificationSchema>;
export type CreateLevelInput = z.infer<typeof createLevelSchema>;
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type ListEmployeeOptionsQuery = z.infer<typeof listEmployeeOptionsQuerySchema>;
export type ListLevelsQuery = z.infer<typeof listLevelsQuerySchema>;
export type ListOrgUnitsQuery = z.infer<typeof listOrgUnitsQuerySchema>;
export type ListPositionsQuery = z.infer<typeof listPositionsQuerySchema>;
export type OrganizationListQuery = z.infer<typeof organizationListQuerySchema>;
export type UpdateClassificationInput = z.infer<typeof updateClassificationSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
export type UpdateOrgUnitInput = z.infer<typeof updateOrgUnitSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
