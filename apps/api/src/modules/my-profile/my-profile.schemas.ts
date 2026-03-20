import { z } from 'zod';

export const updateMyProfileSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  phone: z.string().max(20).optional().nullable(),
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

export const createMySkillSchema = z.object({
  skillTagId: z.string().uuid(),
  selfReportedLevel: z.string().max(50).optional().nullable(),
  confidence: z.number().int().min(1).max(5).optional().nullable(),
});

export const updateMySkillSchema = createMySkillSchema.omit({ skillTagId: true });

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
export type CreateMySkillInput = z.infer<typeof createMySkillSchema>;
export type UpdateMySkillInput = z.infer<typeof updateMySkillSchema>;
