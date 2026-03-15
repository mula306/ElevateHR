import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import dashboardRoutes from './routes/dashboard';
import employeeRoutes from './routes/employees';
import { logger } from './utils/logger';

const app = express();
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ──────────── Security Middleware ────────────
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

// Rate limiting on write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: { code: 429, message: 'Too many requests' } },
});

// ──────────── General Middleware ────────────
app.use(express.json({ limit: '1mb' }));
app.use(morgan('short', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}));
app.use((req, res, next) => {
  if (!writeMethods.has(req.method)) {
    next();
    return;
  }

  writeLimiter(req, res, next);
});

// ──────────── Health Check ────────────
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

// ──────────── Authenticated Routes ────────────
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/employees', authenticate, employeeRoutes);

// ──────────── Error Handler ────────────
app.use(errorHandler);

// ──────────── Start Server ────────────
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Elevate HR API running on http://localhost:${env.PORT}`);
  logger.info(`📡 Environment: ${env.NODE_ENV}`);
  if (env.AUTH_BYPASS === 'true') {
    logger.warn('⚠️  AUTH_BYPASS is enabled — JWT validation is skipped');
  }
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down API server.');

  server.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      logger.error({ error }, 'Failed to close the HTTP server cleanly.');
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

export default app;
