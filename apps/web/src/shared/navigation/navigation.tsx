import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  Briefcase,
  Calendar,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
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

export const featureRoutes: FeatureRoute[] = [
  {
    label: 'Employees',
    to: '/employees',
    icon: Users,
    summary: 'Build the employee directory, org chart, and lifecycle workflows here.',
    description: 'This section is the right home for profile records, manager relationships, onboarding status, and employment history.',
    capabilities: ['Employee directory with search and filters', 'Profile and employment record management', 'Reporting lines and organizational structure'],
  },
  {
    label: 'Organization',
    to: '/organization',
    icon: Building2,
    summary: 'Design org units, approved positions, and compensation architecture here.',
    description: 'Keep organizational design separate from employee records so reporting lines, vacancies, and level-based salary bands can be managed as durable structure.',
    capabilities: ['Org units and reporting structure', 'Approved positions with incumbents and vacancies', 'Classification levels with start, midpoint, and top-of-range guidance'],
  },
  {
    label: 'Payroll',
    to: '/payroll',
    icon: CreditCard,
    summary: 'Use this workspace for payroll runs, compensation history, and approvals.',
    description: 'Keeping payroll concerns in their own page prevents dashboard code from absorbing finance-specific workflows too early.',
    capabilities: ['Pay period summaries and approvals', 'Compensation changes and audit trail', 'Export-ready payroll batches'],
  },
  {
    label: 'Performance',
    to: '/performance',
    icon: BarChart3,
    summary: 'Performance reviews, goals, and coaching plans can evolve here.',
    description: 'A dedicated route keeps evaluation workflows separate from core HR records while still sharing layouts and controls.',
    capabilities: ['Review cycles and scorecards', 'Goal tracking by employee and team', 'Manager notes and development plans'],
  },
  {
    label: 'Recruitment',
    to: '/recruitment',
    icon: Briefcase,
    summary: 'Hiring pipeline, requisitions, and candidate movement belong in this section.',
    description: 'This is where recruiting-specific entities can grow without crowding core employee modules.',
    capabilities: ['Open requisitions and headcount requests', 'Candidate pipeline tracking', 'Offer approvals and hiring handoff'],
  },
  {
    label: 'Calendar',
    to: '/calendar',
    icon: Calendar,
    summary: 'Leave plans, company events, and HR deadlines can be presented here.',
    description: 'A calendar page gives scheduling a clear boundary and prepares the app for attendance and leave integrations.',
    capabilities: ['Team leave and holiday views', 'Important payroll and review deadlines', 'Department scheduling snapshots'],
  },
  {
    label: 'Reports',
    to: '/reports',
    icon: FileText,
    summary: 'Cross-functional analytics and exports should live in a focused reporting area.',
    description: 'Reports often cut across modules, so it helps to keep them in a shared page instead of scattering them across features.',
    capabilities: ['Headcount and attrition reporting', 'Payroll and budget summaries', 'CSV and PDF exports'],
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: Settings,
    summary: 'Configuration for policies, reference data, and access can be centralized here.',
    description: 'This page is the natural home for administrative controls that support every module.',
    capabilities: ['Reference data and lookup tables', 'Role and permission management', 'Application and integration settings'],
  },
  {
    label: 'Help & Support',
    to: '/help',
    icon: HelpCircle,
    summary: 'Documentation, troubleshooting, and support workflows can be collected here.',
    description: 'A dedicated help area keeps onboarding content and support actions easy to find as the product grows.',
    capabilities: ['Knowledge base and SOP links', 'Support request intake', 'Release notes and product updates'],
  },
];

export const navigationSections: NavigationSection[] = [
  {
    label: 'Main Menu',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      featureRoutes[0],
      featureRoutes[1],
      featureRoutes[2],
    ],
  },
  {
    label: 'Management',
    items: [
      featureRoutes[3],
      featureRoutes[4],
      featureRoutes[5],
      featureRoutes[6],
    ],
  },
  {
    label: 'Support',
    items: [
      featureRoutes[7],
      featureRoutes[8],
    ],
  },
];
