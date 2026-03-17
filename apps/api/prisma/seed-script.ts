import { Prisma } from '../src/generated/prisma';
import { prisma } from '../src/shared/lib/prisma';

const orgUnits = [
  { code: 'CORP', name: 'Elevate HR', type: 'Company', parentCode: null },
  { code: 'ENG', name: 'Engineering', type: 'Department', parentCode: 'CORP' },
  { code: 'ENG-PLATFORM', name: 'Platform Engineering', type: 'Team', parentCode: 'ENG' },
  { code: 'PRODUCT', name: 'Product', type: 'Department', parentCode: 'CORP' },
  { code: 'DESIGN', name: 'Design', type: 'Team', parentCode: 'PRODUCT' },
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

const managerAssignments = [
  ['marcus.thompson@elevatehr.dev', 'sarah.chen@elevatehr.dev'],
  ['david.blackwood@elevatehr.dev', 'sarah.chen@elevatehr.dev'],
  ['priya.patel@elevatehr.dev', 'alex.moreau@elevatehr.dev'],
  ['jordan.williams@elevatehr.dev', 'alex.moreau@elevatehr.dev'],
  ['fatima.hassan@elevatehr.dev', 'elena.kowalski@elevatehr.dev'],
] as const;

function parseEmployeeNumber(employeeNumber: string): number {
  const match = employeeNumber.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1000;
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

async function main() {
  console.log('Seeding organization and employee data...');

  const orgUnitByCode = await seedOrgUnits();
  const { classificationByCode, levelByKey } = await seedClassifications();
  const positionByCode = await seedPositions(orgUnitByCode, classificationByCode, levelByKey);

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { employeeNumber: employee.employeeNumber },
      update: employee,
      create: employee,
    });
    console.log(`  - ${employee.employeeNumber} ${employee.firstName} ${employee.lastName}`);
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

  console.log(`Seeded ${employees.length} employees, ${positions.length} positions, and ${classifications.length} classifications successfully.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
