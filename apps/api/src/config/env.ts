import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  AZURE_TENANT_ID: z.string().default(''),
  AZURE_CLIENT_ID: z.string().default(''),
  FRONTEND_URL: z.string().min(1).default('http://localhost:5173'),
  AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
});

export const env = envSchema.parse(process.env);
