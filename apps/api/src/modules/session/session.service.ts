import { env } from '../../shared/config/env';
import { filterRoutesByFeature, getFeatureStateRecord } from '../../shared/lib/features';
import { DEV_ACCOUNT_HEADER, listAvailableDevAccounts } from '../../shared/lib/accounts';
import { prisma } from '../../shared/lib/prisma';

const TERMINATED_EMPLOYEE_STATUS = 'Terminated';
const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const RECRUITMENT_ROLES = new Set(['Finance', 'HR.BusinessPartner']);
const STAFF_VISIBLE_ROUTES = ['/inbox', '/time-off', '/time-attendance', '/my-profile', '/my-performance', '/my-learning'];
const MANAGER_VISIBLE_ROUTES = ['/performance', '/learning', '/workforce-time', '/recruitment'];
const HR_ADMIN_VISIBLE_ROUTES = ['/', '/performance', '/learning', '/workforce-time', '/recruitment', '/employees', '/organization', '/reports', '/settings'];

async function resolveManagerAccess(employeeId: string | null | undefined) {
  if (!employeeId) {
    return false;
  }

  const directReportCount = await prisma.employee.count({
    where: {
      managerId: employeeId,
      status: {
        not: TERMINATED_EMPLOYEE_STATUS,
      },
    },
  });

  return directReportCount > 0;
}

function resolveVisibleRoutes(isManager: boolean, isHrAdmin: boolean, hasRecruitmentRole: boolean) {
  return [
    ...new Set([
      ...STAFF_VISIBLE_ROUTES,
      ...(isManager ? MANAGER_VISIBLE_ROUTES : []),
      ...(isHrAdmin ? HR_ADMIN_VISIBLE_ROUTES : []),
      ...(hasRecruitmentRole ? ['/recruitment'] : []),
    ]),
  ];
}

export async function getCurrentSession(request: Express.Request) {
  const devModeEnabled = env.AUTH_BYPASS === 'true' && env.NODE_ENV === 'development';
  const isStaff = Boolean(request.user);
  const roles = request.user?.roles ?? [];
  const isHrAdmin = roles.some((role) => HR_ADMIN_ROLES.has(role));
  const hasRecruitmentRole = roles.some((role) => RECRUITMENT_ROLES.has(role));
  const [isManager, featureStates] = await Promise.all([
    resolveManagerAccess(request.account?.employeeId),
    getFeatureStateRecord(),
  ]);
  const baseVisibleRoutes = resolveVisibleRoutes(isManager, isHrAdmin, hasRecruitmentRole).filter((route) => {
    if (route === '/my-profile') {
      return Boolean(request.account?.employeeId);
    }

    return true;
  });

  return {
    user: request.user ?? null,
    account: request.account ?? null,
    accountLinked: Boolean(request.account?.employeeId),
    access: {
      isStaff,
      isManager,
      isHrAdmin,
      visibleRoutes: filterRoutesByFeature(baseVisibleRoutes, featureStates),
    },
    features: featureStates,
    dev: {
      enabled: devModeEnabled,
      headerName: DEV_ACCOUNT_HEADER,
      availableAccounts: devModeEnabled ? await listAvailableDevAccounts() : [],
    },
  };
}
