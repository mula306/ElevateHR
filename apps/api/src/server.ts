import { createApp } from './app/create-app';
import { env } from './shared/config/env';
import { logger } from './shared/lib/logger';
import { prisma } from './shared/lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Elevate HR API running on http://localhost:${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);

  if (env.AUTH_BYPASS === 'true') {
    logger.warn('AUTH_BYPASS is enabled; JWT validation is skipped');
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
