import { prisma } from '../../shared/lib/prisma';
import { createHttpError, toIsoString, trimToNull } from '../../shared/lib/service-utils';
import type {
  ListTeamSkillsQuery,
  UpdateTeamSkillValidationInput,
} from './skills.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const TERMINATED_EMPLOYEE_STATUS = 'Terminated';

interface SkillsContext {
  currentEmployeeId?: string | null;
  roles?: string[];
}

function isHrAdmin(context: SkillsContext) {
  return (context.roles ?? []).some((role) => HR_ADMIN_ROLES.has(role));
}

function serializeEmployee(employee: any) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    jobTitle: employee.jobTitle,
    status: employee.status,
  };
}

function serializeSkillCategory(category: any) {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description ?? null,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    tags: (category.skillTags ?? []).map((tag: any) => ({
      id: tag.id,
      code: tag.code,
      name: tag.name,
      description: tag.description ?? null,
      displayOrder: tag.displayOrder,
      isActive: tag.isActive,
    })),
  };
}

function serializeTeamSkill(skill: any) {
  return {
    id: skill.id,
    source: skill.source,
    selfReportedLevel: skill.selfReportedLevel ?? null,
    confidence: skill.confidence ?? null,
    validationStatus: skill.validationStatus,
    managerNote: skill.managerNote ?? null,
    validatedAt: toIsoString(skill.validatedAt),
    createdAt: toIsoString(skill.createdAt),
    updatedAt: toIsoString(skill.updatedAt),
    validatedByEmployee: skill.validatedByEmployee ? serializeEmployee(skill.validatedByEmployee) : null,
    skillTag: {
      id: skill.skillTag.id,
      code: skill.skillTag.code,
      name: skill.skillTag.name,
      description: skill.skillTag.description ?? null,
      category: skill.skillTag.category
        ? {
          id: skill.skillTag.category.id,
          code: skill.skillTag.category.code,
          name: skill.skillTag.category.name,
        }
        : null,
    },
  };
}

export async function listActiveSkillTaxonomy() {
  const categories = await prisma.skillCategory.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      displayOrder: true,
      isActive: true,
      skillTags: {
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          displayOrder: true,
          isActive: true,
        },
      },
    },
  });

  return categories.map(serializeSkillCategory);
}

async function getVisibleEmployeeIds(context: SkillsContext, query: ListTeamSkillsQuery) {
  if (isHrAdmin(context)) {
    if (query.employeeId) {
      return [query.employeeId];
    }

    const employees = await prisma.employee.findMany({
      where: {
        status: { not: TERMINATED_EMPLOYEE_STATUS },
      },
      select: { id: true },
    });

    return employees.map((employee) => employee.id);
  }

  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to review team skills.');
  }

  const directReports = await prisma.employee.findMany({
    where: {
      managerId: context.currentEmployeeId,
      status: { not: TERMINATED_EMPLOYEE_STATUS },
      ...(query.employeeId ? { id: query.employeeId } : {}),
    },
    select: { id: true },
  });

  if (query.employeeId && directReports.length === 0) {
    throw createHttpError(403, 'You can only review skills for active direct reports.');
  }

  return directReports.map((employee) => employee.id);
}

export async function listTeamSkills(query: ListTeamSkillsQuery, context: SkillsContext) {
  const employeeIds = await getVisibleEmployeeIds(context, query);

  if (employeeIds.length === 0) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      id: { in: employeeIds },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      department: true,
      jobTitle: true,
      status: true,
      employeeSkills: {
        where: {
          source: 'Self',
        },
        orderBy: [
          { skillTag: { category: { displayOrder: 'asc' } } },
          { skillTag: { displayOrder: 'asc' } },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          source: true,
          selfReportedLevel: true,
          confidence: true,
          validationStatus: true,
          managerNote: true,
          validatedAt: true,
          createdAt: true,
          updatedAt: true,
          validatedByEmployee: {
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
          skillTag: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              category: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return employees.map((employee) => ({
    employee: serializeEmployee(employee),
    skills: employee.employeeSkills.map(serializeTeamSkill),
  }));
}

async function updateValidationStatus(
  employeeSkillId: string,
  validationStatus: 'Validated' | 'NotValidated',
  data: UpdateTeamSkillValidationInput,
  context: SkillsContext,
) {
  const skill = await prisma.employeeSkill.findUnique({
    where: { id: employeeSkillId },
    select: {
      id: true,
      employeeId: true,
      employee: {
        select: {
          managerId: true,
          status: true,
        },
      },
    },
  });

  if (!skill) {
    throw createHttpError(404, 'Employee skill was not found.');
  }

  if (skill.employee.status === TERMINATED_EMPLOYEE_STATUS) {
    throw createHttpError(409, 'Terminated employee skills cannot be validated.');
  }

  if (!isHrAdmin(context)) {
    if (!context.currentEmployeeId) {
      throw createHttpError(409, 'Link your account to an employee profile to validate team skills.');
    }

    if (skill.employee.managerId !== context.currentEmployeeId) {
      throw createHttpError(403, 'You can only validate skills for active direct reports.');
    }
  }

  const updatedSkill = await prisma.employeeSkill.update({
    where: { id: employeeSkillId },
    data: {
      validationStatus,
      managerNote: trimToNull(data.managerNote),
      validatedByEmployeeId: context.currentEmployeeId ?? null,
      validatedAt: new Date(),
    },
    select: {
      id: true,
      source: true,
      selfReportedLevel: true,
      confidence: true,
      validationStatus: true,
      managerNote: true,
      validatedAt: true,
      createdAt: true,
      updatedAt: true,
      validatedByEmployee: {
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
      skillTag: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          category: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return serializeTeamSkill(updatedSkill);
}

export async function validateTeamSkill(
  employeeSkillId: string,
  data: UpdateTeamSkillValidationInput,
  context: SkillsContext,
) {
  return updateValidationStatus(employeeSkillId, 'Validated', data, context);
}

export async function markTeamSkillNotValidated(
  employeeSkillId: string,
  data: UpdateTeamSkillValidationInput,
  context: SkillsContext,
) {
  return updateValidationStatus(employeeSkillId, 'NotValidated', data, context);
}
