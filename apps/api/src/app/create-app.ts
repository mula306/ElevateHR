import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dashboardRouter from '../modules/dashboard/dashboard.router';
import employeesRouter from '../modules/employees/employees.router';
import { env } from '../shared/config/env';
import { prisma } from '../shared/lib/prisma';
import { logger } from '../shared/lib/logger';
import { authenticate } from '../shared/middleware/auth';
import { errorHandler } from '../shared/middleware/error-handler';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }));

  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: { code: 429, message: 'Too many requests' } },
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('short', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  }));
  app.use((req, res, next) => {
    if (!writeMethods.has(req.method)) {
      next();
      return;
    }

    writeLimiter(req, res, next);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/health/ready', async (_req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/dashboard', authenticate, dashboardRouter);
  app.use('/api/employees', authenticate, employeesRouter);

  app.use(errorHandler);

  return app;
}
