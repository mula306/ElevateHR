import { Prisma } from '../../generated/prisma';
import { prisma } from './prisma';
import { trimToNull } from './service-utils';

export const ACCOUNT_STATUS_ACTIVE = 'Active';
export const ACCOUNT_QUEUE_HR_OPERATIONS = 'HR_OPERATIONS';
export const ACCOUNT_QUEUE_IT = 'IT';
export const ACCOUNT_QUEUE_ADMIN_REVIEW = 'ADMIN_REVIEW';
export const ACCOUNT_QUEUE_FINANCE = 'FINANCE';
export const ACCOUNT_QUEUE_HRBP = 'HRBP';
export const DEV_ACCOUNT_HEADER = 'x-dev-account-id';

export interface IdentityClaims {
  oid: string;
  name: string;
  email: string;
  roles: string[];
}

export interface ResolvedAccount {
  id: string;
  entraObjectId: string | null;
  email: string;
  displayName: string;
  status: string;
  employeeId: string | null;
  lastSignedInAt: string | null;
  queueMemberships: string[];
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    department: string;
    jobTitle: string;
    status: string;
  } | null;
}

export function normalizeEmail(value: string | null | undefined) {
  return trimToNull(value)?.toLowerCase() ?? null;
}

export function getQueueKeysForRoles(roles: string[]) {
  const queueKeys = new Set<string>();

  if (roles.includes('Admin')) {
    queueKeys.add(ACCOUNT_QUEUE_HR_OPERATIONS);
    queueKeys.add(ACCOUNT_QUEUE_IT);
    queueKeys.add(ACCOUNT_QUEUE_ADMIN_REVIEW);
  }

  if (roles.includes('HR.Manager')) {
    queueKeys.add(ACCOUNT_QUEUE_HR_OPERATIONS);
  }

  if (roles.includes('Finance')) {
    queueKeys.add(ACCOUNT_QUEUE_FINANCE);
  }

  if (roles.includes('HR.BusinessPartner')) {
    queueKeys.add(ACCOUNT_QUEUE_HRBP);
  }

  return [...queueKeys];
}

export function mapOwnerLabelToQueueKey(ownerLabel: string | null | undefined) {
  const normalizedLabel = trimToNull(ownerLabel)?.toLowerCase();

  if (!normalizedLabel) {
    return null;
  }

  if (normalizedLabel === 'hr operations') {
    return ACCOUNT_QUEUE_HR_OPERATIONS;
  }

  if (normalizedLabel === 'it') {
    return ACCOUNT_QUEUE_IT;
  }

  if (normalizedLabel === 'admin review') {
    return ACCOUNT_QUEUE_ADMIN_REVIEW;
  }

  if (normalizedLabel === 'finance') {
    return ACCOUNT_QUEUE_FINANCE;
  }

  if (normalizedLabel === 'hrbp' || normalizedLabel === 'hr business partner') {
    return ACCOUNT_QUEUE_HRBP;
  }

  return null;
}

function serializeResolvedAccount(account: any): ResolvedAccount {
  return {
    id: account.id,
    entraObjectId: account.entraObjectId ?? null,
    email: account.email,
    displayName: account.displayName,
    status: account.status,
    employeeId: account.employeeId ?? null,
    lastSignedInAt: account.lastSignedInAt ? account.lastSignedInAt.toISOString() : null,
    queueMemberships: (account.queueMemberships ?? []).map((membership: any) => membership.queueKey),
    employee: account.employee ? {
      id: account.employee.id,
      employeeNumber: account.employee.employeeNumber,
      firstName: account.employee.firstName,
      lastName: account.employee.lastName,
      fullName: `${account.employee.firstName} ${account.employee.lastName}`,
      department: account.employee.department,
      jobTitle: account.employee.jobTitle,
      status: account.employee.status,
    } : null,
  };
}

async function selectAccountById(
  transaction: Prisma.TransactionClient,
  accountId: string,
) {
  return transaction.appAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      entraObjectId: true,
      email: true,
      displayName: true,
      status: true,
      employeeId: true,
      lastSignedInAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
          status: true,
        },
      },
      queueMemberships: {
        orderBy: [{ queueKey: 'asc' }],
        select: {
          queueKey: true,
        },
      },
    },
  });
}

async function findEmployeeIdForEmail(
  transaction: Prisma.TransactionClient,
  email: string | null,
) {
  if (!email) {
    return null;
  }

  const employee = await transaction.employee.findFirst({
    where: {
      email: {
        equals: email,
      },
    },
    select: { id: true },
  });

  return employee?.id ?? null;
}

async function ensureRoleQueueMemberships(
  transaction: Prisma.TransactionClient,
  accountId: string,
  roles: string[],
) {
  const queueKeys = getQueueKeysForRoles(roles);

  for (const queueKey of queueKeys) {
    await transaction.accountQueueMembership.upsert({
      where: {
        accountId_queueKey: {
          accountId,
          queueKey,
        },
      },
      update: {},
      create: {
        accountId,
        queueKey,
      },
    });
  }
}

export async function findActiveAccountIdByEmployeeId(
  transaction: Prisma.TransactionClient,
  employeeId: string | null | undefined,
) {
  if (!employeeId) {
    return null;
  }

  const account = await transaction.appAccount.findFirst({
    where: {
      employeeId,
      status: ACCOUNT_STATUS_ACTIVE,
    },
    orderBy: [
      { lastSignedInAt: 'desc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
    },
  });

  return account?.id ?? null;
}

export async function resolveWorkflowAssignment(
  transaction: Prisma.TransactionClient,
  input: {
    assigneeAccountId?: string | null;
    assigneeQueueKey?: string | null;
    ownerEmployeeId?: string | null;
    ownerLabel?: string | null;
  },
) {
  let assigneeAccountId = input.assigneeAccountId ?? null;
  let assigneeQueueKey = input.assigneeQueueKey ?? null;

  if (!assigneeAccountId && input.ownerEmployeeId) {
    assigneeAccountId = await findActiveAccountIdByEmployeeId(transaction, input.ownerEmployeeId);
  }

  if (!assigneeQueueKey && !assigneeAccountId) {
    assigneeQueueKey = mapOwnerLabelToQueueKey(input.ownerLabel);
  }

  return {
    assigneeAccountId,
    assigneeQueueKey,
  };
}

export async function resolveOrProvisionAccount(identity: IdentityClaims) {
  const normalizedEmail = normalizeEmail(identity.email);

  const account = await prisma.$transaction(async (transaction) => {
    let existingAccount = identity.oid
      ? await transaction.appAccount.findUnique({
        where: { entraObjectId: identity.oid },
        select: { id: true, employeeId: true },
      })
      : null;

    if (!existingAccount && normalizedEmail) {
      existingAccount = await transaction.appAccount.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, employeeId: true },
      });
    }

    const linkedEmployeeId = existingAccount?.employeeId ?? await findEmployeeIdForEmail(transaction, normalizedEmail);
    const displayName = trimToNull(identity.name) ?? normalizedEmail ?? 'Unknown user';

    const savedAccount = existingAccount
      ? await transaction.appAccount.update({
        where: { id: existingAccount.id },
        data: {
          entraObjectId: identity.oid || undefined,
          email: normalizedEmail ?? undefined,
          displayName,
          employeeId: existingAccount.employeeId ?? linkedEmployeeId,
          status: ACCOUNT_STATUS_ACTIVE,
          lastSignedInAt: new Date(),
        },
        select: { id: true },
      })
      : await transaction.appAccount.create({
        data: {
          entraObjectId: identity.oid || null,
          email: normalizedEmail ?? `${identity.oid}@unresolved.local`,
          displayName,
          employeeId: linkedEmployeeId,
          status: ACCOUNT_STATUS_ACTIVE,
          lastSignedInAt: new Date(),
        },
        select: { id: true },
      });

    await ensureRoleQueueMemberships(transaction, savedAccount.id, identity.roles);

    return selectAccountById(transaction, savedAccount.id);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return account ? serializeResolvedAccount(account) : null;
}

export async function resolveDevAccount(devAccountId?: string | null) {
  const account = await prisma.$transaction(async (transaction) => {
    if (devAccountId) {
      const selectedAccount = await selectAccountById(transaction, devAccountId);
      if (selectedAccount) {
        return selectedAccount;
      }
    }

    const hrAdminAccount = await transaction.appAccount.findFirst({
      where: {
        status: ACCOUNT_STATUS_ACTIVE,
        email: 'hr.admin@elevatehr.dev',
      },
      select: { id: true },
    });

    if (hrAdminAccount) {
      return selectAccountById(transaction, hrAdminAccount.id);
    }

    const fallbackAccount = await transaction.appAccount.findFirst({
      where: { status: ACCOUNT_STATUS_ACTIVE },
      orderBy: [
        { lastSignedInAt: 'desc' },
        { createdAt: 'asc' },
      ],
      select: { id: true },
    });

    if (!fallbackAccount) {
      return null;
    }

    return selectAccountById(transaction, fallbackAccount.id);
  });

  return account ? serializeResolvedAccount(account) : null;
}

export async function listAvailableDevAccounts() {
  const accounts = await prisma.appAccount.findMany({
    where: { status: ACCOUNT_STATUS_ACTIVE },
    orderBy: [{ displayName: 'asc' }],
    select: {
      id: true,
      email: true,
      displayName: true,
      employee: {
        select: {
          employeeNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return accounts.map((account) => ({
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    employeeLabel: account.employee
      ? `${account.employee.firstName} ${account.employee.lastName} (${account.employee.employeeNumber})`
      : null,
  }));
}
