import { z } from 'zod';

export const listTeamSkillsQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
});

export const updateTeamSkillValidationSchema = z.object({
  managerNote: z.string().max(500).optional().nullable(),
});

export type ListTeamSkillsQuery = z.infer<typeof listTeamSkillsQuerySchema>;
export type UpdateTeamSkillValidationInput = z.infer<typeof updateTeamSkillValidationSchema>;
