import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BellRing,
  Building2,
  Briefcase,
  Calendar,
  Clock3,
  CreditCard,
  FileText,
  GraduationCap,
  HelpCircle,
  IdCard,
  LayoutDashboard,
  Settings,
  Target,
  Users,
} from 'lucide-react';
import type { FeatureKey } from '@/shared/features/feature-registry';

export type NavigationBadgeKey = 'inbox';
export type NavigationAudience = 'staff' | 'manager' | 'hr_admin';

export interface NavigationAccess {
  isStaff: boolean;
  isManager: boolean;
  isHrAdmin: boolean;
  visibleRoutes: string[];
}

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  audiences: NavigationAudience[];
  section: 'overview' | 'my_work' | 'management' | 'administration';
  featureKey?: FeatureKey;
  badgeKey?: NavigationBadgeKey;
  showInMenu?: boolean;
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export interface FeatureRoute extends NavigationItem {
  summary: string;
  description: string;
  capabilities: string[];
}

const dashboardRoute: NavigationItem = {
  label: 'Dashboard',
  to: '/',
  icon: LayoutDashboard,
  audiences: ['hr_admin'],
  section: 'overview',
};

const inboxRoute: FeatureRoute = {
  label: 'Inbox',
  to: '/inbox',
  icon: BellRing,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  badgeKey: 'inbox',
  summary: 'Review your account-specific approvals, tasks, and operational alerts in one focused workspace.',
  description: 'Inbox keeps workflow and approval work out of the dashboard so every signed-in user has a clean, personal work queue.',
  capabilities: ['Personal work queue with filters', 'Quick actions for approvals and tasks', 'Mobile-friendly inbox cards and desktop table'],
};

const timeOffRoute: FeatureRoute = {
  label: 'Time Off',
  to: '/time-off',
  icon: Calendar,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  summary: 'Request time away, review your own leave history, and keep upcoming holidays visible.',
  description: 'This workspace stays self-service first so every signed-in user can request time off without mixing in approval operations.',
  capabilities: ['Self-service leave requests', 'Personal request history and statuses', 'Upcoming holidays and closures'],
};

const timeAttendanceRoute: FeatureRoute = {
  label: 'Time & Attendance',
  to: '/time-attendance',
  icon: Clock3,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  featureKey: 'time_attendance_self_service',
  summary: 'Review your schedule, keep the current time card moving, and see leave in one workforce-time workspace.',
  description: 'Time & Attendance brings schedule visibility, pay-period time entry, leave context, and history together without turning the self-service view into a manager queue.',
  capabilities: ['Weekly schedule and holiday visibility', 'Current pay-period time card', 'Integrated leave and time history'],
};

const myProfileRoute: FeatureRoute = {
  label: 'My Profile',
  to: '/my-profile',
  icon: IdCard,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  summary: 'Maintain your personal contact details and self-identified skills from one self-service profile workspace.',
  description: 'My Profile keeps employee-controlled personal data and self-identified skills separate from HR-owned employment records while still aligning manager skill validation and learning taxonomy.',
  capabilities: ['Personal contact and emergency updates', 'Read-only employment information', 'Self-identified skill management'],
};

const myPerformanceRoute: FeatureRoute = {
  label: 'My Planning for Success',
  to: '/my-performance',
  icon: Target,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  featureKey: 'planning_self_service',
  summary: 'Track your own goals, complete self-reviews, and acknowledge finalized feedback from one self-service workspace.',
  description: 'My Planning for Success keeps employee development work separate from the management workspace so every employee can see goals, review history, and due actions clearly.',
  capabilities: ['Personal goals and progress updates', 'Self-review completion and acknowledgment', 'Review history and released feedback'],
};

const myLearningRoute: FeatureRoute = {
  label: 'My Learning',
  to: '/my-learning',
  icon: GraduationCap,
  audiences: ['staff', 'manager', 'hr_admin'],
  section: 'my_work',
  featureKey: 'learning_self_service',
  summary: 'Review assigned learning, launch training, track due work, and keep certificates visible in one self-service workspace.',
  description: 'My Learning keeps employee training self-service focused on required learning, optional development content, transcript visibility, and certification renewal awareness.',
  capabilities: ['Assigned and optional learning', 'Transcript and certificate history', 'Due, overdue, and renewal visibility'],
};

const performanceRoute: FeatureRoute = {
  label: 'Planning for Success',
  to: '/performance',
  icon: BarChart3,
  audiences: ['manager', 'hr_admin'],
  section: 'management',
  featureKey: 'planning_management',
  summary: 'Manage review cycles, team feedback, and individual goals from a focused management workspace.',
  description: 'Planning for Success gives managers and HR administrators a clean operating space for cycle planning, review completion, and goal oversight without cluttering employee self-service.',
  capabilities: ['HR-created review cycles', 'Manager review completion and release', 'Individual goal assignment and tracking'],
};

const learningRoute: FeatureRoute = {
  label: 'Learning',
  to: '/learning',
  icon: GraduationCap,
  audiences: ['manager', 'hr_admin'],
  section: 'management',
  featureKey: 'learning_management',
  summary: 'Manage provider-backed learning, assignments, paths, automation rules, and compliance oversight in one workspace.',
  description: 'Learning gives managers and HR administrators one focused operating area for course catalogs, assignments, learning paths, provider sync, and compliance follow-up.',
  capabilities: ['Provider catalog sync and oversight', 'Assignments and automation rules', 'Learning paths and compliance visibility'],
};

const workforceTimeRoute: FeatureRoute = {
  label: 'Workforce Time',
  to: '/workforce-time',
  icon: Clock3,
  audiences: ['manager', 'hr_admin'],
  section: 'management',
  featureKey: 'time_attendance_management',
  summary: 'Manage schedules, time-card approvals, exceptions, and workforce-time rules in one operational workspace.',
  description: 'Workforce Time gives managers and HR administrators a single operating surface for schedules, approvals, exceptions, coverage pressure, and union-aware rule profiles.',
  capabilities: ['Org-unit schedules and coverage', 'Time-card approvals and corrections', 'Rule profiles, labor groups, and shift templates'],
};

const recruitmentRoute: FeatureRoute = {
  label: 'Recruitment',
  to: '/recruitment',
  icon: Briefcase,
  audiences: ['manager', 'hr_admin'],
  section: 'management',
  featureKey: 'recruitment_management',
  summary: 'Manage position requests, configurable approvals, and hiring close-out from one governed workforce-planning workspace.',
  description: 'Recruitment becomes the request-to-hire operating surface, while Organization remains the approved position master and Settings owns routing configuration.',
  capabilities: ['Position request intake and approval tracking', 'Rule-driven routing and hiring close-out', 'Approved-request linkage back to positions and snapshots'],
};

const employeesRoute: FeatureRoute = {
  label: 'Employees',
  to: '/employees',
  icon: Users,
  audiences: ['hr_admin'],
  section: 'administration',
  summary: 'Build the employee directory, org chart, and lifecycle workflows here.',
  description: 'This section is the right home for profile records, manager relationships, onboarding status, and employment history.',
  capabilities: ['Employee directory with search and filters', 'Profile and employment record management', 'Reporting lines and organizational structure'],
};

const organizationRoute: FeatureRoute = {
  label: 'Organization',
  to: '/organization',
  icon: Building2,
  audiences: ['hr_admin'],
  section: 'administration',
  summary: 'Design org units, approved positions, and compensation architecture here.',
  description: 'Keep organizational design separate from employee records so reporting lines, vacancies, and level-based salary bands can be managed as durable structure.',
  capabilities: ['Org units and reporting structure', 'Approved positions with incumbents and vacancies', 'Classification levels with start, midpoint, and top-of-range guidance'],
};

const reportsRoute: FeatureRoute = {
  label: 'Reports',
  to: '/reports',
  icon: FileText,
  audiences: ['hr_admin'],
  section: 'management',
  summary: 'Cross-functional analytics and exports should live in a focused reporting area.',
  description: 'Reports often cut across modules, so it helps to keep them in a shared page instead of scattering them across features.',
  capabilities: ['Headcount and attrition reporting', 'Payroll and budget summaries', 'CSV and PDF exports'],
};

const payrollRoute: FeatureRoute = {
  label: 'Payroll',
  to: '/payroll',
  icon: CreditCard,
  audiences: [],
  section: 'administration',
  showInMenu: false,
  summary: 'Use this workspace for payroll runs, compensation history, and approvals.',
  description: 'Keeping payroll concerns in their own page prevents dashboard code from absorbing finance-specific workflows too early.',
  capabilities: ['Pay period summaries and approvals', 'Compensation changes and audit trail', 'Export-ready payroll batches'],
};

const settingsRoute: FeatureRoute = {
  label: 'Settings',
  to: '/settings',
  icon: Settings,
  audiences: ['hr_admin'],
  section: 'administration',
  summary: 'Configuration for policies, reference data, and access can be centralized here.',
  description: 'This page is the natural home for administrative controls that support every module.',
  capabilities: ['Reference data and lookup tables', 'Role and permission management', 'Application and integration settings'],
};

const helpRoute: FeatureRoute = {
  label: 'Help & Support',
  to: '/help',
  icon: HelpCircle,
  audiences: [],
  section: 'my_work',
  showInMenu: false,
  summary: 'Documentation, troubleshooting, and support workflows can be collected here.',
  description: 'A dedicated help area keeps onboarding content and support actions easy to find as the product grows.',
  capabilities: ['Knowledge base and SOP links', 'Support request intake', 'Release notes and product updates'],
};

const allNavigationItems: NavigationItem[] = [
  dashboardRoute,
  inboxRoute,
  timeOffRoute,
  timeAttendanceRoute,
  myProfileRoute,
  myPerformanceRoute,
  myLearningRoute,
  performanceRoute,
  workforceTimeRoute,
  learningRoute,
  recruitmentRoute,
  employeesRoute,
  organizationRoute,
  reportsRoute,
  payrollRoute,
  settingsRoute,
  helpRoute,
];

const allFeatureRoutes: FeatureRoute[] = [
  inboxRoute,
  timeOffRoute,
  timeAttendanceRoute,
  myProfileRoute,
  myPerformanceRoute,
  myLearningRoute,
  performanceRoute,
  workforceTimeRoute,
  learningRoute,
  employeesRoute,
  organizationRoute,
  reportsRoute,
  payrollRoute,
  recruitmentRoute,
  settingsRoute,
  helpRoute,
];

const allSections: NavigationSection[] = [
  {
    label: 'Overview',
    items: allNavigationItems.filter((item) => item.section === 'overview'),
  },
  {
    label: 'My Work',
    items: allNavigationItems.filter((item) => item.section === 'my_work'),
  },
  {
    label: 'Management',
    items: allNavigationItems.filter((item) => item.section === 'management'),
  },
  {
    label: 'Administration',
    items: allNavigationItems.filter((item) => item.section === 'administration'),
  },
];

function normalizeVisibleRoutes(visibleRoutes: string[] | undefined) {
  return new Set(visibleRoutes ?? []);
}

export function canAccessRoute(access: NavigationAccess | null | undefined, route: string) {
  return normalizeVisibleRoutes(access?.visibleRoutes).has(route);
}

export function getDefaultRoute(access: NavigationAccess | null | undefined) {
  if (canAccessRoute(access, '/')) {
    return '/';
  }

  if (access?.isManager && canAccessRoute(access, '/performance')) {
    return '/performance';
  }

  if (canAccessRoute(access, '/inbox')) {
    return '/inbox';
  }

  if (canAccessRoute(access, '/time-off')) {
    return '/time-off';
  }

  return '/inbox';
}

export function getNavigationSections(visibleRoutes: string[] | undefined) {
  const visibleRouteSet = normalizeVisibleRoutes(visibleRoutes);

  return allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.showInMenu !== false && visibleRouteSet.has(item.to)),
    }))
    .filter((section) => section.items.length > 0);
}

export function getFeatureRoute(path: string) {
  return allFeatureRoutes.find((route) => route.to === path) ?? null;
}

export function getNavigationItem(path: string) {
  return allNavigationItems.find((item) => item.to === path) ?? null;
}

export const featureRoutes = allFeatureRoutes;
