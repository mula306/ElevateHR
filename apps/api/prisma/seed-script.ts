import { Prisma } from '../src/generated/prisma';
import {
  ACCOUNT_QUEUE_ADMIN_REVIEW,
  ACCOUNT_QUEUE_FINANCE,
  ACCOUNT_QUEUE_HRBP,
  ACCOUNT_QUEUE_HR_OPERATIONS,
  ACCOUNT_QUEUE_IT,
} from '../src/shared/lib/accounts';
import { prisma } from '../src/shared/lib/prisma';
import { resolveLearningProviderAdapter } from '../src/shared/lib/learning-providers';
import { LEARNING_SOURCE_MANUAL, LEARNING_SOURCE_RULE, materializeLearningRecordsForSource, syncLearningWorkflowTasks } from '../src/shared/lib/learning-ops';

const orgUnits = [
  { code: 'CORP', name: 'Elevate HR', type: 'Division', parentCode: null },
  { code: 'ENG', name: 'Engineering', type: 'Department', parentCode: 'CORP' },
  { code: 'ENG-PLATFORM', name: 'Platform Engineering', type: 'Unit', parentCode: 'ENG' },
  { code: 'PRODUCT', name: 'Product', type: 'Department', parentCode: 'CORP' },
  { code: 'DESIGN', name: 'Design Studio', type: 'Unit', parentCode: 'PRODUCT' },
  { code: 'SALES', name: 'Sales', type: 'Department', parentCode: 'CORP' },
  { code: 'PEOPLE', name: 'People & Culture', type: 'Department', parentCode: 'CORP' },
  { code: 'FINANCE', name: 'Finance', type: 'Department', parentCode: 'CORP' },
] as const;

const classifications = [
  {
    code: 'ENG-LEAD',
    title: 'Engineering Leadership',
    occupationCode: 'MGT',
    annualHours: 1972,
    family: 'Engineering',
    description: 'Leads engineering departments and approved technical headcount.',
    levels: [
      { levelCode: '12', min: 81.14, mid: 91.28, max: 103.96 },
    ],
  },
  {
    code: 'SWE',
    title: 'Software Engineer',
    occupationCode: 'SIT',
    annualHours: 1972,
    family: 'Engineering',
    description: 'Core software engineering roles aligned to career levels 8 through 10.',
    levels: [
      { levelCode: '8', min: 48.17, mid: 56.8, max: 64.91 },
      { levelCode: '9', min: 55.78, mid: 64.91, max: 73.53 },
      { levelCode: '10', min: 64.91, mid: 75.05, max: 86.21 },
    ],
  },
  {
    code: 'PLATFORM',
    title: 'Platform Engineer',
    occupationCode: 'SIT',
    annualHours: 1972,
    family: 'Engineering',
    description: 'Infrastructure and DevOps positions supporting the platform.',
    levels: [
      { levelCode: '8', min: 49.7, mid: 58.82, max: 66.94 },
      { levelCode: '9', min: 57.81, mid: 66.94, max: 76.06 },
      { levelCode: '10', min: 65.92, mid: 76.06, max: 87.22 },
    ],
  },
  {
    code: 'PM',
    title: 'Product Manager',
    occupationCode: 'PMT',
    annualHours: 1972,
    family: 'Product',
    description: 'Product management roles with standardized product delivery pay ranges.',
    levels: [
      { levelCode: '8', min: 45.64, mid: 53.75, max: 61.87 },
      { levelCode: '9', min: 52.74, mid: 61.36, max: 69.98 },
      { levelCode: '10', min: 60.85, mid: 69.98, max: 80.12 },
    ],
  },
  {
    code: 'DESIGN',
    title: 'Product Designer',
    occupationCode: 'DSN',
    annualHours: 1972,
    family: 'Design',
    description: 'Experience design positions with level-based salary bands.',
    levels: [
      { levelCode: '8', min: 41.58, mid: 47.16, max: 53.75 },
      { levelCode: '9', min: 47.67, mid: 54.26, max: 61.87 },
      { levelCode: '10', min: 54.77, mid: 61.87, max: 70.99 },
    ],
  },
  {
    code: 'AE',
    title: 'Account Executive',
    occupationCode: 'SAL',
    annualHours: 1972,
    family: 'Sales',
    description: 'Quota-carrying sales roles with level-based base pay guidance.',
    levels: [
      { levelCode: '6', min: 31.44, mid: 35.5, max: 39.55 },
      { levelCode: '7', min: 35.5, mid: 40.06, max: 45.13 },
      { levelCode: '8', min: 40.06, mid: 45.13, max: 50.71 },
    ],
  },
  {
    code: 'HRBP',
    title: 'HR Business Partner',
    occupationCode: 'HRS',
    annualHours: 1972,
    family: 'People',
    description: 'People advisory roles supporting managers and workforce planning.',
    levels: [
      { levelCode: '7', min: 38.54, mid: 43.61, max: 49.7 },
      { levelCode: '8', min: 43.61, mid: 49.19, max: 55.78 },
      { levelCode: '9', min: 49.19, mid: 55.27, max: 62.37 },
    ],
  },
  {
    code: 'FIN-ANL',
    title: 'Financial Analyst',
    occupationCode: 'FIN',
    annualHours: 1972,
    family: 'Finance',
    description: 'Financial planning and analysis positions.',
    levels: [
      { levelCode: '7', min: 35.5, mid: 40.06, max: 45.64 },
      { levelCode: '8', min: 40.57, mid: 46.15, max: 52.74 },
      { levelCode: '9', min: 46.65, mid: 52.74, max: 59.84 },
    ],
  },
] as const;

const positions = [
  { positionCode: 'POS-ENG-DIR-001', title: 'Director of Engineering', orgUnitCode: 'ENG', classificationCode: 'ENG-LEAD', levelCode: '12', reportsToPositionCode: null, positionStatus: 'Active' },
  { positionCode: 'POS-ENG-SWE-010', title: 'Senior Software Engineer', orgUnitCode: 'ENG-PLATFORM', classificationCode: 'SWE', levelCode: '10', reportsToPositionCode: 'POS-ENG-DIR-001', positionStatus: 'Active' },
  { positionCode: 'POS-ENG-SWE-009', title: 'Software Engineer', orgUnitCode: 'ENG-PLATFORM', classificationCode: 'SWE', levelCode: '9', reportsToPositionCode: 'POS-ENG-DIR-001', positionStatus: 'Vacant' },
  { positionCode: 'POS-PLT-ENG-010', title: 'DevOps Engineer', orgUnitCode: 'ENG-PLATFORM', classificationCode: 'PLATFORM', levelCode: '10', reportsToPositionCode: 'POS-ENG-DIR-001', positionStatus: 'Active' },
  { positionCode: 'POS-PROD-PM-009', title: 'Product Manager', orgUnitCode: 'PRODUCT', classificationCode: 'PM', levelCode: '9', reportsToPositionCode: null, positionStatus: 'Active' },
  { positionCode: 'POS-DESIGN-UX-008', title: 'UI/UX Designer', orgUnitCode: 'DESIGN', classificationCode: 'DESIGN', levelCode: '8', reportsToPositionCode: 'POS-PROD-PM-009', positionStatus: 'Active' },
  { positionCode: 'POS-SALES-AE-007', title: 'Account Executive', orgUnitCode: 'SALES', classificationCode: 'AE', levelCode: '7', reportsToPositionCode: 'POS-PROD-PM-009', positionStatus: 'Active' },
  { positionCode: 'POS-PEOPLE-HRBP-009', title: 'HR Business Partner', orgUnitCode: 'PEOPLE', classificationCode: 'HRBP', levelCode: '9', reportsToPositionCode: null, positionStatus: 'Active' },
  { positionCode: 'POS-FIN-ANL-008', title: 'Financial Analyst', orgUnitCode: 'FINANCE', classificationCode: 'FIN-ANL', levelCode: '8', reportsToPositionCode: 'POS-PEOPLE-HRBP-009', positionStatus: 'Active' },
  { positionCode: 'POS-FIN-ANL-007', title: 'Financial Analyst', orgUnitCode: 'FINANCE', classificationCode: 'FIN-ANL', levelCode: '7', reportsToPositionCode: 'POS-PEOPLE-HRBP-009', positionStatus: 'Vacant' },
] as const;

const employees = [
  {
    employeeNumber: 'EMP-1001',
    firstName: 'Sarah',
    lastName: 'Chen',
    email: 'sarah.chen@elevatehr.dev',
    phone: '306-555-0101',
    dateOfBirth: new Date('1988-03-15'),
    hireDate: new Date('2021-06-01'),
    jobTitle: 'Director of Engineering',
    department: 'Engineering',
    salary: new Prisma.Decimal(145000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '123 Innovation Drive',
    city: 'Regina',
    province: 'Saskatchewan',
    postalCode: 'S4P 3Y2',
    country: 'Canada',
    emergencyName: 'James Chen',
    emergencyPhone: '306-555-0102',
    emergencyRelation: 'Spouse',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1002',
    firstName: 'Marcus',
    lastName: 'Thompson',
    email: 'marcus.thompson@elevatehr.dev',
    phone: '306-555-0103',
    dateOfBirth: new Date('1992-07-22'),
    hireDate: new Date('2022-01-15'),
    jobTitle: 'Senior Software Engineer',
    department: 'Engineering',
    salary: new Prisma.Decimal(120000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '456 Tech Avenue',
    city: 'Saskatoon',
    province: 'Saskatchewan',
    postalCode: 'S7K 1A1',
    country: 'Canada',
    emergencyName: 'Linda Thompson',
    emergencyPhone: '306-555-0104',
    emergencyRelation: 'Mother',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1003',
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'priya.patel@elevatehr.dev',
    phone: '306-555-0105',
    dateOfBirth: new Date('1995-11-08'),
    hireDate: new Date('2023-03-20'),
    jobTitle: 'UI/UX Designer',
    department: 'Design',
    salary: new Prisma.Decimal(88000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '789 Creative Blvd',
    city: 'Regina',
    province: 'Saskatchewan',
    postalCode: 'S4S 5W6',
    country: 'Canada',
    emergencyName: 'Raj Patel',
    emergencyPhone: '306-555-0106',
    emergencyRelation: 'Father',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1004',
    firstName: 'Alex',
    lastName: 'Moreau',
    email: 'alex.moreau@elevatehr.dev',
    phone: '306-555-0107',
    dateOfBirth: new Date('1990-01-30'),
    hireDate: new Date('2020-09-14'),
    jobTitle: 'Product Manager',
    department: 'Product',
    salary: new Prisma.Decimal(110000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '321 Market Street',
    city: 'Regina',
    province: 'Saskatchewan',
    postalCode: 'S4P 1Z5',
    country: 'Canada',
    emergencyName: 'Claire Moreau',
    emergencyPhone: '306-555-0108',
    emergencyRelation: 'Spouse',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1005',
    firstName: 'Jordan',
    lastName: 'Williams',
    email: 'jordan.williams@elevatehr.dev',
    phone: '306-555-0109',
    dateOfBirth: new Date('1997-05-12'),
    hireDate: new Date('2024-11-01'),
    jobTitle: 'Account Executive',
    department: 'Sales',
    salary: new Prisma.Decimal(72000),
    payFrequency: 'Biweekly',
    status: 'Probation',
    addressLine1: '654 Commerce Road',
    city: 'Saskatoon',
    province: 'Saskatchewan',
    postalCode: 'S7N 0X1',
    country: 'Canada',
    emergencyName: 'Morgan Williams',
    emergencyPhone: '306-555-0110',
    emergencyRelation: 'Sibling',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1006',
    firstName: 'Elena',
    lastName: 'Kowalski',
    email: 'elena.kowalski@elevatehr.dev',
    phone: '306-555-0111',
    dateOfBirth: new Date('1985-09-25'),
    hireDate: new Date('2019-04-01'),
    jobTitle: 'HR Business Partner',
    department: 'People & Culture',
    salary: new Prisma.Decimal(95000),
    payFrequency: 'Biweekly',
    status: 'On Leave',
    addressLine1: '987 People Place',
    city: 'Regina',
    province: 'Saskatchewan',
    postalCode: 'S4R 8T2',
    country: 'Canada',
    emergencyName: 'Peter Kowalski',
    emergencyPhone: '306-555-0112',
    emergencyRelation: 'Spouse',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1007',
    firstName: 'David',
    lastName: 'Blackwood',
    email: 'david.blackwood@elevatehr.dev',
    phone: '306-555-0113',
    dateOfBirth: new Date('1993-12-03'),
    hireDate: new Date('2022-07-18'),
    jobTitle: 'DevOps Engineer',
    department: 'Engineering',
    salary: new Prisma.Decimal(115000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '159 Server Lane',
    city: 'Saskatoon',
    province: 'Saskatchewan',
    postalCode: 'S7H 4K3',
    country: 'Canada',
    emergencyName: 'Karen Blackwood',
    emergencyPhone: '306-555-0114',
    emergencyRelation: 'Mother',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    employeeNumber: 'EMP-1008',
    firstName: 'Fatima',
    lastName: 'Hassan',
    email: 'fatima.hassan@elevatehr.dev',
    phone: '306-555-0115',
    dateOfBirth: new Date('1991-06-18'),
    hireDate: new Date('2023-01-09'),
    jobTitle: 'Financial Analyst',
    department: 'Finance',
    salary: new Prisma.Decimal(82000),
    payFrequency: 'Biweekly',
    status: 'Active',
    addressLine1: '753 Ledger Avenue',
    city: 'Regina',
    province: 'Saskatchewan',
    postalCode: 'S4T 6R1',
    country: 'Canada',
    emergencyName: 'Ahmed Hassan',
    emergencyPhone: '306-555-0116',
    emergencyRelation: 'Spouse',
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
] as const;

const employeePositionAssignments = [
  ['sarah.chen@elevatehr.dev', 'POS-ENG-DIR-001'],
  ['marcus.thompson@elevatehr.dev', 'POS-ENG-SWE-010'],
  ['priya.patel@elevatehr.dev', 'POS-DESIGN-UX-008'],
  ['alex.moreau@elevatehr.dev', 'POS-PROD-PM-009'],
  ['jordan.williams@elevatehr.dev', 'POS-SALES-AE-007'],
  ['elena.kowalski@elevatehr.dev', 'POS-PEOPLE-HRBP-009'],
  ['david.blackwood@elevatehr.dev', 'POS-PLT-ENG-010'],
  ['fatima.hassan@elevatehr.dev', 'POS-FIN-ANL-008'],
] as const;

const appAccounts = [
  {
    email: 'sarah.chen@elevatehr.dev',
    displayName: 'Sarah Chen',
    employeeEmail: 'sarah.chen@elevatehr.dev',
    entraObjectId: 'entra-sarah-chen',
    queueKeys: [ACCOUNT_QUEUE_ADMIN_REVIEW],
  },
  {
    email: 'marcus.thompson@elevatehr.dev',
    displayName: 'Marcus Thompson',
    employeeEmail: 'marcus.thompson@elevatehr.dev',
    entraObjectId: 'entra-marcus-thompson',
    queueKeys: [],
  },
  {
    email: 'priya.patel@elevatehr.dev',
    displayName: 'Priya Patel',
    employeeEmail: 'priya.patel@elevatehr.dev',
    entraObjectId: 'entra-priya-patel',
    queueKeys: [],
  },
  {
    email: 'alex.moreau@elevatehr.dev',
    displayName: 'Alex Moreau',
    employeeEmail: 'alex.moreau@elevatehr.dev',
    entraObjectId: 'entra-alex-moreau',
    queueKeys: [],
  },
  {
    email: 'jordan.williams@elevatehr.dev',
    displayName: 'Jordan Williams',
    employeeEmail: 'jordan.williams@elevatehr.dev',
    entraObjectId: 'entra-jordan-williams',
    queueKeys: [],
  },
  {
    email: 'elena.kowalski@elevatehr.dev',
    displayName: 'Elena Kowalski',
    employeeEmail: 'elena.kowalski@elevatehr.dev',
    entraObjectId: 'entra-elena-kowalski',
    queueKeys: [ACCOUNT_QUEUE_HR_OPERATIONS, ACCOUNT_QUEUE_HRBP],
  },
  {
    email: 'david.blackwood@elevatehr.dev',
    displayName: 'David Blackwood',
    employeeEmail: 'david.blackwood@elevatehr.dev',
    entraObjectId: 'entra-david-blackwood',
    queueKeys: [ACCOUNT_QUEUE_IT],
  },
  {
    email: 'fatima.hassan@elevatehr.dev',
    displayName: 'Fatima Hassan',
    employeeEmail: 'fatima.hassan@elevatehr.dev',
    entraObjectId: 'entra-fatima-hassan',
    queueKeys: [ACCOUNT_QUEUE_FINANCE],
  },
  {
    email: 'hr.admin@elevatehr.dev',
    displayName: 'HR Operations Admin',
    employeeEmail: null,
    entraObjectId: 'entra-hr-admin',
    queueKeys: [ACCOUNT_QUEUE_HR_OPERATIONS, ACCOUNT_QUEUE_IT, ACCOUNT_QUEUE_ADMIN_REVIEW],
  },
] as const;

const managerAssignments = [
  ['marcus.thompson@elevatehr.dev', 'sarah.chen@elevatehr.dev'],
  ['david.blackwood@elevatehr.dev', 'sarah.chen@elevatehr.dev'],
  ['priya.patel@elevatehr.dev', 'alex.moreau@elevatehr.dev'],
  ['jordan.williams@elevatehr.dev', 'alex.moreau@elevatehr.dev'],
  ['fatima.hassan@elevatehr.dev', 'elena.kowalski@elevatehr.dev'],
] as const;

const leaveTypes = [
  { code: 'VAC', name: 'Vacation', description: 'Planned paid time away', accentColor: '#0098DB' },
  { code: 'SICK', name: 'Sick', description: 'Illness or wellness recovery time', accentColor: '#F59E0B' },
  { code: 'PERS', name: 'Personal', description: 'Personal or family matter leave', accentColor: '#58A618' },
  { code: 'UNPD', name: 'Unpaid', description: 'Approved unpaid leave', accentColor: '#475569' },
] as const;

const holidays = [
  { name: 'Good Friday', holidayDate: new Date('2026-04-03'), note: 'Company holiday' },
  { name: 'Victoria Day', holidayDate: new Date('2026-05-18'), note: 'Company holiday' },
  { name: 'Canada Day', holidayDate: new Date('2026-07-01'), note: 'Company holiday' },
] as const;

const laborGroups = [
  { code: 'UNION-OPS', name: 'Union Operations', agreementReference: 'CUPE Local 120', description: 'Hourly operations and support employees governed by union overtime and rest rules.' },
  { code: 'EXEMPT-PROF', name: 'Exempt Professional', agreementReference: 'Management policy', description: 'Exempt and professional employees using standard salaried workforce rules.' },
] as const;

const checklistTemplates = [
  {
    code: 'ONBOARD-CORE',
    name: 'Core onboarding',
    lifecycleType: 'Onboarding',
    description: 'Standard onboarding sequence for new hires.',
    items: [
      { title: 'Provision system access', ownerLabel: 'IT', dueDaysOffset: 0, sortOrder: 0 },
      { title: 'Complete payroll and policy setup', ownerLabel: 'HR Operations', dueDaysOffset: 1, sortOrder: 1 },
      { title: 'Schedule manager introduction', ownerLabel: 'Manager', dueDaysOffset: 2, sortOrder: 2 },
    ],
  },
  {
    code: 'OFFBOARD-CORE',
    name: 'Core offboarding',
    lifecycleType: 'Offboarding',
    description: 'Standard offboarding sequence for departures.',
    items: [
      { title: 'Disable access and collect equipment', ownerLabel: 'IT', dueDaysOffset: 0, sortOrder: 0 },
      { title: 'Finalize payroll and benefits', ownerLabel: 'HR Operations', dueDaysOffset: 1, sortOrder: 1 },
      { title: 'Conduct handoff and exit conversation', ownerLabel: 'Manager', dueDaysOffset: 2, sortOrder: 2 },
    ],
  },
] as const;

const documentCategories = [
  { code: 'POLICY', name: 'Policy', description: 'Policy acknowledgment and handbook records' },
  { code: 'CONTRACT', name: 'Contract', description: 'Employment agreements and change letters' },
  { code: 'CERT', name: 'Certification', description: 'Compliance and professional certifications' },
] as const;

const documentTemplates = [
  { code: 'EMP-HANDBOOK', name: 'Employee handbook acknowledgment', categoryCode: 'POLICY', requiresAcknowledgement: true, defaultExpiryDays: null },
  { code: 'REMOTE-WORK', name: 'Remote work policy', categoryCode: 'POLICY', requiresAcknowledgement: true, defaultExpiryDays: null },
  { code: 'EMP-OFFER', name: 'Offer letter', categoryCode: 'CONTRACT', requiresAcknowledgement: false, defaultExpiryDays: null },
  { code: 'SEC-TRAIN', name: 'Security training certificate', categoryCode: 'CERT', requiresAcknowledgement: false, defaultExpiryDays: 365 },
] as const;

const reviewSectionDefinitions = [
  { sectionKey: 'achievements', sectionTitle: 'Achievements' },
  { sectionKey: 'strengths', sectionTitle: 'Strengths' },
  { sectionKey: 'growth_focus', sectionTitle: 'Growth Focus' },
  { sectionKey: 'development_actions', sectionTitle: 'Development Actions' },
] as const;

const learningProviders = [
  {
    code: 'SKILLSTREAM-CORE',
    displayName: 'Skillstream Core',
    providerType: 'ExternalCatalog',
    syncMode: 'Manual',
    defaultLaunchBaseUrl: 'https://content.skillstream.elevatehr.dev',
    connectionMetadata: JSON.stringify({ catalogPreset: 'skillstream-core' }),
  },
] as const;

const learningPaths = [
  {
    code: 'LEARN-CORE-COMPLIANCE',
    name: 'Core Compliance Foundations',
    description: 'Baseline compliance learning for broad employee populations.',
    itemProviderContentIds: ['cyber-essentials-2026', 'privacy-data-handling'],
  },
  {
    code: 'LEARN-MANAGER-READY',
    name: 'Manager Readiness',
    description: 'Manager capability building for coaching and people leadership fundamentals.',
    itemProviderContentIds: ['mgr-coaching-foundations', 'privacy-data-handling'],
  },
] as const;

const skillCategories = [
  {
    code: 'TECH',
    name: 'Technical',
    description: 'Core technical capabilities used across engineering and platform roles.',
    displayOrder: 0,
    tags: [
      { code: 'TS', name: 'TypeScript', description: 'Application development in TypeScript.', displayOrder: 0 },
      { code: 'DEVOPS', name: 'DevOps', description: 'Infrastructure automation and deployment practices.', displayOrder: 1 },
      { code: 'ACCESSIBILITY', name: 'Accessibility', description: 'Inclusive digital experience design and delivery.', displayOrder: 2 },
    ],
  },
  {
    code: 'LEAD',
    name: 'Leadership',
    description: 'People leadership and coaching capabilities.',
    displayOrder: 1,
    tags: [
      { code: 'COACHING', name: 'Coaching', description: 'Ongoing coaching and feedback capability.', displayOrder: 0 },
      { code: 'FACILITATION', name: 'Facilitation', description: 'Leading discussions and working sessions effectively.', displayOrder: 1 },
    ],
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'Customer, product, and business operations capabilities.',
    displayOrder: 2,
    tags: [
      { code: 'DISCOVERY', name: 'Discovery', description: 'Research and problem discovery with users and stakeholders.', displayOrder: 0 },
      { code: 'FIN_CONTROL', name: 'Financial Controls', description: 'Internal control discipline and financial review practices.', displayOrder: 1 },
      { code: 'SALES_EXEC', name: 'Sales Execution', description: 'Pipeline, qualification, and structured customer engagement.', displayOrder: 2 },
    ],
  },
] as const;

const recruitmentRequestTypes = [
  {
    code: 'NET_NEW',
    name: 'Net new position',
    description: 'Request to create a new approved position and associated headcount.',
    fieldSchema: JSON.stringify([
      { key: 'requestedStartDate', label: 'Requested start date', type: 'date', required: true },
      { key: 'workLocation', label: 'Primary work location', type: 'text', required: false },
    ]),
  },
  {
    code: 'BACKFILL',
    name: 'Backfill',
    description: 'Request to refill an existing position because of turnover or reassignment.',
    fieldSchema: JSON.stringify([
      { key: 'vacancyReason', label: 'Vacancy reason', type: 'text', required: true },
      { key: 'departureDate', label: 'Departure date', type: 'date', required: false },
    ]),
  },
  {
    code: 'TEMP_FILL',
    name: 'Temporary fill',
    description: 'Request for short-term coverage tied to leave, project work, or seasonal demand.',
    fieldSchema: JSON.stringify([
      { key: 'coverageEndDate', label: 'Coverage end date', type: 'date', required: true },
      { key: 'coverageReason', label: 'Coverage reason', type: 'text', required: true },
    ]),
  },
] as const;

const recruitmentFundingTypes = [
  {
    code: 'PERM',
    name: 'Permanent base funding',
    category: 'Operating',
    description: 'Permanent operating budget funding.',
    durationType: 'Permanent',
    isPermanent: true,
  },
  {
    code: 'TEMP',
    name: 'Temporary operating funding',
    category: 'Operating',
    description: 'Temporary operating funding for defined-term or backfill needs.',
    durationType: 'Temporary',
    isPermanent: false,
  },
  {
    code: 'GRANT',
    name: 'Grant funded',
    category: 'Restricted',
    description: 'Funding tied to external or time-limited grant support.',
    durationType: 'Fixed Term',
    isPermanent: false,
  },
] as const;

function parseEmployeeNumber(employeeNumber: string): number {
  const match = employeeNumber.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1000;
}

function addUtcDays(date: Date, offset: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + offset,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

async function seedOrgUnits() {
  const orgUnitByCode = new Map<string, string>();

  for (const unit of orgUnits.filter((candidate) => candidate.parentCode === null)) {
    const result = await prisma.orgUnit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        type: unit.type,
        parentId: null,
        recordStatus: 'Active',
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      create: {
        code: unit.code,
        name: unit.name,
        type: unit.type,
        parentId: null,
        recordStatus: 'Active',
      },
    });
    orgUnitByCode.set(unit.code, result.id);
  }

  for (const unit of orgUnits.filter((candidate) => candidate.parentCode !== null)) {
    const parentId = orgUnitByCode.get(unit.parentCode!);
    if (!parentId) {
      continue;
    }

    const result = await prisma.orgUnit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        type: unit.type,
        parentId,
        recordStatus: 'Active',
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      create: {
        code: unit.code,
        name: unit.name,
        type: unit.type,
        parentId,
        recordStatus: 'Active',
      },
    });
    orgUnitByCode.set(unit.code, result.id);
  }

  return orgUnitByCode;
}

async function seedClassifications() {
  const classificationByCode = new Map<string, string>();
  const levelByKey = new Map<string, string>();

  for (const classification of classifications) {
    const savedClassification = await prisma.jobClassification.upsert({
      where: { code: classification.code },
      update: {
        title: classification.title,
        occupationCode: classification.occupationCode,
        annualHours: classification.annualHours,
        family: classification.family,
        description: classification.description,
        recordStatus: 'Active',
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      create: {
        code: classification.code,
        title: classification.title,
        occupationCode: classification.occupationCode,
        annualHours: classification.annualHours,
        family: classification.family,
        description: classification.description,
        recordStatus: 'Active',
      },
    });

    classificationByCode.set(classification.code, savedClassification.id);

    for (const level of classification.levels) {
      const savedLevel = await prisma.positionLevel.upsert({
        where: {
          classificationId_levelCode: {
            classificationId: savedClassification.id,
            levelCode: level.levelCode,
          },
        },
        update: {
          currency: 'CAD',
          rangeMin: new Prisma.Decimal(level.min),
          rangeMid: new Prisma.Decimal(level.mid),
          rangeMax: new Prisma.Decimal(level.max),
          recordStatus: 'Active',
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
        create: {
          classificationId: savedClassification.id,
          levelCode: level.levelCode,
          currency: 'CAD',
          rangeMin: new Prisma.Decimal(level.min),
          rangeMid: new Prisma.Decimal(level.mid),
          rangeMax: new Prisma.Decimal(level.max),
          recordStatus: 'Active',
        },
      });

      levelByKey.set(`${classification.code}:${level.levelCode}`, savedLevel.id);
    }
  }

  return { classificationByCode, levelByKey };
}

async function seedPositions(orgUnitByCode: Map<string, string>, classificationByCode: Map<string, string>, levelByKey: Map<string, string>) {
  const positionByCode = new Map<string, string>();

  for (const position of positions) {
    const orgUnitId = orgUnitByCode.get(position.orgUnitCode);
    const classificationId = classificationByCode.get(position.classificationCode);
    const levelId = levelByKey.get(`${position.classificationCode}:${position.levelCode}`);

    if (!orgUnitId || !classificationId || !levelId) {
      continue;
    }

    const savedPosition = await prisma.position.upsert({
      where: { positionCode: position.positionCode },
      update: {
        title: position.title,
        orgUnitId,
        classificationId,
        levelId,
        positionStatus: position.positionStatus,
        headcount: 1,
        fte: new Prisma.Decimal(1),
        weeklyHours: new Prisma.Decimal(40),
        fundingTypeId: null,
        budgetImpacting: false,
        lastApprovedRequestId: null,
        currentCompetitionNumber: null,
        reportsToPositionId: null,
        recordStatus: 'Active',
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      create: {
        positionCode: position.positionCode,
        title: position.title,
        orgUnitId,
        classificationId,
        levelId,
        positionStatus: position.positionStatus,
        headcount: 1,
        fte: new Prisma.Decimal(1),
        weeklyHours: new Prisma.Decimal(40),
        fundingTypeId: null,
        budgetImpacting: false,
        lastApprovedRequestId: null,
        currentCompetitionNumber: null,
        reportsToPositionId: null,
        recordStatus: 'Active',
      },
    });

    positionByCode.set(position.positionCode, savedPosition.id);
  }

  for (const position of positions) {
    if (!position.reportsToPositionCode) {
      continue;
    }

    const positionId = positionByCode.get(position.positionCode);
    const reportsToPositionId = positionByCode.get(position.reportsToPositionCode);

    if (!positionId || !reportsToPositionId) {
      continue;
    }

    await prisma.position.update({
      where: { id: positionId },
      data: { reportsToPositionId },
    });
  }

  return positionByCode;
}

async function seedEmployees(positionByCode: Map<string, string>) {
  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { employeeNumber: employee.employeeNumber },
      update: employee,
      create: employee,
    });
  }

  const employeeDirectory = await prisma.employee.findMany({
    select: { id: true, email: true },
  });

  const employeeByEmail = new Map(employeeDirectory.map((employee) => [employee.email, employee.id]));

  for (const [employeeEmail, managerEmail] of managerAssignments) {
    const employeeId = employeeByEmail.get(employeeEmail);
    const managerId = employeeByEmail.get(managerEmail);

    if (!employeeId || !managerId) {
      continue;
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { managerId },
    });
  }

  for (const [employeeEmail, positionCode] of employeePositionAssignments) {
    const employeeId = employeeByEmail.get(employeeEmail);
    const positionId = positionByCode.get(positionCode);

    if (!employeeId || !positionId) {
      continue;
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: { positionId },
    });
  }

  const currentEmployeeNumber = employees.reduce((highest, employee) => {
    return Math.max(highest, parseEmployeeNumber(employee.employeeNumber));
  }, 1000);

  await prisma.sequence.upsert({
    where: { key: 'employee_number' },
    update: { currentValue: currentEmployeeNumber },
    create: { key: 'employee_number', currentValue: currentEmployeeNumber },
  });

  return employeeByEmail;
}

async function seedAppAccounts(employeeByEmail: Map<string, string>) {
  const accountByEmail = new Map<string, string>();

  for (const account of appAccounts) {
    const employeeId = account.employeeEmail ? employeeByEmail.get(account.employeeEmail) ?? null : null;
    const savedAccount = await prisma.appAccount.upsert({
      where: { email: account.email },
      update: {
        entraObjectId: account.entraObjectId,
        displayName: account.displayName,
        employeeId,
        status: 'Active',
        lastSignedInAt: new Date('2026-03-18T09:00:00Z'),
      },
      create: {
        email: account.email,
        entraObjectId: account.entraObjectId,
        displayName: account.displayName,
        employeeId,
        status: 'Active',
        lastSignedInAt: new Date('2026-03-18T09:00:00Z'),
      },
    });

    accountByEmail.set(account.email, savedAccount.id);

    await prisma.accountQueueMembership.deleteMany({
      where: { accountId: savedAccount.id },
    });

    for (const queueKey of account.queueKeys) {
      await prisma.accountQueueMembership.create({
        data: {
          accountId: savedAccount.id,
          queueKey,
        },
      });
    }
  }

  return accountByEmail;
}

async function seedTimeOffReferenceData() {
  const leaveTypeByCode = new Map<string, string>();

  for (const leaveType of leaveTypes) {
    const savedLeaveType = await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      update: {
        name: leaveType.name,
        description: leaveType.description,
        accentColor: leaveType.accentColor,
        isActive: true,
      },
      create: {
        code: leaveType.code,
        name: leaveType.name,
        description: leaveType.description,
        accentColor: leaveType.accentColor,
        isActive: true,
      },
    });
    leaveTypeByCode.set(leaveType.code, savedLeaveType.id);
  }

  await prisma.holiday.deleteMany();
  for (const holiday of holidays) {
    await prisma.holiday.create({
      data: holiday,
    });
  }

  return leaveTypeByCode;
}

async function seedChecklistTemplates() {
  const templateByCode = new Map<string, string>();

  for (const template of checklistTemplates) {
    const savedTemplate = await prisma.checklistTemplate.upsert({
      where: { code: template.code },
      update: {
        name: template.name,
        lifecycleType: template.lifecycleType,
        description: template.description,
        isActive: true,
      },
      create: {
        code: template.code,
        name: template.name,
        lifecycleType: template.lifecycleType,
        description: template.description,
        isActive: true,
      },
    });

    templateByCode.set(template.code, savedTemplate.id);
    await prisma.checklistTemplateItem.deleteMany({
      where: { templateId: savedTemplate.id },
    });

    for (const item of template.items) {
      await prisma.checklistTemplateItem.create({
        data: {
          templateId: savedTemplate.id,
          title: item.title,
          ownerLabel: item.ownerLabel,
          dueDaysOffset: item.dueDaysOffset,
          sortOrder: item.sortOrder,
          isRequired: true,
        },
      });
    }
  }

  return templateByCode;
}

async function seedDocumentReferenceData() {
  const categoryByCode = new Map<string, string>();
  const templateByCode = new Map<string, string>();

  for (const category of documentCategories) {
    const savedCategory = await prisma.documentCategory.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
      create: {
        code: category.code,
        name: category.name,
        description: category.description,
        isActive: true,
      },
    });

    categoryByCode.set(category.code, savedCategory.id);
  }

  for (const template of documentTemplates) {
    const categoryId = categoryByCode.get(template.categoryCode);
    if (!categoryId) {
      continue;
    }

    const savedTemplate = await prisma.documentTemplate.upsert({
      where: { code: template.code },
      update: {
        categoryId,
        name: template.name,
        requiresAcknowledgement: template.requiresAcknowledgement,
        defaultExpiryDays: template.defaultExpiryDays,
        isActive: true,
      },
      create: {
        code: template.code,
        categoryId,
        name: template.name,
        requiresAcknowledgement: template.requiresAcknowledgement,
        defaultExpiryDays: template.defaultExpiryDays,
        isActive: true,
      },
    });

    templateByCode.set(template.code, savedTemplate.id);
  }

  return { categoryByCode, templateByCode };
}

async function resetOperationalData() {
  await prisma.position.updateMany({
    data: {
      fundingTypeId: null,
      budgetImpacting: false,
      lastApprovedRequestId: null,
      currentCompetitionNumber: null,
    },
  });
  await prisma.employeeSnapshot.deleteMany();
  await prisma.hiringRecord.deleteMany();
  await prisma.jobRequestApprovalDecision.deleteMany();
  await prisma.jobRequestApprovalStep.deleteMany();
  await prisma.jobRequestStatusHistory.deleteMany();
  await prisma.jobRequestFieldValue.deleteMany();
  await prisma.jobRequest.deleteMany();
  await prisma.approvalRuleStep.deleteMany();
  await prisma.approvalRule.deleteMany();
  await prisma.approvalRuleSet.deleteMany();
  await prisma.jobRequestType.deleteMany();
  await prisma.fundingType.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.timeCard.deleteMany();
  await prisma.scheduledShift.deleteMany();
  await prisma.workSchedule.deleteMany();
  await prisma.learningContentSkill.deleteMany();
  await prisma.learningRecord.deleteMany();
  await prisma.learningAssignmentRule.deleteMany();
  await prisma.learningAssignment.deleteMany();
  await prisma.learningPathItem.deleteMany();
  await prisma.learningPath.deleteMany();
  await prisma.learningContent.deleteMany();
  await prisma.learningSyncRun.deleteMany();
  await prisma.learningProvider.deleteMany();
  await prisma.employeeSkill.deleteMany();
  await prisma.skillTag.deleteMany();
  await prisma.skillCategory.deleteMany();
  await prisma.performanceGoalUpdate.deleteMany();
  await prisma.performanceReviewSection.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.performanceGoal.deleteMany();
  await prisma.performanceCycle.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.workflowTask.deleteMany();
  await prisma.documentAcknowledgment.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.employeeChecklist.deleteMany();
  await prisma.leaveRequest.deleteMany();
}

async function seedLeaveRequests(employeeByEmail: Map<string, string>, leaveTypeByCode: Map<string, string>) {
  const jordanId = employeeByEmail.get('jordan.williams@elevatehr.dev');
  const elenaId = employeeByEmail.get('elena.kowalski@elevatehr.dev');
  const marcusId = employeeByEmail.get('marcus.thompson@elevatehr.dev');
  const alexId = employeeByEmail.get('alex.moreau@elevatehr.dev');
  const priyaId = employeeByEmail.get('priya.patel@elevatehr.dev');
  const sarahId = employeeByEmail.get('sarah.chen@elevatehr.dev');

  const vacationId = leaveTypeByCode.get('VAC');
  const sickId = leaveTypeByCode.get('SICK');
  const personalId = leaveTypeByCode.get('PERS');

  if (!vacationId || !sickId || !personalId) {
    return;
  }

  const leaveRequestsToCreate = [
    {
      employeeId: jordanId,
      approverId: alexId ?? null,
      leaveTypeId: vacationId,
      startDate: new Date('2026-04-20'),
      endDate: new Date('2026-04-24'),
      requestedHours: new Prisma.Decimal(40),
      status: 'Pending',
      notes: 'Family travel',
    },
    {
      employeeId: marcusId,
      approverId: sarahId ?? null,
      leaveTypeId: sickId,
      startDate: new Date('2026-03-24'),
      endDate: new Date('2026-03-25'),
      requestedHours: new Prisma.Decimal(16),
      status: 'Approved',
      notes: 'Medical appointment and recovery',
      decisionComment: 'Approved',
      respondedAt: new Date('2026-03-14'),
    },
    {
      employeeId: priyaId,
      approverId: alexId ?? null,
      leaveTypeId: personalId,
      startDate: new Date('2026-04-09'),
      endDate: new Date('2026-04-09'),
      requestedHours: new Prisma.Decimal(8),
      status: 'Approved',
      notes: 'Personal day',
      decisionComment: 'Approved',
      respondedAt: new Date('2026-03-10'),
    },
    {
      employeeId: elenaId,
      approverId: null,
      leaveTypeId: vacationId,
      startDate: new Date('2026-05-04'),
      endDate: new Date('2026-05-08'),
      requestedHours: new Prisma.Decimal(40),
      status: 'Pending',
      notes: 'Planned break',
    },
  ].filter((candidate): candidate is NonNullable<typeof candidate> & { employeeId: string } => Boolean(candidate.employeeId));

  for (const leaveRequest of leaveRequestsToCreate) {
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: leaveRequest.employeeId },
      select: { id: true, firstName: true, lastName: true },
    });
    const leaveType = await prisma.leaveType.findUniqueOrThrow({
      where: { id: leaveRequest.leaveTypeId },
      select: { name: true },
    });
    const createdLeaveRequest = await prisma.leaveRequest.create({
      data: {
        ...leaveRequest,
        createdBy: 'seed-script',
        updatedBy: 'seed-script',
      },
    });

    await prisma.workflowTask.create({
      data: {
        taskType: 'LeaveApproval',
        title: `${employee.firstName} ${employee.lastName}: ${leaveType.name} request`,
        description: 'Seeded leave approval task',
        status: leaveRequest.status === 'Pending' ? 'Open' : 'Completed',
        priority: 'Normal',
        dueDate: leaveRequest.startDate,
        ownerEmployeeId: leaveRequest.approverId,
        ownerLabel: leaveRequest.approverId ? 'Manager' : 'HR Operations',
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: createdLeaveRequest.id,
        completedAt: leaveRequest.status === 'Pending' ? null : new Date(),
      },
    });
  }
}

async function seedTimeAttendance(
  employeeByEmail: Map<string, string>,
  orgUnitByCode: Map<string, string>,
  classificationByCode: Map<string, string>,
) {
  const currentPeriodStart = new Date('2026-03-16T00:00:00Z');
  const currentPeriodEnd = new Date('2026-03-29T23:59:59Z');
  const previousPeriodStart = new Date('2026-03-02T00:00:00Z');
  const previousPeriodEnd = new Date('2026-03-15T23:59:59Z');

  const laborGroupByCode = new Map<string, string>();

  for (const seed of laborGroups) {
    const laborGroup = await prisma.laborGroup.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        agreementReference: seed.agreementReference,
        description: seed.description,
        status: 'Active',
      },
      create: {
        code: seed.code,
        name: seed.name,
        agreementReference: seed.agreementReference,
        description: seed.description,
        status: 'Active',
      },
    });

    laborGroupByCode.set(seed.code, laborGroup.id);
  }

  const exemptLaborGroupId = laborGroupByCode.get('EXEMPT-PROF') ?? null;
  const unionLaborGroupId = laborGroupByCode.get('UNION-OPS') ?? null;

  await prisma.employee.updateMany({
    where: { email: { in: ['sarah.chen@elevatehr.dev', 'marcus.thompson@elevatehr.dev', 'david.blackwood@elevatehr.dev', 'alex.moreau@elevatehr.dev'] } },
    data: { laborGroupId: exemptLaborGroupId },
  });

  await prisma.employee.updateMany({
    where: { email: { in: ['jordan.williams@elevatehr.dev', 'fatima.hassan@elevatehr.dev', 'priya.patel@elevatehr.dev', 'elena.kowalski@elevatehr.dev'] } },
    data: { laborGroupId: unionLaborGroupId },
  });

  const engineeringRule = await prisma.workRuleProfile.upsert({
    where: { code: 'WRP-ENG-STD' },
    update: {
      name: 'Engineering Standard',
      status: 'Active',
      laborGroupId: exemptLaborGroupId,
      orgUnitId: orgUnitByCode.get('ENG') ?? null,
      dailyOvertimeThreshold: new Prisma.Decimal(8),
      weeklyOvertimeThreshold: new Prisma.Decimal(40),
      minimumRestHours: new Prisma.Decimal(8),
      scheduledDailyHoursTarget: new Prisma.Decimal(8),
      shiftPremiumRules: 'Evening premium after 18:00 for approved shift templates.',
      holidayTreatment: 'Company holiday hours tracked separately.',
      leaveTreatment: 'Approved leave converts overlapping scheduled hours into leave-coded entries.',
    },
    create: {
      code: 'WRP-ENG-STD',
      name: 'Engineering Standard',
      status: 'Active',
      laborGroupId: exemptLaborGroupId,
      orgUnitId: orgUnitByCode.get('ENG') ?? null,
      dailyOvertimeThreshold: new Prisma.Decimal(8),
      weeklyOvertimeThreshold: new Prisma.Decimal(40),
      minimumRestHours: new Prisma.Decimal(8),
      scheduledDailyHoursTarget: new Prisma.Decimal(8),
      shiftPremiumRules: 'Evening premium after 18:00 for approved shift templates.',
      holidayTreatment: 'Company holiday hours tracked separately.',
      leaveTreatment: 'Approved leave converts overlapping scheduled hours into leave-coded entries.',
    },
  });

  const operationsRule = await prisma.workRuleProfile.upsert({
    where: { code: 'WRP-OPS-UNION' },
    update: {
      name: 'Union Operations',
      status: 'Active',
      laborGroupId: unionLaborGroupId,
      classificationId: classificationByCode.get('AE') ?? null,
      dailyOvertimeThreshold: new Prisma.Decimal(8),
      weeklyOvertimeThreshold: new Prisma.Decimal(40),
      doubleTimeThreshold: new Prisma.Decimal(12),
      minimumRestHours: new Prisma.Decimal(10),
      scheduledDailyHoursTarget: new Prisma.Decimal(7.5),
      shiftPremiumRules: 'Weekend shifts qualify for a premium marker.',
      holidayTreatment: 'Holiday coverage retains holiday-coded hours and exception flags.',
      leaveTreatment: 'Leave hours replace scheduled hours before overtime review.',
    },
    create: {
      code: 'WRP-OPS-UNION',
      name: 'Union Operations',
      status: 'Active',
      laborGroupId: unionLaborGroupId,
      classificationId: classificationByCode.get('AE') ?? null,
      dailyOvertimeThreshold: new Prisma.Decimal(8),
      weeklyOvertimeThreshold: new Prisma.Decimal(40),
      doubleTimeThreshold: new Prisma.Decimal(12),
      minimumRestHours: new Prisma.Decimal(10),
      scheduledDailyHoursTarget: new Prisma.Decimal(7.5),
      shiftPremiumRules: 'Weekend shifts qualify for a premium marker.',
      holidayTreatment: 'Holiday coverage retains holiday-coded hours and exception flags.',
      leaveTreatment: 'Leave hours replace scheduled hours before overtime review.',
    },
  });

  const platformOrgUnitId = orgUnitByCode.get('ENG-PLATFORM') ?? '';
  const salesOrgUnitId = orgUnitByCode.get('SALES') ?? '';
  const platformDayShift = await prisma.shiftTemplate.upsert({
    where: { orgUnitId_code: { orgUnitId: platformOrgUnitId, code: 'DAY-ENG' } },
    update: {
      workRuleProfileId: engineeringRule.id,
      name: 'Platform Day Shift',
      startTime: '08:00',
      endTime: '16:30',
      unpaidBreakMinutes: 30,
      paidBreakMinutes: 0,
      status: 'Active',
    },
    create: {
      orgUnitId: platformOrgUnitId,
      workRuleProfileId: engineeringRule.id,
      code: 'DAY-ENG',
      name: 'Platform Day Shift',
      startTime: '08:00',
      endTime: '16:30',
      unpaidBreakMinutes: 30,
      paidBreakMinutes: 0,
      status: 'Active',
    },
  });

  const salesShift = await prisma.shiftTemplate.upsert({
    where: { orgUnitId_code: { orgUnitId: salesOrgUnitId, code: 'DAY-SALES' } },
    update: {
      workRuleProfileId: operationsRule.id,
      name: 'Sales Day Shift',
      startTime: '09:00',
      endTime: '17:00',
      unpaidBreakMinutes: 30,
      paidBreakMinutes: 0,
      status: 'Active',
    },
    create: {
      orgUnitId: salesOrgUnitId,
      workRuleProfileId: operationsRule.id,
      code: 'DAY-SALES',
      name: 'Sales Day Shift',
      startTime: '09:00',
      endTime: '17:00',
      unpaidBreakMinutes: 30,
      paidBreakMinutes: 0,
      status: 'Active',
    },
  });

  const engineeringSchedule = await prisma.workSchedule.create({
    data: {
      orgUnitId: platformOrgUnitId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      status: 'Published',
      notes: 'Published engineering coverage for the current pay period.',
      publishedAt: new Date('2026-03-14T15:00:00Z'),
    },
    select: { id: true },
  });

  const salesSchedule = await prisma.workSchedule.create({
    data: {
      orgUnitId: salesOrgUnitId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      status: 'Draft',
      notes: 'Draft sales schedule with one uncovered shift for coverage review.',
    },
    select: { id: true },
  });

  const marcusId = employeeByEmail.get('marcus.thompson@elevatehr.dev') ?? null;
  const davidId = employeeByEmail.get('david.blackwood@elevatehr.dev') ?? null;
  const jordanId = employeeByEmail.get('jordan.williams@elevatehr.dev') ?? null;
  const sarahId = employeeByEmail.get('sarah.chen@elevatehr.dev') ?? null;
  const alexId = employeeByEmail.get('alex.moreau@elevatehr.dev') ?? null;

  const scheduledShiftSeeds = [
    { scheduleId: engineeringSchedule.id, employeeId: marcusId, orgUnitId: platformOrgUnitId, shiftTemplateId: platformDayShift.id, shiftDate: '2026-03-16', start: '2026-03-16T08:00:00Z', end: '2026-03-16T16:30:00Z', breakMinutes: 30, status: 'Published', notes: 'Platform release support' },
    { scheduleId: engineeringSchedule.id, employeeId: davidId, orgUnitId: platformOrgUnitId, shiftTemplateId: platformDayShift.id, shiftDate: '2026-03-17', start: '2026-03-17T08:00:00Z', end: '2026-03-17T18:30:00Z', breakMinutes: 30, status: 'Published', notes: 'Extended production readiness coverage' },
    { scheduleId: salesSchedule.id, employeeId: jordanId, orgUnitId: salesOrgUnitId, shiftTemplateId: salesShift.id, shiftDate: '2026-03-18', start: '2026-03-18T09:00:00Z', end: '2026-03-18T17:00:00Z', breakMinutes: 30, status: 'Scheduled', notes: 'Prospecting block' },
    { scheduleId: salesSchedule.id, employeeId: null, orgUnitId: salesOrgUnitId, shiftTemplateId: salesShift.id, shiftDate: '2026-03-19', start: '2026-03-19T09:00:00Z', end: '2026-03-19T17:00:00Z', breakMinutes: 30, status: 'Scheduled', notes: 'Open coverage shift' },
  ] as const;

  const shiftByKey = new Map<string, string>();

  for (const seed of scheduledShiftSeeds) {
    const shift = await prisma.scheduledShift.create({
      data: {
        scheduleId: seed.scheduleId,
        employeeId: seed.employeeId,
        orgUnitId: seed.orgUnitId,
        shiftTemplateId: seed.shiftTemplateId,
        shiftDate: new Date(`${seed.shiftDate}T00:00:00Z`),
        startDateTime: new Date(seed.start),
        endDateTime: new Date(seed.end),
        breakMinutes: seed.breakMinutes,
        status: seed.status,
        notes: seed.notes,
      },
      select: { id: true },
    });

    shiftByKey.set(`${seed.employeeId ?? 'open'}-${seed.shiftDate}`, shift.id);
  }

  const marcusCard = await prisma.timeCard.create({
    data: {
      employeeId: marcusId ?? '',
      orgUnitId: platformOrgUnitId,
      approverId: sarahId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      status: 'Submitted',
      submittedAt: new Date('2026-03-18T18:00:00Z'),
      regularHours: new Prisma.Decimal(8),
      overtimeHours: new Prisma.Decimal(0),
      doubleTimeHours: new Prisma.Decimal(0),
      leaveHours: new Prisma.Decimal(0),
      holidayHours: new Prisma.Decimal(0),
      totalWorkedHours: new Prisma.Decimal(8),
      exceptionCount: 0,
    },
    select: { id: true },
  });

  await prisma.timeEntry.create({
    data: {
      timeCardId: marcusCard.id,
      scheduledShiftId: shiftByKey.get(`${marcusId}-2026-03-16`) ?? null,
      workDate: new Date('2026-03-16T00:00:00Z'),
      earningType: 'Worked',
      workedHours: new Prisma.Decimal(8),
      startDateTime: new Date('2026-03-16T08:00:00Z'),
      endDateTime: new Date('2026-03-16T16:30:00Z'),
      breakMinutes: 30,
      notes: 'Completed scheduled platform work.',
      isAutoGenerated: false,
    },
  });

  const davidCard = await prisma.timeCard.create({
    data: {
      employeeId: davidId ?? '',
      orgUnitId: platformOrgUnitId,
      approverId: sarahId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      status: 'Approved',
      submittedAt: new Date('2026-03-18T18:30:00Z'),
      approvedAt: new Date('2026-03-18T20:00:00Z'),
      regularHours: new Prisma.Decimal(8),
      overtimeHours: new Prisma.Decimal(2),
      doubleTimeHours: new Prisma.Decimal(0),
      leaveHours: new Prisma.Decimal(0),
      holidayHours: new Prisma.Decimal(0),
      totalWorkedHours: new Prisma.Decimal(10),
      exceptionCount: 1,
      approvalComment: 'Approved with extended coverage noted for release week.',
    },
    select: { id: true },
  });

  await prisma.timeEntry.create({
    data: {
      timeCardId: davidCard.id,
      scheduledShiftId: shiftByKey.get(`${davidId}-2026-03-17`) ?? null,
      workDate: new Date('2026-03-17T00:00:00Z'),
      earningType: 'Worked',
      workedHours: new Prisma.Decimal(10),
      startDateTime: new Date('2026-03-17T08:00:00Z'),
      endDateTime: new Date('2026-03-17T18:30:00Z'),
      breakMinutes: 30,
      notes: 'Production readiness window.',
      exceptionFlags: 'DailyOvertime',
      isAutoGenerated: false,
    },
  });

  const jordanCard = await prisma.timeCard.create({
    data: {
      employeeId: jordanId ?? '',
      orgUnitId: salesOrgUnitId,
      approverId: alexId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      status: 'Rejected',
      submittedAt: new Date('2026-03-18T17:30:00Z'),
      rejectedAt: new Date('2026-03-18T19:00:00Z'),
      regularHours: new Prisma.Decimal(7.5),
      overtimeHours: new Prisma.Decimal(0),
      doubleTimeHours: new Prisma.Decimal(0),
      leaveHours: new Prisma.Decimal(0),
      holidayHours: new Prisma.Decimal(0),
      totalWorkedHours: new Prisma.Decimal(7.5),
      exceptionCount: 1,
      approvalComment: 'Please correct the end time and resubmit for approval.',
    },
    select: { id: true },
  });

  await prisma.timeEntry.create({
    data: {
      timeCardId: jordanCard.id,
      scheduledShiftId: shiftByKey.get(`${jordanId}-2026-03-18`) ?? null,
      workDate: new Date('2026-03-18T00:00:00Z'),
      earningType: 'Worked',
      workedHours: new Prisma.Decimal(7.5),
      startDateTime: new Date('2026-03-18T09:00:00Z'),
      endDateTime: new Date('2026-03-18T16:30:00Z'),
      breakMinutes: 30,
      notes: 'Needs corrected end time.',
      exceptionFlags: 'UnscheduledVariance',
      isAutoGenerated: false,
    },
  });

  await prisma.timeCard.create({
    data: {
      employeeId: marcusId ?? '',
      orgUnitId: platformOrgUnitId,
      approverId: sarahId,
      periodStart: previousPeriodStart,
      periodEnd: previousPeriodEnd,
      status: 'Approved',
      submittedAt: new Date('2026-03-14T18:00:00Z'),
      approvedAt: new Date('2026-03-15T17:00:00Z'),
      regularHours: new Prisma.Decimal(78),
      overtimeHours: new Prisma.Decimal(4),
      doubleTimeHours: new Prisma.Decimal(0),
      leaveHours: new Prisma.Decimal(0),
      holidayHours: new Prisma.Decimal(0),
      totalWorkedHours: new Prisma.Decimal(82),
      exceptionCount: 0,
    },
  });

  await prisma.workflowTask.create({
    data: {
      taskType: 'TimeCardApproval',
      title: 'Approve Marcus Thompson time card',
      description: 'Current pay-period time card approval',
      status: 'Open',
      priority: 'High',
      dueDate: new Date('2026-03-19T17:00:00Z'),
      employeeId: marcusId,
      ownerEmployeeId: sarahId,
      ownerLabel: 'Manager',
      relatedEntityType: 'TimeCard',
      relatedEntityId: marcusCard.id,
    },
  });

  await prisma.workflowTask.create({
    data: {
      taskType: 'TimeCardCorrection',
      title: 'Jordan Williams time card requires correction',
      description: 'Rejected time card needs employee correction',
      status: 'Open',
      priority: 'Normal',
      dueDate: new Date('2026-03-20T17:00:00Z'),
      employeeId: jordanId,
      ownerEmployeeId: jordanId,
      ownerLabel: 'Employee',
      relatedEntityType: 'TimeCard',
      relatedEntityId: jordanCard.id,
    },
  });

  await prisma.workflowTask.create({
    data: {
      taskType: 'OvertimeReview',
      title: 'Review David Blackwood overtime exception',
      description: 'Daily overtime threshold exceeded for approved schedule coverage.',
      status: 'Open',
      priority: 'Normal',
      dueDate: new Date('2026-03-19T12:00:00Z'),
      employeeId: davidId,
      ownerEmployeeId: sarahId,
      ownerLabel: 'Manager',
      relatedEntityType: 'TimeCard',
      relatedEntityId: davidCard.id,
    },
  });
}

async function seedLifecycleData(employeeByEmail: Map<string, string>, templateByCode: Map<string, string>) {
  const onboardingTemplateId = templateByCode.get('ONBOARD-CORE');
  const offboardingTemplateId = templateByCode.get('OFFBOARD-CORE');

  if (!onboardingTemplateId || !offboardingTemplateId) {
    return;
  }

  const jordanId = employeeByEmail.get('jordan.williams@elevatehr.dev');
  const fatimaId = employeeByEmail.get('fatima.hassan@elevatehr.dev');

  const lifecycleSeeds = [
    {
      employeeId: jordanId,
      templateId: onboardingTemplateId,
      title: 'Core onboarding',
      lifecycleType: 'Onboarding',
      baseDate: new Date('2026-03-15'),
      items: [
        { title: 'Provision system access', ownerLabel: 'IT', dueDaysOffset: 0, status: 'Completed' },
        { title: 'Complete payroll and policy setup', ownerLabel: 'HR Operations', dueDaysOffset: 1, status: 'Open' },
        { title: 'Schedule manager introduction', ownerLabel: 'Manager', dueDaysOffset: 2, status: 'Open' },
      ],
    },
    {
      employeeId: fatimaId,
      templateId: offboardingTemplateId,
      title: 'Core offboarding',
      lifecycleType: 'Offboarding',
      baseDate: new Date('2026-03-18'),
      items: [
        { title: 'Disable access and collect equipment', ownerLabel: 'IT', dueDaysOffset: 0, status: 'Open' },
        { title: 'Finalize payroll and benefits', ownerLabel: 'HR Operations', dueDaysOffset: 1, status: 'Open' },
        { title: 'Conduct handoff and exit conversation', ownerLabel: 'Manager', dueDaysOffset: 2, status: 'Open' },
      ],
    },
  ].filter((seed): seed is NonNullable<typeof seed> & { employeeId: string } => Boolean(seed.employeeId));

  for (const lifecycleSeed of lifecycleSeeds) {
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: lifecycleSeed.employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        managerId: true,
      },
    });

    const checklist = await prisma.employeeChecklist.create({
      data: {
        employeeId: employee.id,
        templateId: lifecycleSeed.templateId,
        title: lifecycleSeed.title,
        lifecycleType: lifecycleSeed.lifecycleType,
        status: lifecycleSeed.items.every((item) => item.status === 'Completed') ? 'Completed' : 'In Progress',
        dueDate: addUtcDays(lifecycleSeed.baseDate, 3),
        startedAt: lifecycleSeed.baseDate,
        completedAt: lifecycleSeed.items.every((item) => item.status === 'Completed') ? addUtcDays(lifecycleSeed.baseDate, 3) : null,
      },
    });

    let itemOrder = 0;
    for (const item of lifecycleSeed.items) {
      const checklistItem = await prisma.checklistItem.create({
        data: {
          checklistId: checklist.id,
          title: item.title,
          ownerLabel: item.ownerLabel,
          dueDate: addUtcDays(lifecycleSeed.baseDate, item.dueDaysOffset),
          status: item.status,
          isRequired: true,
          sortOrder: itemOrder,
          completedAt: item.status === 'Completed' ? addUtcDays(lifecycleSeed.baseDate, item.dueDaysOffset) : null,
        },
      });

      await prisma.workflowTask.create({
        data: {
          taskType: 'Checklist',
          title: `${employee.firstName} ${employee.lastName}: ${item.title}`,
          description: `${lifecycleSeed.lifecycleType} checklist item`,
          status: item.status === 'Completed' ? 'Completed' : 'Open',
          priority: lifecycleSeed.lifecycleType === 'Offboarding' ? 'High' : 'Normal',
          dueDate: addUtcDays(lifecycleSeed.baseDate, item.dueDaysOffset),
          employeeId: employee.id,
          ownerEmployeeId: item.ownerLabel === 'Manager' ? employee.managerId : null,
          ownerLabel: item.ownerLabel,
          relatedEntityType: 'ChecklistItem',
          relatedEntityId: checklistItem.id,
          completedAt: item.status === 'Completed' ? addUtcDays(lifecycleSeed.baseDate, item.dueDaysOffset) : null,
        },
      });

      itemOrder += 1;
    }
  }
}

async function seedDocuments(employeeByEmail: Map<string, string>, categoryByCode: Map<string, string>, templateByCode: Map<string, string>) {
  const jordanId = employeeByEmail.get('jordan.williams@elevatehr.dev');
  const marcusId = employeeByEmail.get('marcus.thompson@elevatehr.dev');
  const priyaId = employeeByEmail.get('priya.patel@elevatehr.dev');

  const policyCategoryId = categoryByCode.get('POLICY');
  const certCategoryId = categoryByCode.get('CERT');
  const handbookTemplateId = templateByCode.get('EMP-HANDBOOK');
  const remoteTemplateId = templateByCode.get('REMOTE-WORK');
  const securityTemplateId = templateByCode.get('SEC-TRAIN');

  if (!policyCategoryId || !certCategoryId || !handbookTemplateId || !remoteTemplateId || !securityTemplateId) {
    return;
  }

  if (jordanId) {
    const handbook = await prisma.employeeDocument.create({
      data: {
        employeeId: jordanId,
        categoryId: policyCategoryId,
        templateId: handbookTemplateId,
        title: 'Employee handbook acknowledgment',
        status: 'Pending Acknowledgment',
        required: true,
        issueDate: new Date('2026-03-15'),
        notes: 'New hire policy signoff',
      },
    });

    await prisma.documentAcknowledgment.create({
      data: {
        employeeDocumentId: handbook.id,
        employeeId: jordanId,
        status: 'Pending',
        dueDate: new Date('2026-03-22'),
      },
    });

    await prisma.workflowTask.create({
      data: {
        taskType: 'DocumentAcknowledgment',
        title: 'Jordan Williams: Employee handbook acknowledgment',
        description: 'Employee acknowledgment required',
        status: 'Open',
        priority: 'Normal',
        dueDate: new Date('2026-03-22'),
        employeeId: jordanId,
        ownerEmployeeId: jordanId,
        ownerLabel: 'Employee',
        relatedEntityType: 'DocumentAcknowledgment',
        relatedEntityId: handbook.id,
      },
    });
  }

  if (marcusId) {
    const remoteWork = await prisma.employeeDocument.create({
      data: {
        employeeId: marcusId,
        categoryId: policyCategoryId,
        templateId: remoteTemplateId,
        title: 'Remote work policy',
        status: 'Current',
        required: true,
        issueDate: new Date('2025-12-01'),
        notes: 'Policy acknowledged',
      },
    });

    await prisma.documentAcknowledgment.create({
      data: {
        employeeDocumentId: remoteWork.id,
        employeeId: marcusId,
        status: 'Acknowledged',
        dueDate: new Date('2025-12-08'),
        acknowledgedAt: new Date('2025-12-05'),
      },
    });
  }

  if (priyaId) {
    await prisma.employeeDocument.create({
      data: {
        employeeId: priyaId,
        categoryId: certCategoryId,
        templateId: securityTemplateId,
        title: 'Security training certificate',
        status: 'Expired',
        required: false,
        issueDate: new Date('2025-02-01'),
        expiryDate: new Date('2026-02-01'),
        notes: 'Renewal required this quarter',
      },
    });
  }
}

async function seedPerformance(employeeByEmail: Map<string, string>, orgUnitByCode: Map<string, string>) {
  const marcusId = employeeByEmail.get('marcus.thompson@elevatehr.dev');
  const davidId = employeeByEmail.get('david.blackwood@elevatehr.dev');
  const priyaId = employeeByEmail.get('priya.patel@elevatehr.dev');
  const jordanId = employeeByEmail.get('jordan.williams@elevatehr.dev');
  const fatimaId = employeeByEmail.get('fatima.hassan@elevatehr.dev');
  const sarahId = employeeByEmail.get('sarah.chen@elevatehr.dev');
  const alexId = employeeByEmail.get('alex.moreau@elevatehr.dev');
  const elenaId = employeeByEmail.get('elena.kowalski@elevatehr.dev');

  const productOrgUnitId = orgUnitByCode.get('PRODUCT');

  const publishedCycle = await prisma.performanceCycle.create({
    data: {
      name: 'FY2026 Mid-Year Review',
      status: 'Published',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-04-30'),
      selfReviewDueDate: new Date('2026-03-25'),
      managerReviewDueDate: new Date('2026-04-10'),
      releaseDate: new Date('2026-04-18'),
      publishedAt: new Date('2026-03-05'),
      createdBy: 'seed-script',
      updatedBy: 'seed-script',
    },
  });

  await prisma.performanceCycle.create({
    data: {
      name: 'Product Team Q3 Check-In',
      status: 'Draft',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-08-15'),
      selfReviewDueDate: new Date('2026-07-20'),
      managerReviewDueDate: new Date('2026-08-01'),
      releaseDate: new Date('2026-08-10'),
      orgUnitId: productOrgUnitId ?? null,
      createdBy: 'seed-script',
      updatedBy: 'seed-script',
    },
  });

  const reviewSeeds = [
    {
      employeeId: jordanId,
      managerId: alexId,
      status: 'Pending Self Review',
      managerSummary: null,
      selfResponses: {
        achievements: '',
        strengths: '',
        growth_focus: '',
        development_actions: '',
      },
      managerResponses: {
        achievements: '',
        strengths: '',
        growth_focus: '',
        development_actions: '',
      },
      finalizedAt: null,
      releasedAt: null,
      acknowledgedAt: null,
    },
    {
      employeeId: marcusId,
      managerId: sarahId,
      status: 'Manager Review In Progress',
      managerSummary: 'Marcus is operating at a strong senior level and is ready for larger technical ownership.',
      selfResponses: {
        achievements: 'Led the authentication refactor and improved release stability.',
        strengths: 'System design and calm execution under change.',
        growth_focus: 'Broader cross-team communication.',
        development_actions: 'Lead one cross-functional initiative next quarter.',
      },
      managerResponses: {
        achievements: 'Delivered the authentication refactor with minimal disruption.',
        strengths: 'Strong technical judgment and reliability.',
        growth_focus: 'Broaden mentoring impact across the team.',
        development_actions: 'Own the next shared platform modernization effort.',
      },
      finalizedAt: null,
      releasedAt: null,
      acknowledgedAt: null,
    },
    {
      employeeId: davidId,
      managerId: sarahId,
      status: 'Finalized',
      managerSummary: 'David consistently stabilizes platform operations and has become the key escalation point for release health.',
      selfResponses: {
        achievements: 'Automated infrastructure drift checks and improved deployment recovery time.',
        strengths: 'Operational ownership and troubleshooting.',
        growth_focus: 'Documentation depth for handoffs.',
        development_actions: 'Document platform runbooks for the team.',
      },
      managerResponses: {
        achievements: 'Platform reliability improved materially under David’s ownership.',
        strengths: 'Strong operational execution and urgency.',
        growth_focus: 'Codify standards so others can scale the work.',
        development_actions: 'Publish service ownership playbooks by quarter end.',
      },
      finalizedAt: new Date('2026-03-14'),
      releasedAt: new Date('2026-03-14'),
      acknowledgedAt: null,
    },
    {
      employeeId: priyaId,
      managerId: alexId,
      status: 'Acknowledged',
      managerSummary: 'Priya consistently improves product clarity and usability through strong design partnership.',
      selfResponses: {
        achievements: 'Redesigned onboarding flows and reduced user confusion.',
        strengths: 'Design storytelling and stakeholder alignment.',
        growth_focus: 'More formal measurement after launch.',
        development_actions: 'Attach adoption metrics to design proposals.',
      },
      managerResponses: {
        achievements: 'Priya improved onboarding outcomes and design consistency.',
        strengths: 'Strong collaboration and design craft.',
        growth_focus: 'Strengthen post-launch measurement.',
        development_actions: 'Drive adoption measurement into each launch plan.',
      },
      finalizedAt: new Date('2026-03-12'),
      releasedAt: new Date('2026-03-12'),
      acknowledgedAt: new Date('2026-03-15'),
    },
    {
      employeeId: fatimaId,
      managerId: elenaId,
      status: 'Self Review Submitted',
      managerSummary: null,
      selfResponses: {
        achievements: 'Improved monthly variance reporting and forecast handoff.',
        strengths: 'Detail orientation and planning discipline.',
        growth_focus: 'Presenting recommendations with more confidence.',
        development_actions: 'Lead the next monthly review readout.',
      },
      managerResponses: {
        achievements: '',
        strengths: '',
        growth_focus: '',
        development_actions: '',
      },
      finalizedAt: null,
      releasedAt: null,
      acknowledgedAt: null,
    },
  ].filter((review): review is typeof review & { employeeId: string; managerId: string } => Boolean(review.employeeId && review.managerId));

  for (const reviewSeed of reviewSeeds) {
    const review = await prisma.performanceReview.create({
      data: {
        cycleId: publishedCycle.id,
        employeeId: reviewSeed.employeeId,
        managerId: reviewSeed.managerId,
        status: reviewSeed.status,
        managerSummary: reviewSeed.managerSummary,
        finalizedAt: reviewSeed.finalizedAt,
        releasedAt: reviewSeed.releasedAt,
        acknowledgedAt: reviewSeed.acknowledgedAt,
      },
    });

    let sortOrder = 0;
    for (const section of reviewSectionDefinitions) {
      await prisma.performanceReviewSection.create({
        data: {
          reviewId: review.id,
          sectionKey: section.sectionKey,
          sectionTitle: section.sectionTitle,
          employeeResponse: reviewSeed.selfResponses[section.sectionKey as keyof typeof reviewSeed.selfResponses] || null,
          managerResponse: reviewSeed.managerResponses[section.sectionKey as keyof typeof reviewSeed.managerResponses] || null,
          sortOrder,
        },
      });
      sortOrder += 1;
    }

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: reviewSeed.employeeId },
      select: { firstName: true, lastName: true },
    });

    await prisma.workflowTask.create({
      data: {
        taskType: 'PerformanceSelfReview',
        title: `${employee.firstName} ${employee.lastName}: self-review: ${publishedCycle.name}`,
        description: 'PerformanceSelfReview',
        status: reviewSeed.status === 'Pending Self Review' ? 'Open' : 'Completed',
        priority: 'Normal',
        dueDate: publishedCycle.selfReviewDueDate,
        employeeId: reviewSeed.employeeId,
        ownerEmployeeId: reviewSeed.employeeId,
        ownerLabel: 'Employee',
        relatedEntityType: 'PerformanceSelfReview',
        relatedEntityId: review.id,
        completedAt: reviewSeed.status === 'Pending Self Review' ? null : new Date('2026-03-15'),
      },
    });

    await prisma.workflowTask.create({
      data: {
        taskType: 'PerformanceManagerReview',
        title: `${employee.firstName} ${employee.lastName}: manager review: ${publishedCycle.name}`,
        description: 'PerformanceManagerReview',
        status: ['Pending Self Review', 'Self Review Submitted', 'Manager Review In Progress'].includes(reviewSeed.status) ? 'Open' : 'Completed',
        priority: 'High',
        dueDate: publishedCycle.managerReviewDueDate,
        employeeId: reviewSeed.employeeId,
        ownerEmployeeId: reviewSeed.managerId,
        ownerLabel: 'Manager',
        relatedEntityType: 'PerformanceManagerReview',
        relatedEntityId: review.id,
        completedAt: ['Finalized', 'Acknowledged'].includes(reviewSeed.status) ? new Date('2026-03-15') : null,
      },
    });

    if (['Finalized', 'Acknowledged'].includes(reviewSeed.status)) {
      await prisma.workflowTask.create({
        data: {
          taskType: 'PerformanceAcknowledgment',
          title: `${employee.firstName} ${employee.lastName}: acknowledge review: ${publishedCycle.name}`,
          description: 'PerformanceAcknowledgment',
          status: reviewSeed.status === 'Acknowledged' ? 'Completed' : 'Open',
          priority: 'Normal',
          dueDate: publishedCycle.releaseDate,
          employeeId: reviewSeed.employeeId,
          ownerEmployeeId: reviewSeed.employeeId,
          ownerLabel: 'Employee',
          relatedEntityType: 'PerformanceAcknowledgment',
          relatedEntityId: review.id,
          completedAt: reviewSeed.status === 'Acknowledged' ? reviewSeed.acknowledgedAt : null,
        },
      });
    }
  }

  const goalSeeds = [
    {
      employeeId: marcusId,
      managerId: sarahId,
      title: 'Lead the next shared authentication platform release',
      description: 'Own design coordination, rollout sequencing, and stability metrics.',
      status: 'Active',
      targetDate: new Date('2026-05-15'),
      updates: [
        { authorEmployeeId: marcusId, progressNote: 'Drafted the cross-team rollout plan and risk register.', percentComplete: 35 },
      ],
    },
    {
      employeeId: jordanId,
      managerId: alexId,
      title: 'Reach full productivity on the enterprise sales playbook',
      description: 'Complete onboarding ramp milestones and deliver first qualified pipeline targets.',
      status: 'Active',
      targetDate: new Date('2026-04-30'),
      updates: [
        { authorEmployeeId: jordanId, progressNote: 'Completed call shadowing and first outbound sequence.', percentComplete: 20 },
      ],
    },
    {
      employeeId: priyaId,
      managerId: alexId,
      title: 'Standardize product launch design QA',
      description: 'Create a repeatable QA checklist for pre-release design validation.',
      status: 'Completed',
      targetDate: new Date('2026-03-10'),
      updates: [
        { authorEmployeeId: priyaId, progressNote: 'Published the design QA checklist and socialized it with PM and engineering.', percentComplete: 100 },
      ],
    },
    {
      employeeId: fatimaId,
      managerId: elenaId,
      title: 'Lead the monthly finance variance review',
      description: 'Present variance trends and recommendations to the leadership team.',
      status: 'Active',
      targetDate: new Date('2026-04-22'),
      updates: [
        { authorEmployeeId: fatimaId, progressNote: 'Built the new variance narrative template and rehearsed the presentation.', percentComplete: 55 },
      ],
    },
  ].filter((goal): goal is typeof goal & { employeeId: string; managerId: string } => Boolean(goal.employeeId && goal.managerId));

  for (const goalSeed of goalSeeds) {
    const goal = await prisma.performanceGoal.create({
      data: {
        employeeId: goalSeed.employeeId,
        managerId: goalSeed.managerId,
        title: goalSeed.title,
        description: goalSeed.description,
        status: goalSeed.status,
        targetDate: goalSeed.targetDate,
        createdInCycleId: publishedCycle.id,
        closedAt: goalSeed.status === 'Completed' ? new Date('2026-03-10') : null,
      },
    });

    for (const update of goalSeed.updates) {
      if (!update.authorEmployeeId) {
        continue;
      }

      await prisma.performanceGoalUpdate.create({
        data: {
          goalId: goal.id,
          authorEmployeeId: update.authorEmployeeId,
          progressNote: update.progressNote,
          percentComplete: update.percentComplete,
        },
      });
    }
  }
}

async function seedLearning(
  employeeByEmail: Map<string, string>,
  accountByEmail: Map<string, string>,
  orgUnitByCode: Map<string, string>,
  positionByCode: Map<string, string>,
  classificationByCode: Map<string, string>,
) {
  const contentByProviderContentId = new Map<string, string>();
  const pathByCode = new Map<string, string>();
  const hrAdminAccountId = accountByEmail.get('hr.admin@elevatehr.dev') ?? null;

  for (const providerSeed of learningProviders) {
    const provider = await prisma.learningProvider.create({
      data: {
        code: providerSeed.code,
        displayName: providerSeed.displayName,
        providerType: providerSeed.providerType,
        status: 'Active',
        syncMode: providerSeed.syncMode,
        defaultLaunchBaseUrl: providerSeed.defaultLaunchBaseUrl,
        connectionMetadata: providerSeed.connectionMetadata,
        lastSyncStartedAt: new Date('2026-03-18T09:00:00Z'),
        lastSyncCompletedAt: new Date('2026-03-18T09:01:00Z'),
        lastSyncStatus: 'Completed',
        lastSyncMessage: 'Seed sync completed.',
      },
    });

    const adapter = resolveLearningProviderAdapter({ code: provider.code, providerType: provider.providerType });
    const catalog = await adapter.syncCatalog(providerSeed);

    for (const contentSeed of catalog) {
      const content = await prisma.learningContent.create({
        data: {
          providerId: provider.id,
          providerContentId: contentSeed.providerContentId,
          title: contentSeed.title,
          description: contentSeed.description,
          modality: contentSeed.modality,
          durationMinutes: contentSeed.durationMinutes,
          thumbnailUrl: contentSeed.thumbnailUrl,
          launchUrl: contentSeed.launchUrl,
          tagList: contentSeed.tags.join(', '),
          versionLabel: contentSeed.versionLabel,
          certificateEligible: contentSeed.certificateEligible,
          contentStatus: contentSeed.contentStatus,
          lastSyncedAt: new Date('2026-03-18T09:01:00Z'),
        },
      });

      contentByProviderContentId.set(contentSeed.providerContentId, content.id);
    }

    await prisma.learningSyncRun.create({
      data: {
        providerId: provider.id,
        status: 'Completed',
        startedAt: new Date('2026-03-18T09:00:00Z'),
        completedAt: new Date('2026-03-18T09:01:00Z'),
        createdCount: catalog.length,
        updatedCount: 0,
        retiredCount: 0,
        message: `Seeded ${catalog.length} catalog items.`,
      },
    });
  }

  for (const pathSeed of learningPaths) {
    const path = await prisma.learningPath.create({
      data: {
        code: pathSeed.code,
        name: pathSeed.name,
        description: pathSeed.description,
        status: 'Active',
      },
    });

    pathByCode.set(pathSeed.code, path.id);

    for (const [index, providerContentId] of pathSeed.itemProviderContentIds.entries()) {
      const contentId = contentByProviderContentId.get(providerContentId);
      if (!contentId) {
        continue;
      }

      await prisma.learningPathItem.create({
        data: {
          pathId: path.id,
          contentId,
          sortOrder: index,
          isRequired: true,
        },
      });
    }
  }

  const assignmentSeeds = [
    {
      assignmentType: 'Path',
      pathId: pathByCode.get('LEARN-CORE-COMPLIANCE') ?? null,
      employeeId: employeeByEmail.get('jordan.williams@elevatehr.dev') ?? null,
      requirementType: 'Required',
      dueDate: new Date('2026-03-25'),
      mandatory: true,
      notes: 'New hire foundational compliance learning.',
    },
    {
      assignmentType: 'Content',
      contentId: contentByProviderContentId.get('finance-controls-overview') ?? null,
      orgUnitId: orgUnitByCode.get('FINANCE') ?? null,
      requirementType: 'Required',
      dueDate: new Date('2026-03-10'),
      mandatory: true,
      notes: 'Finance control discipline for the operating team.',
    },
    {
      assignmentType: 'Path',
      pathId: pathByCode.get('LEARN-MANAGER-READY') ?? null,
      positionId: positionByCode.get('POS-ENG-DIR-001') ?? null,
      requirementType: 'Recommended',
      dueDate: new Date('2026-04-15'),
      mandatory: false,
      notes: 'Manager pathway for senior leadership roles.',
    },
    {
      assignmentType: 'Content',
      contentId: contentByProviderContentId.get('accessibility-design-basics') ?? null,
      classificationId: classificationByCode.get('DESIGN') ?? null,
      requirementType: 'Recommended',
      dueDate: new Date('2026-04-20'),
      mandatory: false,
      notes: 'Design-specific inclusive experience learning.',
    },
  ];

  for (const seed of assignmentSeeds) {
    if ((seed.assignmentType === 'Content' && !seed.contentId) || (seed.assignmentType === 'Path' && !seed.pathId)) {
      continue;
    }

    await prisma.$transaction(async (transaction) => {
      const assignment = await transaction.learningAssignment.create({
        data: {
          assignmentType: seed.assignmentType,
          requirementType: seed.requirementType,
          contentId: seed.assignmentType === 'Content' ? seed.contentId : null,
          pathId: seed.assignmentType === 'Path' ? seed.pathId : null,
          employeeId: seed.employeeId ?? null,
          orgUnitId: seed.orgUnitId ?? null,
          positionId: seed.positionId ?? null,
          classificationId: seed.classificationId ?? null,
          assignedByAccountId: hrAdminAccountId,
          sourceType: LEARNING_SOURCE_MANUAL,
          status: 'Active',
          mandatory: seed.mandatory,
          dueDate: seed.dueDate,
          notes: seed.notes,
        },
      });

      await materializeLearningRecordsForSource(transaction, {
        assignmentId: assignment.id,
        assignmentType: seed.assignmentType,
        contentId: seed.assignmentType === 'Content' ? seed.contentId : null,
        pathId: seed.assignmentType === 'Path' ? seed.pathId : null,
        employeeId: seed.employeeId ?? null,
        orgUnitId: seed.orgUnitId ?? null,
        positionId: seed.positionId ?? null,
        classificationId: seed.classificationId ?? null,
        requirementType: seed.requirementType,
        mandatory: seed.mandatory,
        dueDate: seed.dueDate,
        renewalDays: 365,
        sourceType: LEARNING_SOURCE_MANUAL,
      });
    });
  }

  const ruleSeeds: Array<{
    assignmentType: 'Content';
    contentId: string | null;
    orgUnitId?: string | null;
    positionId?: string | null;
    classificationId?: string | null;
    managerEmployeeId?: string | null;
    requirementType: 'Required' | 'Recommended';
    defaultDueDays: number;
    renewalDays: number | null;
    mandatory: boolean;
  }> = [
    {
      assignmentType: 'Content',
      contentId: contentByProviderContentId.get('cyber-essentials-2026') ?? null,
      classificationId: classificationByCode.get('SWE') ?? null,
      requirementType: 'Required',
      defaultDueDays: 21,
      renewalDays: 365,
      mandatory: true,
    },
    {
      assignmentType: 'Content',
      contentId: contentByProviderContentId.get('mgr-coaching-foundations') ?? null,
      managerEmployeeId: employeeByEmail.get('alex.moreau@elevatehr.dev') ?? null,
      requirementType: 'Recommended',
      defaultDueDays: 30,
      renewalDays: null,
      mandatory: false,
    },
    {
      assignmentType: 'Content',
      contentId: contentByProviderContentId.get('privacy-data-handling') ?? null,
      orgUnitId: orgUnitByCode.get('PEOPLE') ?? null,
      requirementType: 'Required',
      defaultDueDays: 14,
      renewalDays: 365,
      mandatory: true,
    },
  ];

  for (const seed of ruleSeeds) {
    if (!seed.contentId) {
      continue;
    }

    await prisma.$transaction(async (transaction) => {
      const rule = await transaction.learningAssignmentRule.create({
        data: {
          assignmentType: seed.assignmentType,
          contentId: seed.contentId,
          pathId: null,
          orgUnitId: seed.orgUnitId ?? null,
          positionId: seed.positionId ?? null,
          classificationId: seed.classificationId ?? null,
          managerEmployeeId: seed.managerEmployeeId ?? null,
          createdByAccountId: hrAdminAccountId,
          requirementType: seed.requirementType,
          defaultDueDays: seed.defaultDueDays,
          renewalDays: seed.renewalDays,
          mandatory: seed.mandatory,
          isActive: true,
        },
      });

      await materializeLearningRecordsForSource(transaction, {
        assignmentRuleId: rule.id,
        assignmentType: seed.assignmentType,
        contentId: seed.contentId,
        pathId: null,
        orgUnitId: seed.orgUnitId ?? null,
        positionId: seed.positionId ?? null,
        classificationId: seed.classificationId ?? null,
        managerEmployeeId: seed.managerEmployeeId ?? null,
        requirementType: seed.requirementType,
        mandatory: seed.mandatory,
        defaultDueDays: seed.defaultDueDays,
        renewalDays: seed.renewalDays,
        sourceType: LEARNING_SOURCE_RULE,
      });
    });
  }

  const recordUpdates: Array<{
    employeeId: string | null;
    providerContentId: string;
    status: string;
    progressPercent: number;
    launchedAt: Date | null;
    completedAt: Date | null;
    certificateIssuedAt: Date | null;
    certificateExpiresAt: Date | null;
    certificateNumber: string | null;
  }> = [
    {
      employeeId: employeeByEmail.get('marcus.thompson@elevatehr.dev') ?? null,
      providerContentId: 'cyber-essentials-2026',
      status: 'Completed',
      progressPercent: 100,
      launchedAt: new Date('2026-03-02'),
      completedAt: new Date('2026-03-05'),
      certificateIssuedAt: new Date('2026-03-05'),
      certificateExpiresAt: new Date('2026-04-12'),
      certificateNumber: 'CERT-MARCUS-8841',
    },
    {
      employeeId: employeeByEmail.get('sarah.chen@elevatehr.dev') ?? null,
      providerContentId: 'privacy-data-handling',
      status: 'Completed',
      progressPercent: 100,
      launchedAt: new Date('2026-03-01'),
      completedAt: new Date('2026-03-03'),
      certificateIssuedAt: new Date('2026-03-03'),
      certificateExpiresAt: new Date('2026-03-28'),
      certificateNumber: 'CERT-SARAH-4410',
    },
    {
      employeeId: employeeByEmail.get('jordan.williams@elevatehr.dev') ?? null,
      providerContentId: 'cyber-essentials-2026',
      status: 'In Progress',
      progressPercent: 45,
      launchedAt: new Date('2026-03-17'),
      completedAt: null,
      certificateIssuedAt: null,
      certificateExpiresAt: null,
      certificateNumber: null,
    },
    {
      employeeId: employeeByEmail.get('priya.patel@elevatehr.dev') ?? null,
      providerContentId: 'accessibility-design-basics',
      status: 'Completed',
      progressPercent: 100,
      launchedAt: new Date('2026-03-08'),
      completedAt: new Date('2026-03-11'),
      certificateIssuedAt: null,
      certificateExpiresAt: null,
      certificateNumber: null,
    },
  ];

  for (const update of recordUpdates) {
    if (!update.employeeId) {
      continue;
    }

    const employeeId = update.employeeId;

    await prisma.$transaction(async (transaction) => {
      const record = await transaction.learningRecord.findFirst({
        where: {
          employeeId,
          content: {
            is: {
              providerContentId: update.providerContentId,
            },
          },
        },
        select: {
          id: true,
          status: true,
          requirementType: true,
          mandatory: true,
          dueDate: true,
          renewalDueDate: true,
          employeeId: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              managerId: true,
            },
          },
          content: {
            select: {
              title: true,
              certificateEligible: true,
            },
          },
        },
      });

      if (!record) {
        return;
      }

      const refreshed = await transaction.learningRecord.update({
        where: { id: record.id },
        data: {
          status: update.status,
          progressPercent: update.progressPercent,
          launchedAt: update.launchedAt,
          lastActivityAt: update.completedAt ?? update.launchedAt,
          completedAt: update.completedAt,
          certificateIssuedAt: update.certificateIssuedAt,
          certificateExpiresAt: update.certificateExpiresAt,
          certificateNumber: update.certificateNumber,
          renewalDueDate: update.certificateExpiresAt ? addUtcDays(update.certificateExpiresAt, -30) : null,
        },
        select: {
          id: true,
          status: true,
          requirementType: true,
          mandatory: true,
          dueDate: true,
          renewalDueDate: true,
          employeeId: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              managerId: true,
            },
          },
          content: {
            select: {
              title: true,
              certificateEligible: true,
            },
          },
        },
      });

      await syncLearningWorkflowTasks(transaction, refreshed);
    });
  }
}

async function seedSkills(employeeByEmail: Map<string, string>) {
  const skillTagByCode = new Map<string, string>();

  for (const categorySeed of skillCategories) {
    const category = await prisma.skillCategory.create({
      data: {
        code: categorySeed.code,
        name: categorySeed.name,
        description: categorySeed.description,
        displayOrder: categorySeed.displayOrder,
        isActive: true,
      },
    });

    for (const tagSeed of categorySeed.tags) {
      const tag = await prisma.skillTag.create({
        data: {
          categoryId: category.id,
          code: tagSeed.code,
          name: tagSeed.name,
          description: tagSeed.description,
          displayOrder: tagSeed.displayOrder,
          isActive: true,
        },
      });

      skillTagByCode.set(tag.code, tag.id);
    }
  }

  const employeeSkillSeeds = [
    { email: 'marcus.thompson@elevatehr.dev', skillCode: 'TS', selfReportedLevel: 'Advanced', confidence: 5 },
    { email: 'marcus.thompson@elevatehr.dev', skillCode: 'COACHING', selfReportedLevel: 'Developing', confidence: 3 },
    { email: 'david.blackwood@elevatehr.dev', skillCode: 'DEVOPS', selfReportedLevel: 'Advanced', confidence: 5 },
    { email: 'priya.patel@elevatehr.dev', skillCode: 'ACCESSIBILITY', selfReportedLevel: 'Proficient', confidence: 4 },
    { email: 'alex.moreau@elevatehr.dev', skillCode: 'DISCOVERY', selfReportedLevel: 'Advanced', confidence: 5 },
    { email: 'jordan.williams@elevatehr.dev', skillCode: 'SALES_EXEC', selfReportedLevel: 'Developing', confidence: 3 },
    { email: 'fatima.hassan@elevatehr.dev', skillCode: 'FIN_CONTROL', selfReportedLevel: 'Proficient', confidence: 4 },
  ] as const;

  for (const seed of employeeSkillSeeds) {
    const employeeId = employeeByEmail.get(seed.email);
    const skillTagId = skillTagByCode.get(seed.skillCode);

    if (!employeeId || !skillTagId) {
      continue;
    }

    await prisma.employeeSkill.create({
      data: {
        employeeId,
        skillTagId,
        source: 'Self',
        selfReportedLevel: seed.selfReportedLevel,
        confidence: seed.confidence,
      },
    });
  }

  const managerValidationSeeds = [
    { employeeEmail: 'marcus.thompson@elevatehr.dev', skillCode: 'TS', validationStatus: 'Validated', managerNote: 'Strong day-to-day technical leadership and code quality judgment.' },
    { employeeEmail: 'priya.patel@elevatehr.dev', skillCode: 'ACCESSIBILITY', validationStatus: 'Validated', managerNote: 'Consistently brings accessibility considerations into design QA.' },
    { employeeEmail: 'jordan.williams@elevatehr.dev', skillCode: 'SALES_EXEC', validationStatus: 'NotValidated', managerNote: 'Still building consistency on qualification discipline.' },
  ] as const;

  for (const seed of managerValidationSeeds) {
    const employeeId = employeeByEmail.get(seed.employeeEmail);
    const skillTagId = skillTagByCode.get(seed.skillCode);

    if (!employeeId || !skillTagId) {
      continue;
    }

    const employeeSkill = await prisma.employeeSkill.findFirst({
      where: {
        employeeId,
        skillTagId,
        source: 'Self',
      },
      select: { id: true },
    });

    if (!employeeSkill) {
      continue;
    }

    await prisma.employeeSkill.update({
      where: { id: employeeSkill.id },
      data: {
        validationStatus: seed.validationStatus,
        managerNote: seed.managerNote,
        validatedAt: new Date('2026-03-10T09:00:00Z'),
      },
    });
  }

  const learningContentSkillSeeds = [
    { providerContentId: 'cyber-essentials-2026', skillCodes: ['TS'] },
    { providerContentId: 'mgr-coaching-foundations', skillCodes: ['COACHING', 'FACILITATION'] },
    { providerContentId: 'accessibility-design-basics', skillCodes: ['ACCESSIBILITY'] },
    { providerContentId: 'finance-controls-overview', skillCodes: ['FIN_CONTROL'] },
  ] as const;

  for (const seed of learningContentSkillSeeds) {
    const content = await prisma.learningContent.findFirst({
      where: { providerContentId: seed.providerContentId },
      select: { id: true },
    });

    if (!content) {
      continue;
    }

    for (const skillCode of seed.skillCodes) {
      const skillTagId = skillTagByCode.get(skillCode);
      if (!skillTagId) {
        continue;
      }

      await prisma.learningContentSkill.create({
        data: {
          contentId: content.id,
          skillTagId,
        },
      });
    }
  }
}

async function seedRecruitment(
  employeeByEmail: Map<string, string>,
  accountByEmail: Map<string, string>,
  orgUnitByCode: Map<string, string>,
  classificationByCode: Map<string, string>,
  levelByKey: Map<string, string>,
  positionByCode: Map<string, string>,
) {
  const requestTypeByCode = new Map<string, string>();
  const fundingTypeByCode = new Map<string, string>();

  for (const requestType of recruitmentRequestTypes) {
    const saved = await prisma.jobRequestType.create({
      data: {
        code: requestType.code,
        name: requestType.name,
        description: requestType.description,
        fieldSchema: requestType.fieldSchema,
        isActive: true,
      },
    });
    requestTypeByCode.set(requestType.code, saved.id);
  }

  for (const fundingType of recruitmentFundingTypes) {
    const saved = await prisma.fundingType.create({
      data: {
        code: fundingType.code,
        name: fundingType.name,
        category: fundingType.category,
        description: fundingType.description,
        durationType: fundingType.durationType,
        isPermanent: fundingType.isPermanent,
        isActive: true,
      },
    });
    fundingTypeByCode.set(fundingType.code, saved.id);
  }

  const hrAdminAccountId = accountByEmail.get('hr.admin@elevatehr.dev') ?? null;
  const sarahAccountId = accountByEmail.get('sarah.chen@elevatehr.dev') ?? null;
  const elenaAccountId = accountByEmail.get('elena.kowalski@elevatehr.dev') ?? null;
  const fatimaAccountId = accountByEmail.get('fatima.hassan@elevatehr.dev') ?? null;
  const alexAccountId = accountByEmail.get('alex.moreau@elevatehr.dev') ?? null;

  const sarahId = employeeByEmail.get('sarah.chen@elevatehr.dev') ?? null;
  const marcusId = employeeByEmail.get('marcus.thompson@elevatehr.dev') ?? null;
  const elenaId = employeeByEmail.get('elena.kowalski@elevatehr.dev') ?? null;
  const fatimaId = employeeByEmail.get('fatima.hassan@elevatehr.dev') ?? null;
  const alexId = employeeByEmail.get('alex.moreau@elevatehr.dev') ?? null;

  const engPlatformOrgUnitId = orgUnitByCode.get('ENG-PLATFORM') ?? null;
  const financeOrgUnitId = orgUnitByCode.get('FINANCE') ?? null;
  const productOrgUnitId = orgUnitByCode.get('PRODUCT') ?? null;

  const platformClassificationId = classificationByCode.get('PLATFORM') ?? null;
  const softwareClassificationId = classificationByCode.get('SWE') ?? null;
  const financeClassificationId = classificationByCode.get('FIN-ANL') ?? null;
  const pmClassificationId = classificationByCode.get('PM') ?? null;

  const platformLevel10Id = levelByKey.get('PLATFORM:10') ?? null;
  const softwareLevel9Id = levelByKey.get('SWE:9') ?? null;
  const financeLevel7Id = levelByKey.get('FIN-ANL:7') ?? null;
  const financeLevel8Id = levelByKey.get('FIN-ANL:8') ?? null;
  const pmLevel9Id = levelByKey.get('PM:9') ?? null;

  const engineeringDirectorPositionId = positionByCode.get('POS-ENG-DIR-001') ?? null;
  const engineerVacancyPositionId = positionByCode.get('POS-ENG-SWE-009') ?? null;
  const financeVacancyPositionId = positionByCode.get('POS-FIN-ANL-007') ?? null;
  const productManagerPositionId = positionByCode.get('POS-PROD-PM-009') ?? null;
  const peopleHrbpPositionId = positionByCode.get('POS-PEOPLE-HRBP-009') ?? null;

  const netNewRequestTypeId = requestTypeByCode.get('NET_NEW') ?? null;
  const backfillRequestTypeId = requestTypeByCode.get('BACKFILL') ?? null;
  const tempFillRequestTypeId = requestTypeByCode.get('TEMP_FILL') ?? null;
  const permanentFundingTypeId = fundingTypeByCode.get('PERM') ?? null;
  const temporaryFundingTypeId = fundingTypeByCode.get('TEMP') ?? null;
  const grantFundingTypeId = fundingTypeByCode.get('GRANT') ?? null;

  if (
    !netNewRequestTypeId
    || !backfillRequestTypeId
    || !tempFillRequestTypeId
    || !permanentFundingTypeId
    || !temporaryFundingTypeId
    || !grantFundingTypeId
    || !engPlatformOrgUnitId
    || !financeOrgUnitId
    || !productOrgUnitId
    || !platformClassificationId
    || !softwareClassificationId
    || !financeClassificationId
    || !pmClassificationId
    || !platformLevel10Id
    || !softwareLevel9Id
    || !financeLevel7Id
    || !financeLevel8Id
    || !pmLevel9Id
    || !engineeringDirectorPositionId
    || !engineerVacancyPositionId
    || !financeVacancyPositionId
    || !productManagerPositionId
    || !peopleHrbpPositionId
    || !sarahId
    || !marcusId
    || !elenaId
    || !fatimaId
    || !alexId
  ) {
    return;
  }

  const activeRuleSet = await prisma.approvalRuleSet.create({
    data: {
      name: 'FY2026 Core Position Routing',
      description: 'Primary request routing for net-new, backfill, and temporary coverage requests.',
      status: 'Active',
      version: 1,
      effectiveStartDate: new Date('2026-01-01T00:00:00Z'),
      publishedAt: new Date('2026-01-01T08:00:00Z'),
      createdByAccountId: hrAdminAccountId,
      updatedByAccountId: hrAdminAccountId,
    },
  });

  const netNewRule = await prisma.approvalRule.create({
    data: {
      ruleSetId: activeRuleSet.id,
      name: 'Net new permanent budget approval',
      priority: 300,
      isActive: true,
      isFallback: false,
      requestTypeId: netNewRequestTypeId,
      fundingTypeId: permanentFundingTypeId,
      budgetImpacting: true,
      orgUnitId: engPlatformOrgUnitId,
      steps: {
        create: [
          {
            stepOrder: 1,
            label: 'Manager or HR intake review',
            assigneeSource: 'RequestorManager',
            fallbackQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
            dueDays: 2,
          },
          {
            stepOrder: 2,
            label: 'Finance review',
            assigneeSource: 'Queue',
            assigneeValue: ACCOUNT_QUEUE_FINANCE,
            fallbackQueueKey: ACCOUNT_QUEUE_FINANCE,
            dueDays: 3,
          },
          {
            stepOrder: 3,
            label: 'HRBP review',
            assigneeSource: 'Queue',
            assigneeValue: ACCOUNT_QUEUE_HRBP,
            fallbackQueueKey: ACCOUNT_QUEUE_HRBP,
            dueDays: 2,
          },
        ],
      },
    },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });

  const backfillRule = await prisma.approvalRule.create({
    data: {
      ruleSetId: activeRuleSet.id,
      name: 'Backfill temporary coverage',
      priority: 250,
      isActive: true,
      isFallback: false,
      requestTypeId: backfillRequestTypeId,
      fundingTypeId: temporaryFundingTypeId,
      budgetImpacting: false,
      steps: {
        create: [
          {
            stepOrder: 1,
            label: 'Position manager review',
            assigneeSource: 'PositionIncumbent',
            fallbackQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
            dueDays: 2,
          },
        ],
      },
    },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });

  const fallbackRule = await prisma.approvalRule.create({
    data: {
      ruleSetId: activeRuleSet.id,
      name: 'Default HR operations routing',
      priority: 100,
      isActive: true,
      isFallback: true,
      steps: {
        create: [
          {
            stepOrder: 1,
            label: 'HR operations review',
            assigneeSource: 'Queue',
            assigneeValue: ACCOUNT_QUEUE_HR_OPERATIONS,
            fallbackQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
            dueDays: 2,
          },
        ],
      },
    },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });

  const createStatusHistory = async (
    jobRequestId: string,
    entries: Array<{
      status: string;
      action: string;
      comments?: string | null;
      actorEmployeeId?: string | null;
      actorAccountId?: string | null;
      createdAt: Date;
    }>,
  ) => {
    for (const entry of entries) {
      await prisma.jobRequestStatusHistory.create({
        data: {
          jobRequestId,
          status: entry.status,
          action: entry.action,
          comments: entry.comments ?? null,
          actorEmployeeId: entry.actorEmployeeId ?? null,
          actorAccountId: entry.actorAccountId ?? null,
          createdAt: entry.createdAt,
        },
      });
    }
  };

  const requestOne = await prisma.jobRequest.create({
    data: {
      requestNumber: 'REQ-00001',
      requestTypeId: netNewRequestTypeId,
      requestorEmployeeId: sarahId,
      requestorAccountId: sarahAccountId,
      budgetImpacting: true,
      fundingTypeId: permanentFundingTypeId,
      orgUnitId: engPlatformOrgUnitId,
      classificationId: platformClassificationId,
      levelId: platformLevel10Id,
      reportsToPositionId: engineeringDirectorPositionId,
      approvalRuleSetId: activeRuleSet.id,
      approvalRuleId: netNewRule.id,
      title: 'Staff Platform Engineer',
      headcount: 1,
      fte: new Prisma.Decimal(1),
      weeklyHours: new Prisma.Decimal(40),
      status: 'In Review',
      justification: 'Expand platform reliability coverage for the growing customer base.',
      businessCase: 'A dedicated staff-level platform seat is required to reduce incident response load and improve deployment resilience.',
      currentStepOrder: 2,
      submittedAt: new Date('2026-03-11T13:00:00Z'),
      fieldValues: {
        create: [
          { fieldKey: 'requestedStartDate', fieldLabel: 'Requested start date', valueType: 'date', value: '2026-05-04' },
          { fieldKey: 'workLocation', fieldLabel: 'Primary work location', valueType: 'text', value: 'Regina / hybrid' },
        ],
      },
    },
  });

  await createStatusHistory(requestOne.id, [
    { status: 'Draft', action: 'Created', actorEmployeeId: sarahId, actorAccountId: sarahAccountId, createdAt: new Date('2026-03-11T12:30:00Z') },
    { status: 'In Review', action: 'Submitted', actorEmployeeId: sarahId, actorAccountId: sarahAccountId, createdAt: new Date('2026-03-11T13:00:00Z') },
    { status: 'In Review', action: 'Approved', comments: 'Initial intake and org context confirmed.', actorEmployeeId: elenaId, actorAccountId: elenaAccountId, createdAt: new Date('2026-03-12T15:00:00Z') },
  ]);

  const requestOneStepOneTask = await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestApproval',
      title: 'Review REQ-00001 intake',
      description: 'Manager or HR intake review for Staff Platform Engineer request.',
      status: 'Completed',
      priority: 'Normal',
      dueDate: new Date('2026-03-12T23:59:00Z'),
      ownerLabel: 'HR Operations',
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestOne.id,
      completedAt: new Date('2026-03-12T15:00:00Z'),
    },
  });
  await prisma.approvalAction.create({
    data: {
      taskId: requestOneStepOneTask.id,
      actorEmployeeId: elenaId,
      action: 'Approve',
      comments: 'Initial intake approved.',
      createdAt: new Date('2026-03-12T15:00:00Z'),
    },
  });
  const requestOneStepOne = await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestOne.id,
      ruleStepId: netNewRule.steps[0]?.id ?? null,
      stepOrder: 1,
      label: 'Manager or HR intake review',
      assigneeSource: 'RequestorManager',
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      status: 'Approved',
      dueDate: new Date('2026-03-12T23:59:00Z'),
      respondedAt: new Date('2026-03-12T15:00:00Z'),
      workflowTaskId: requestOneStepOneTask.id,
    },
  });
  await prisma.jobRequestApprovalDecision.create({
    data: {
      approvalStepId: requestOneStepOne.id,
      action: 'Approved',
      comments: 'Initial intake and org context confirmed.',
      actorEmployeeId: elenaId,
      actorAccountId: elenaAccountId,
      createdAt: new Date('2026-03-12T15:00:00Z'),
    },
  });
  const requestOneStepTwoTask = await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestApproval',
      title: 'Finance review for REQ-00001',
      description: 'Finance review required for budget-impacting net-new request.',
      status: 'Open',
      priority: 'High',
      dueDate: new Date('2026-03-15T23:59:00Z'),
      assigneeQueueKey: ACCOUNT_QUEUE_FINANCE,
      ownerLabel: 'Finance',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestOne.id,
    },
  });
  await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestOne.id,
      ruleStepId: netNewRule.steps[1]?.id ?? null,
      stepOrder: 2,
      label: 'Finance review',
      assigneeSource: 'Queue',
      assigneeQueueKey: ACCOUNT_QUEUE_FINANCE,
      assigneeValue: ACCOUNT_QUEUE_FINANCE,
      status: 'Pending',
      dueDate: new Date('2026-03-15T23:59:00Z'),
      workflowTaskId: requestOneStepTwoTask.id,
    },
  });
  await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestOne.id,
      ruleStepId: netNewRule.steps[2]?.id ?? null,
      stepOrder: 3,
      label: 'HRBP review',
      assigneeSource: 'Queue',
      assigneeQueueKey: ACCOUNT_QUEUE_HRBP,
      assigneeValue: ACCOUNT_QUEUE_HRBP,
      status: 'Pending',
      dueDate: new Date('2026-03-17T23:59:00Z'),
    },
  });

  const requestTwo = await prisma.jobRequest.create({
    data: {
      requestNumber: 'REQ-00002',
      requestTypeId: backfillRequestTypeId,
      requestorEmployeeId: marcusId,
      requestorAccountId: accountByEmail.get('marcus.thompson@elevatehr.dev') ?? null,
      budgetImpacting: false,
      fundingTypeId: temporaryFundingTypeId,
      orgUnitId: engPlatformOrgUnitId,
      classificationId: softwareClassificationId,
      levelId: softwareLevel9Id,
      reportsToPositionId: engineeringDirectorPositionId,
      targetPositionId: engineerVacancyPositionId,
      linkedPositionId: engineerVacancyPositionId,
      approvalRuleSetId: activeRuleSet.id,
      approvalRuleId: backfillRule.id,
      title: 'Software Engineer',
      headcount: 1,
      fte: new Prisma.Decimal(1),
      weeklyHours: new Prisma.Decimal(40),
      status: 'Closed',
      justification: 'Restore engineering capacity after a recent departure.',
      businessCase: 'Backfill required to preserve delivery throughput and platform support coverage.',
      currentStepOrder: 1,
      submittedAt: new Date('2026-03-06T14:00:00Z'),
      approvedAt: new Date('2026-03-07T17:00:00Z'),
      closedAt: new Date('2026-03-17T18:00:00Z'),
      fieldValues: {
        create: [
          { fieldKey: 'vacancyReason', fieldLabel: 'Vacancy reason', valueType: 'text', value: 'Voluntary resignation' },
          { fieldKey: 'departureDate', fieldLabel: 'Departure date', valueType: 'date', value: '2026-02-28' },
        ],
      },
    },
  });

  await prisma.position.update({
    where: { id: engineerVacancyPositionId },
    data: {
      positionStatus: 'Filled',
      fundingTypeId: temporaryFundingTypeId,
      budgetImpacting: false,
      lastApprovedRequestId: requestTwo.id,
      currentCompetitionNumber: 'COMP-2026-014',
    },
  });

  await createStatusHistory(requestTwo.id, [
    { status: 'Draft', action: 'Created', actorEmployeeId: marcusId, actorAccountId: accountByEmail.get('marcus.thompson@elevatehr.dev') ?? null, createdAt: new Date('2026-03-06T13:30:00Z') },
    { status: 'In Review', action: 'Submitted', actorEmployeeId: marcusId, actorAccountId: accountByEmail.get('marcus.thompson@elevatehr.dev') ?? null, createdAt: new Date('2026-03-06T14:00:00Z') },
    { status: 'Approved', action: 'Approved', comments: 'Backfill approved for temporary coverage.', actorEmployeeId: sarahId, actorAccountId: sarahAccountId, createdAt: new Date('2026-03-07T17:00:00Z') },
    { status: 'Closed', action: 'Hiring Closed', comments: 'Competition closed and hire captured.', actorEmployeeId: elenaId, actorAccountId: elenaAccountId, createdAt: new Date('2026-03-17T18:00:00Z') },
  ]);

  const requestTwoTask = await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestApproval',
      title: 'Approve REQ-00002 backfill',
      description: 'Manager approval for engineering backfill request.',
      status: 'Completed',
      priority: 'Normal',
      dueDate: new Date('2026-03-07T23:59:00Z'),
      assigneeAccountId: sarahAccountId,
      ownerEmployeeId: sarahId,
      ownerLabel: 'Manager',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestTwo.id,
      completedAt: new Date('2026-03-07T17:00:00Z'),
    },
  });
  await prisma.approvalAction.create({
    data: {
      taskId: requestTwoTask.id,
      actorEmployeeId: sarahId,
      action: 'Approve',
      comments: 'Backfill approved.',
      createdAt: new Date('2026-03-07T17:00:00Z'),
    },
  });
  const requestTwoStep = await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestTwo.id,
      ruleStepId: backfillRule.steps[0]?.id ?? null,
      stepOrder: 1,
      label: 'Position manager review',
      assigneeSource: 'PositionIncumbent',
      ownerEmployeeId: sarahId,
      assigneeAccountId: sarahAccountId,
      status: 'Approved',
      dueDate: new Date('2026-03-07T23:59:00Z'),
      respondedAt: new Date('2026-03-07T17:00:00Z'),
      workflowTaskId: requestTwoTask.id,
    },
  });
  await prisma.jobRequestApprovalDecision.create({
    data: {
      approvalStepId: requestTwoStep.id,
      action: 'Approved',
      comments: 'Backfill approved for temporary coverage.',
      actorEmployeeId: sarahId,
      actorAccountId: sarahAccountId,
      createdAt: new Date('2026-03-07T17:00:00Z'),
    },
  });
  const requestTwoHiring = await prisma.hiringRecord.create({
    data: {
      jobRequestId: requestTwo.id,
      positionId: engineerVacancyPositionId,
      candidateName: 'Taylor Brooks',
      competitionNumber: 'COMP-2026-014',
      compensationAmount: new Prisma.Decimal(126000),
      payFrequency: 'Biweekly',
      hireDate: new Date('2026-03-17T00:00:00Z'),
      notes: 'External candidate accepted the offer.',
    },
  });
  await prisma.employeeSnapshot.create({
    data: {
      employeeId: null,
      jobRequestId: requestTwo.id,
      hiringRecordId: requestTwoHiring.id,
      positionId: engineerVacancyPositionId,
      employeeNumber: null,
      firstName: 'Taylor',
      lastName: 'Brooks',
      fullName: 'Taylor Brooks',
      email: null,
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      orgUnitName: 'Platform Engineering',
      positionCode: 'POS-ENG-SWE-009',
      classificationCode: 'SWE',
      levelCode: '9',
      managerName: 'Sarah Chen',
      compensationAmount: new Prisma.Decimal(126000),
      payFrequency: 'Biweekly',
      competitionNumber: 'COMP-2026-014',
      hireDate: new Date('2026-03-17T00:00:00Z'),
    },
  });

  const requestThree = await prisma.jobRequest.create({
    data: {
      requestNumber: 'REQ-00003',
      requestTypeId: netNewRequestTypeId,
      requestorEmployeeId: alexId,
      requestorAccountId: alexAccountId,
      budgetImpacting: true,
      fundingTypeId: grantFundingTypeId,
      orgUnitId: productOrgUnitId,
      classificationId: pmClassificationId,
      levelId: pmLevel9Id,
      reportsToPositionId: productManagerPositionId,
      approvalRuleSetId: activeRuleSet.id,
      approvalRuleId: fallbackRule.id,
      title: 'Senior Product Manager',
      headcount: 1,
      fte: new Prisma.Decimal(1),
      weeklyHours: new Prisma.Decimal(40),
      status: 'Needs Rework',
      justification: 'Add delivery leadership for a new grant-funded initiative.',
      businessCase: 'Request needs a stronger business case and clearer grant duration before approval.',
      currentStepOrder: 1,
      submittedAt: new Date('2026-03-08T14:00:00Z'),
      fieldValues: {
        create: [
          { fieldKey: 'requestedStartDate', fieldLabel: 'Requested start date', valueType: 'date', value: '2026-06-01' },
          { fieldKey: 'workLocation', fieldLabel: 'Primary work location', valueType: 'text', value: 'Remote / Canada' },
        ],
      },
    },
  });

  await createStatusHistory(requestThree.id, [
    { status: 'Draft', action: 'Created', actorEmployeeId: alexId, actorAccountId: alexAccountId, createdAt: new Date('2026-03-08T13:20:00Z') },
    { status: 'In Review', action: 'Submitted', actorEmployeeId: alexId, actorAccountId: alexAccountId, createdAt: new Date('2026-03-08T14:00:00Z') },
    { status: 'Needs Rework', action: 'Needs Rework', comments: 'Clarify the funding duration and expected grant outcomes.', actorEmployeeId: elenaId, actorAccountId: elenaAccountId, createdAt: new Date('2026-03-10T11:30:00Z') },
  ]);

  const requestThreeReviewTask = await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestApproval',
      title: 'Review REQ-00003 grant-funded request',
      description: 'HR operations review for product management request.',
      status: 'Completed',
      priority: 'Normal',
      dueDate: new Date('2026-03-10T23:59:00Z'),
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestThree.id,
      completedAt: new Date('2026-03-10T11:30:00Z'),
    },
  });
  await prisma.approvalAction.create({
    data: {
      taskId: requestThreeReviewTask.id,
      actorEmployeeId: elenaId,
      action: 'Rework',
      comments: 'Needs more detail before approval.',
      createdAt: new Date('2026-03-10T11:30:00Z'),
    },
  });
  const requestThreeStep = await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestThree.id,
      ruleStepId: fallbackRule.steps[0]?.id ?? null,
      stepOrder: 1,
      label: 'HR operations review',
      assigneeSource: 'Queue',
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      status: 'Needs Rework',
      dueDate: new Date('2026-03-10T23:59:00Z'),
      respondedAt: new Date('2026-03-10T11:30:00Z'),
      workflowTaskId: requestThreeReviewTask.id,
    },
  });
  await prisma.jobRequestApprovalDecision.create({
    data: {
      approvalStepId: requestThreeStep.id,
      action: 'Needs Rework',
      comments: 'Clarify the funding duration and expected grant outcomes.',
      actorEmployeeId: elenaId,
      actorAccountId: elenaAccountId,
      createdAt: new Date('2026-03-10T11:30:00Z'),
    },
  });
  await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestRework',
      title: 'Rework REQ-00003',
      description: 'Update the business case and grant details before resubmission.',
      status: 'Open',
      priority: 'High',
      dueDate: new Date('2026-03-20T23:59:00Z'),
      ownerEmployeeId: alexId,
      assigneeAccountId: alexAccountId,
      ownerLabel: 'Requestor',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestThree.id,
    },
  });

  const requestFour = await prisma.jobRequest.create({
    data: {
      requestNumber: 'REQ-00004',
      requestTypeId: tempFillRequestTypeId,
      requestorEmployeeId: fatimaId,
      requestorAccountId: fatimaAccountId,
      budgetImpacting: false,
      fundingTypeId: temporaryFundingTypeId,
      orgUnitId: financeOrgUnitId,
      classificationId: financeClassificationId,
      levelId: financeLevel7Id,
      reportsToPositionId: peopleHrbpPositionId,
      targetPositionId: financeVacancyPositionId,
      linkedPositionId: financeVacancyPositionId,
      approvalRuleSetId: activeRuleSet.id,
      approvalRuleId: fallbackRule.id,
      title: 'Financial Analyst',
      headcount: 1,
      fte: new Prisma.Decimal(1),
      weeklyHours: new Prisma.Decimal(40),
      status: 'Approved',
      justification: 'Temporary coverage is needed during the fiscal close support period.',
      businessCase: 'Finance requires short-term analyst capacity while workload remains elevated.',
      currentStepOrder: 1,
      submittedAt: new Date('2026-03-12T09:00:00Z'),
      approvedAt: new Date('2026-03-13T15:45:00Z'),
      fieldValues: {
        create: [
          { fieldKey: 'coverageEndDate', fieldLabel: 'Coverage end date', valueType: 'date', value: '2026-09-30' },
          { fieldKey: 'coverageReason', fieldLabel: 'Coverage reason', valueType: 'text', value: 'Fiscal close support' },
        ],
      },
    },
  });

  await prisma.position.update({
    where: { id: financeVacancyPositionId },
    data: {
      positionStatus: 'In Progress',
      fundingTypeId: temporaryFundingTypeId,
      budgetImpacting: false,
      lastApprovedRequestId: requestFour.id,
    },
  });

  await createStatusHistory(requestFour.id, [
    { status: 'Draft', action: 'Created', actorEmployeeId: fatimaId, actorAccountId: fatimaAccountId, createdAt: new Date('2026-03-12T08:30:00Z') },
    { status: 'In Review', action: 'Submitted', actorEmployeeId: fatimaId, actorAccountId: fatimaAccountId, createdAt: new Date('2026-03-12T09:00:00Z') },
    { status: 'Approved', action: 'Approved', comments: 'Coverage approved pending requisition close-out.', actorEmployeeId: elenaId, actorAccountId: elenaAccountId, createdAt: new Date('2026-03-13T15:45:00Z') },
  ]);

  const requestFourApprovalTask = await prisma.workflowTask.create({
    data: {
      taskType: 'JobRequestApproval',
      title: 'Approve REQ-00004 temporary finance coverage',
      description: 'HR operations approval for temporary finance coverage.',
      status: 'Completed',
      priority: 'Normal',
      dueDate: new Date('2026-03-13T23:59:00Z'),
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestFour.id,
      completedAt: new Date('2026-03-13T15:45:00Z'),
    },
  });
  await prisma.approvalAction.create({
    data: {
      taskId: requestFourApprovalTask.id,
      actorEmployeeId: elenaId,
      action: 'Approve',
      comments: 'Approved for temporary coverage.',
      createdAt: new Date('2026-03-13T15:45:00Z'),
    },
  });
  const requestFourStep = await prisma.jobRequestApprovalStep.create({
    data: {
      jobRequestId: requestFour.id,
      ruleStepId: fallbackRule.steps[0]?.id ?? null,
      stepOrder: 1,
      label: 'HR operations review',
      assigneeSource: 'Queue',
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      status: 'Approved',
      dueDate: new Date('2026-03-13T23:59:00Z'),
      respondedAt: new Date('2026-03-13T15:45:00Z'),
      workflowTaskId: requestFourApprovalTask.id,
    },
  });
  await prisma.jobRequestApprovalDecision.create({
    data: {
      approvalStepId: requestFourStep.id,
      action: 'Approved',
      comments: 'Approved for temporary coverage.',
      actorEmployeeId: elenaId,
      actorAccountId: elenaAccountId,
      createdAt: new Date('2026-03-13T15:45:00Z'),
    },
  });
  await prisma.workflowTask.create({
    data: {
      taskType: 'HiringCloseout',
      title: 'Close out hiring for REQ-00004',
      description: 'Capture competition details and selected candidate for the approved finance request.',
      status: 'Open',
      priority: 'High',
      dueDate: new Date('2026-03-21T23:59:00Z'),
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
      relatedEntityType: 'JobRequest',
      relatedEntityId: requestFour.id,
    },
  });

  await prisma.sequence.upsert({
    where: { key: 'job_request' },
    update: { currentValue: 4 },
    create: { key: 'job_request', currentValue: 4 },
  });
  await prisma.sequence.upsert({
    where: { key: 'position_code' },
    update: { currentValue: positions.length },
    create: { key: 'position_code', currentValue: positions.length },
  });
}

async function main() {
  console.log('Seeding organization, employees, and HR Ops data...');

  const orgUnitByCode = await seedOrgUnits();
  const { classificationByCode, levelByKey } = await seedClassifications();
  const positionByCode = await seedPositions(orgUnitByCode, classificationByCode, levelByKey);
  const employeeByEmail = await seedEmployees(positionByCode);
  const accountByEmail = await seedAppAccounts(employeeByEmail);
  const leaveTypeByCode = await seedTimeOffReferenceData();
  const checklistTemplateByCode = await seedChecklistTemplates();
  const { categoryByCode, templateByCode } = await seedDocumentReferenceData();

  await resetOperationalData();
  await seedLeaveRequests(employeeByEmail, leaveTypeByCode);
  await seedTimeAttendance(employeeByEmail, orgUnitByCode, classificationByCode);
  await seedLifecycleData(employeeByEmail, checklistTemplateByCode);
  await seedDocuments(employeeByEmail, categoryByCode, templateByCode);
  await seedPerformance(employeeByEmail, orgUnitByCode);
  await seedRecruitment(employeeByEmail, accountByEmail, orgUnitByCode, classificationByCode, levelByKey, positionByCode);
  await seedLearning(employeeByEmail, accountByEmail, orgUnitByCode, positionByCode, classificationByCode);
  await seedSkills(employeeByEmail);

  console.log(`Seeded ${employees.length} employees, ${positions.length} positions, ${classifications.length} classifications, HR Ops data, time and attendance data, performance data, recruitment data, and learning data successfully.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
