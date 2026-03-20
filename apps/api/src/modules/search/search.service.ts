import type { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import type { FeatureStateRecord } from '../../shared/lib/features';
import type { SearchQuery } from './search.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const RECRUITMENT_CONTROL_ROLES = new Set(['Admin', 'HR.Manager', 'Finance', 'HR.BusinessPartner']);
const TERMINATED_EMPLOYEE_STATUS = 'Terminated';

type SearchResultType =
  | 'employee'
  | 'position'
  | 'job_request'
  | 'inbox_item'
  | 'learning_content'
  | 'workspace';

interface SearchContext {
  currentAccount: Express.Request['account'];
  visibleRoutes: string[];
  roles: string[];
  features: FeatureStateRecord;
}

interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  route: string;
  badge: string | null;
}

interface SearchResultGroup {
  type: SearchResultType;
  label: string;
  items: SearchResultItem[];
}

const workspaceDirectory: Array<{
  route: string;
  label: string;
  subtitle: string;
  badge: string | null;
  keywords: string[];
}> = [
  {
    route: '/inbox',
    label: 'Inbox',
    subtitle: 'Approvals, tasks, and alerts assigned to you.',
    badge: 'My Work',
    keywords: ['approvals', 'tasks', 'alerts', 'queue'],
  },
  {
    route: '/time-attendance',
    label: 'Time & Attendance',
    subtitle: 'Schedules, time cards, leave, and history.',
    badge: 'My Work',
    keywords: ['time', 'attendance', 'schedule', 'leave', 'hours'],
  },
  {
    route: '/time-attendance?tab=leave',
    label: 'Leave',
    subtitle: 'Time away requests and leave history.',
    badge: 'My Work',
    keywords: ['time off', 'vacation', 'sick', 'leave'],
  },
  {
    route: '/my-profile',
    label: 'My Profile',
    subtitle: 'Personal information, employment context, and skills.',
    badge: 'My Work',
    keywords: ['profile', 'contact', 'skills'],
  },
  {
    route: '/my-performance',
    label: 'My Planning for Success',
    subtitle: 'Goals, self-reviews, and acknowledgments.',
    badge: 'My Work',
    keywords: ['performance', 'goals', 'review', 'planning'],
  },
  {
    route: '/my-learning',
    label: 'My Learning',
    subtitle: 'Assigned learning, launches, and certificates.',
    badge: 'My Work',
    keywords: ['learning', 'training', 'courses'],
  },
  {
    route: '/performance',
    label: 'Planning for Success',
    subtitle: 'Management reviews, goals, and cycle oversight.',
    badge: 'Management',
    keywords: ['reviews', 'cycles', 'goals', 'team skills'],
  },
  {
    route: '/learning',
    label: 'Learning',
    subtitle: 'Catalog, assignments, paths, providers, and compliance.',
    badge: 'Management',
    keywords: ['learning admin', 'catalog', 'assignments', 'providers'],
  },
  {
    route: '/workforce-time',
    label: 'Workforce Time',
    subtitle: 'Schedules, approvals, exceptions, and rules.',
    badge: 'Management',
    keywords: ['time approvals', 'coverage', 'exceptions', 'rules'],
  },
  {
    route: '/recruitment',
    label: 'Recruitment',
    subtitle: 'Requests, approvals, hiring, and position lifecycle.',
    badge: 'Management',
    keywords: ['recruitment', 'job requests', 'hiring', 'positions'],
  },
  {
    route: '/',
    label: 'Dashboard',
    subtitle: 'Workforce metrics and operational visibility.',
    badge: 'Overview',
    keywords: ['dashboard', 'metrics'],
  },
  {
    route: '/employees',
    label: 'Employees',
    subtitle: 'Employee directory, profiles, and employment records.',
    badge: 'Administration',
    keywords: ['employees', 'directory', 'profiles'],
  },
  {
    route: '/organization',
    label: 'Organization',
    subtitle: 'Org units, classifications, and approved positions.',
    badge: 'Administration',
    keywords: ['positions', 'org chart', 'classifications'],
  },
  {
    route: '/reports',
    label: 'Reports',
    subtitle: 'Cross-functional reporting and exports.',
    badge: 'Management',
    keywords: ['reports', 'analytics', 'exports'],
  },
  {
    route: '/settings',
    label: 'Settings',
    subtitle: 'Feature controls, taxonomy, and business configuration.',
    badge: 'Administration',
    keywords: ['settings', 'configuration', 'features', 'taxonomy'],
  },
];

function hasRole(roles: string[], allowedRoles: Set<string>) {
  return roles.some((role) => allowedRoles.has(role));
}

function getVisibleRouteSet(visibleRoutes: string[]) {
  return new Set(visibleRoutes);
}

function buildOwnershipWhere(currentAccount: Express.Request['account']): Prisma.WorkflowTaskWhereInput {
  if (!currentAccount) {
    return { id: '__no-account__' };
  }

  const ownershipClauses: Prisma.WorkflowTaskWhereInput[] = [
    { assigneeAccountId: currentAccount.id },
  ];

  if (currentAccount.queueMemberships.length > 0) {
    ownershipClauses.push({
      assigneeQueueKey: {
        in: currentAccount.queueMemberships,
      },
    });
  }

  if (currentAccount.employeeId) {
    ownershipClauses.push({
      assigneeAccountId: null,
      assigneeQueueKey: null,
      ownerEmployeeId: currentAccount.employeeId,
    });
  }

  return { OR: ownershipClauses };
}

function toSearchGroup(type: SearchResultType, label: string, items: SearchResultItem[]): SearchResultGroup | null {
  if (items.length === 0) {
    return null;
  }

  return { type, label, items };
}

async function searchEmployees(query: SearchQuery, visibleRouteSet: Set<string>) {
  if (!visibleRouteSet.has('/employees')) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      status: { not: TERMINATED_EMPLOYEE_STATUS },
      OR: [
        { firstName: { contains: query.q } },
        { lastName: { contains: query.q } },
        { employeeNumber: { contains: query.q } },
        { email: { contains: query.q } },
        { jobTitle: { contains: query.q } },
        { department: { contains: query.q } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: query.limit,
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      department: true,
      jobTitle: true,
      status: true,
    },
  });

  return employees.map((employee) => ({
    id: employee.id,
    type: 'employee' as const,
    title: `${employee.firstName} ${employee.lastName}`,
    subtitle: `${employee.employeeNumber} | ${employee.department} | ${employee.jobTitle}`,
    route: '/employees',
    badge: employee.status,
  }));
}

async function searchPositions(query: SearchQuery, visibleRouteSet: Set<string>) {
  if (!visibleRouteSet.has('/organization')) {
    return [];
  }

  const positions = await prisma.position.findMany({
    where: {
      recordStatus: 'Active',
      OR: [
        { positionCode: { contains: query.q } },
        { title: { contains: query.q } },
        { orgUnit: { is: { code: { contains: query.q } } } },
        { orgUnit: { is: { name: { contains: query.q } } } },
        { classification: { is: { code: { contains: query.q } } } },
        { classification: { is: { title: { contains: query.q } } } },
      ],
    },
    orderBy: [{ title: 'asc' }],
    take: query.limit,
    select: {
      id: true,
      positionCode: true,
      title: true,
      positionStatus: true,
      orgUnit: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  return positions.map((position) => ({
    id: position.id,
    type: 'position' as const,
    title: `${position.positionCode} | ${position.title}`,
    subtitle: `${position.orgUnit.code} | ${position.orgUnit.name}`,
    route: '/organization',
    badge: position.positionStatus,
  }));
}

async function searchJobRequests(query: SearchQuery, visibleRouteSet: Set<string>, context: SearchContext) {
  if (!visibleRouteSet.has('/recruitment')) {
    return [];
  }

  const where: Prisma.JobRequestWhereInput = {};

  if (!hasRole(context.roles, RECRUITMENT_CONTROL_ROLES)) {
    if (!context.currentAccount?.employeeId) {
      return [];
    }

    where.requestorEmployeeId = context.currentAccount.employeeId;
  }

  where.OR = [
    { requestNumber: { contains: query.q } },
    { title: { contains: query.q } },
    { requestType: { is: { name: { contains: query.q } } } },
    { fundingType: { is: { name: { contains: query.q } } } },
    { orgUnit: { is: { code: { contains: query.q } } } },
    { orgUnit: { is: { name: { contains: query.q } } } },
  ];

  const requests = await prisma.jobRequest.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: query.limit,
    select: {
      id: true,
      requestNumber: true,
      title: true,
      status: true,
      requestType: {
        select: {
          name: true,
        },
      },
      orgUnit: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  return requests.map((request) => ({
    id: request.id,
    type: 'job_request' as const,
    title: `${request.requestNumber} | ${request.title}`,
    subtitle: `${request.requestType.name} | ${request.orgUnit.code} | ${request.orgUnit.name}`,
    route: '/recruitment',
    badge: request.status,
  }));
}

async function searchInboxItems(query: SearchQuery, visibleRouteSet: Set<string>, context: SearchContext) {
  if (!visibleRouteSet.has('/inbox')) {
    return [];
  }

  const tasks = await prisma.workflowTask.findMany({
    where: {
      AND: [
        buildOwnershipWhere(context.currentAccount),
        { status: 'Open' },
        {
          OR: [
            { title: { contains: query.q } },
            { description: { contains: query.q } },
            { employee: { is: { firstName: { contains: query.q } } } },
            { employee: { is: { lastName: { contains: query.q } } } },
            { employee: { is: { employeeNumber: { contains: query.q } } } },
          ],
        },
      ],
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: query.limit,
    select: {
      id: true,
      title: true,
      taskType: true,
      status: true,
      priority: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNumber: true,
        },
      },
    },
  });

  return tasks.map((task) => ({
    id: task.id,
    type: 'inbox_item' as const,
    title: task.title,
    subtitle: task.employee
      ? `${task.taskType} | ${task.employee.firstName} ${task.employee.lastName} | ${task.employee.employeeNumber}`
      : `${task.taskType} | Open work item`,
    route: '/inbox',
    badge: task.priority,
  }));
}

async function searchLearningContent(query: SearchQuery, visibleRouteSet: Set<string>) {
  const learningRoute = visibleRouteSet.has('/learning')
    ? '/learning'
    : visibleRouteSet.has('/my-learning')
      ? '/my-learning'
      : null;

  if (!learningRoute) {
    return [];
  }

  const contents = await prisma.learningContent.findMany({
    where: {
      contentStatus: 'Active',
      OR: [
        { title: { contains: query.q } },
        { description: { contains: query.q } },
        { tagList: { contains: query.q } },
        { provider: { is: { displayName: { contains: query.q } } } },
      ],
    },
    orderBy: [{ title: 'asc' }],
    take: query.limit,
    select: {
      id: true,
      title: true,
      modality: true,
      certificateEligible: true,
      provider: {
        select: {
          displayName: true,
        },
      },
    },
  });

  return contents.map((content) => ({
    id: content.id,
    type: 'learning_content' as const,
    title: content.title,
    subtitle: `${content.provider.displayName} | ${content.modality}`,
    route: learningRoute,
    badge: content.certificateEligible ? 'Certificate' : null,
  }));
}

function searchWorkspaces(query: SearchQuery, visibleRouteSet: Set<string>) {
  const normalizedQuery = query.q.toLowerCase();

  return workspaceDirectory
    .filter((workspace) => {
      const baseRoute = workspace.route.split('?')[0];
      if (!visibleRouteSet.has(baseRoute)) {
        return false;
      }

      return workspace.label.toLowerCase().includes(normalizedQuery)
        || workspace.subtitle.toLowerCase().includes(normalizedQuery)
        || workspace.keywords.some((keyword) => keyword.includes(normalizedQuery));
    })
    .slice(0, query.limit)
    .map((workspace) => ({
      id: workspace.route,
      type: 'workspace' as const,
      title: workspace.label,
      subtitle: workspace.subtitle,
      route: workspace.route,
      badge: workspace.badge,
    }));
}

export async function searchGlobal(query: SearchQuery, context: SearchContext) {
  const visibleRouteSet = getVisibleRouteSet(context.visibleRoutes);

  const [employees, positions, jobRequests, inboxItems, learningContent] = await Promise.all([
    searchEmployees(query, visibleRouteSet),
    searchPositions(query, visibleRouteSet),
    searchJobRequests(query, visibleRouteSet, context),
    searchInboxItems(query, visibleRouteSet, context),
    searchLearningContent(query, visibleRouteSet),
  ]);

  const workspaces = searchWorkspaces(query, visibleRouteSet);

  return {
    groups: [
      toSearchGroup('workspace', 'Workspaces', workspaces),
      toSearchGroup('inbox_item', 'Inbox', inboxItems),
      toSearchGroup('employee', 'Employees', employees),
      toSearchGroup('position', 'Positions', positions),
      toSearchGroup('job_request', 'Requests', jobRequests),
      toSearchGroup('learning_content', 'Learning', learningContent),
    ].filter(Boolean) as SearchResultGroup[],
  };
}
