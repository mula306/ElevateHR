import { prisma } from '../../shared/lib/prisma';

function getQuarterStart(date: Date): Date {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getDashboardSummary() {
  const now = new Date();
  const quarterStart = getQuarterStart(now);
  const hiringTrendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [employees, recentEmployees] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
        hireDate: true,
        status: true,
        salary: true,
      },
    }),
    prisma.employee.findMany({
      take: 5,
      orderBy: [
        { hireDate: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
        hireDate: true,
        status: true,
      },
    }),
  ]);

  const departmentStats = new Map<string, { employeeCount: number; annualPayroll: number }>();
  const hiringTrend = new Map<string, number>();

  for (let offset = 0; offset < 6; offset += 1) {
    const bucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    hiringTrend.set(formatMonthKey(bucketDate), 0);
  }

  let totalEmployees = 0;
  let currentEmployees = 0;
  let activeEmployees = 0;
  let onLeaveEmployees = 0;
  let probationEmployees = 0;
  let terminatedEmployees = 0;
  let newHiresThisQuarter = 0;
  let annualPayroll = 0;

  for (const employee of employees) {
    totalEmployees += 1;
    const salary = Number(employee.salary);
    const isCurrentEmployee = employee.status !== 'Terminated';

    if (employee.status === 'Active') {
      activeEmployees += 1;
    }
    if (employee.status === 'On Leave') {
      onLeaveEmployees += 1;
    }
    if (employee.status === 'Probation') {
      probationEmployees += 1;
    }
    if (employee.status === 'Terminated') {
      terminatedEmployees += 1;
    }

    if (isCurrentEmployee) {
      currentEmployees += 1;
      annualPayroll += salary;

      const existingDepartment = departmentStats.get(employee.department) ?? {
        employeeCount: 0,
        annualPayroll: 0,
      };

      existingDepartment.employeeCount += 1;
      existingDepartment.annualPayroll += salary;
      departmentStats.set(employee.department, existingDepartment);
    }

    if (employee.hireDate >= quarterStart) {
      newHiresThisQuarter += 1;
    }

    if (employee.hireDate >= hiringTrendStart) {
      const bucketKey = formatMonthKey(getMonthStart(employee.hireDate));
      hiringTrend.set(bucketKey, (hiringTrend.get(bucketKey) ?? 0) + 1);
    }
  }

  return {
    metrics: {
      totalEmployees,
      currentEmployees,
      activeEmployees,
      onLeaveEmployees,
      probationEmployees,
      terminatedEmployees,
      newHiresThisQuarter,
      annualPayroll,
    },
    departmentDistribution: [...departmentStats.entries()]
      .map(([department, values]) => ({
        department,
        employeeCount: values.employeeCount,
        annualPayroll: values.annualPayroll,
        workforceShare: currentEmployees === 0
          ? 0
          : Number(((values.employeeCount / currentEmployees) * 100).toFixed(1)),
      }))
      .sort((left, right) => right.employeeCount - left.employeeCount),
    hiringTrend: [...hiringTrend.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([month, hires]) => ({ month, hires })),
    recentEmployees: recentEmployees.map((employee) => ({
      ...employee,
      fullName: `${employee.firstName} ${employee.lastName}`,
    })),
  };
}
