import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dashboardRouter from '../modules/dashboard/dashboard.router';
import employeeChecklistsRouter from '../modules/employee-checklists/employee-checklists.router';
import employeeDocumentsRouter from '../modules/employee-documents/employee-documents.router';
import employeesRouter from '../modules/employees/employees.router';
import learningRouter from '../modules/learning/learning.router';
import myProfileRouter from '../modules/my-profile/my-profile.router';
import organizationRouter from '../modules/organization/organization.router';
import performanceRouter from '../modules/performance/performance.router';
import recruitmentRouter from '../modules/recruitment/recruitment.router';
import reportsRouter from '../modules/reports/reports.router';
import sessionRouter from '../modules/session/session.router';
import settingsRouter from '../modules/settings/settings.router';
import timeAttendanceRouter from '../modules/time-attendance/time-attendance.router';
import timeOffRouter from '../modules/time-off/time-off.router';
import workflowRouter from '../modules/workflow/workflow.router';
import inboxRouter from '../modules/inbox/inbox.router';
import skillsRouter from '../modules/skills/skills.router';
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
  app.use('/api/session', authenticate, sessionRouter);
  app.use('/api/inbox', authenticate, inboxRouter);
  app.use('/api/my-profile', authenticate, myProfileRouter);
  app.use('/api/skills', authenticate, skillsRouter);
  app.use('/api/employees', authenticate, employeesRouter);
  app.use('/api/learning', authenticate, learningRouter);
  app.use('/api/organization', authenticate, organizationRouter);
  app.use('/api/performance', authenticate, performanceRouter);
  app.use('/api/recruitment', authenticate, recruitmentRouter);
  app.use('/api/time-attendance', authenticate, timeAttendanceRouter);
  app.use('/api/time-off', authenticate, timeOffRouter);
  app.use('/api/workflow-tasks', authenticate, workflowRouter);
  app.use('/api/employee-checklists', authenticate, employeeChecklistsRouter);
  app.use('/api/employee-documents', authenticate, employeeDocumentsRouter);
  app.use('/api/reports', authenticate, reportsRouter);
  app.use('/api/settings', authenticate, settingsRouter);

  app.use(errorHandler);

  return app;
}
