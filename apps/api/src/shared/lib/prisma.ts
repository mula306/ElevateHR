import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../../generated/prisma';
import { env } from '../config/env';

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
};

type PrismaMssqlConfig = ConstructorParameters<typeof PrismaMssql>[0];

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function unwrapBracedValue(value: string): string {
  if (value.startsWith('{') && value.endsWith('}')) {
    return value.slice(1, -1);
  }

  return value;
}

function splitSegments(input: string): string[] {
  const segments: string[] = [];
  let current = '';
  let insideBraces = false;

  for (const character of input) {
    if (character === '{') {
      insideBraces = true;
    } else if (character === '}') {
      insideBraces = false;
    }

    if (character === ';' && !insideBraces) {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function parseHostPart(hostPart: string): { server: string; port: number } {
  const lastColonIndex = hostPart.lastIndexOf(':');

  if (lastColonIndex === -1) {
    return { server: hostPart, port: 1433 };
  }

  const server = hostPart.slice(0, lastColonIndex);
  const port = Number.parseInt(hostPart.slice(lastColonIndex + 1), 10);

  if (Number.isNaN(port)) {
    return { server: hostPart, port: 1433 };
  }

  return { server, port };
}

function parseSqlServerConnectionString(connectionString: string): PrismaMssqlConfig {
  const normalized = connectionString.replace(/^sqlserver:\/\//i, '');
  const [hostPart, ...optionSegments] = splitSegments(normalized);
  const options = optionSegments.reduce<Record<string, string>>((accumulator, segment) => {
    const equalsIndex = segment.indexOf('=');

    if (equalsIndex === -1) {
      return accumulator;
    }

    const key = segment.slice(0, equalsIndex).trim().toLowerCase();
    const value = segment.slice(equalsIndex + 1).trim();
    accumulator[key] = unwrapBracedValue(value);
    return accumulator;
  }, {});

  const { server, port } = parseHostPart(hostPart);
  const database = options.database ?? options['initial catalog'];
  const user = options.user ?? options.uid ?? options.username;
  const password = options.password ?? options.pwd;

  if (!server || !database || !user || !password) {
    throw new Error('DATABASE_URL must include server, database, user, and password values.');
  }

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt: parseBoolean(options.encrypt, true),
      trustServerCertificate: parseBoolean(options.trustservercertificate, false),
    },
  };
}

function createPrismaClient() {
  const adapter = new PrismaMssql(parseSqlServerConnectionString(env.DATABASE_URL));
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as PrismaGlobal;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
