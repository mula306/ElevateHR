import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import { createHttpError, toIsoString, trimToNull } from '../../shared/lib/service-utils';
import type {
  CreateMySkillInput,
  UpdateMyProfileInput,
  UpdateMySkillInput,
} from './my-profile.schemas';

interface MyProfileContext {
  currentEmployeeId?: string | null;
  userId?: string | null;
}

function serializeEmployeeSkillForSelf(skill: any) {
  return {
    id: skill.id,
    source: skill.source,
    selfReportedLevel: skill.selfReportedLevel ?? null,
    confidence: skill.confidence ?? null,
    createdAt: toIsoString(skill.createdAt),
    updatedAt: toIsoString(skill.updatedAt),
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

function getMyProfileSelect() {
  return {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    jobTitle: true,
    department: true,
    status: true,
    payFrequency: true,
    salary: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    province: true,
    postalCode: true,
    country: true,
    emergencyName: true,
    emergencyPhone: true,
    emergencyRelation: true,
    manager: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
      },
    },
    position: {
      select: {
        id: true,
        positionCode: true,
        title: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    },
  } satisfies Prisma.EmployeeSelect;
}

function serializeProfile(profile: any) {
  return {
    id: profile.id,
    employeeNumber: profile.employeeNumber,
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: `${profile.firstName} ${profile.lastName}`,
    email: profile.email,
    phone: profile.phone ?? null,
    personalInfo: {
      email: profile.email,
      phone: profile.phone ?? null,
      addressLine1: profile.addressLine1 ?? null,
      addressLine2: profile.addressLine2 ?? null,
      city: profile.city ?? null,
      province: profile.province ?? null,
      postalCode: profile.postalCode ?? null,
      country: profile.country ?? null,
      emergencyName: profile.emergencyName ?? null,
      emergencyPhone: profile.emergencyPhone ?? null,
      emergencyRelation: profile.emergencyRelation ?? null,
    },
    employmentInfo: {
      jobTitle: profile.jobTitle,
      department: profile.department,
      status: profile.status,
      payFrequency: profile.payFrequency,
      salary: Number(profile.salary),
      manager: profile.manager
        ? {
          id: profile.manager.id,
          employeeNumber: profile.manager.employeeNumber,
          fullName: `${profile.manager.firstName} ${profile.manager.lastName}`,
          jobTitle: profile.manager.jobTitle,
        }
        : null,
      position: profile.position
        ? {
          id: profile.position.id,
          positionCode: profile.position.positionCode,
          title: profile.position.title,
        }
        : null,
      orgUnit: profile.position?.orgUnit
        ? {
          id: profile.position.orgUnit.id,
          code: profile.position.orgUnit.code,
          name: profile.position.orgUnit.name,
          type: profile.position.orgUnit.type,
        }
        : null,
    },
  };
}

function requireLinkedEmployee(context: MyProfileContext) {
  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to use My Profile.');
  }

  return context.currentEmployeeId;
}

export async function getMyProfile(context: MyProfileContext) {
  if (!context.currentEmployeeId) {
    return {
      accountLinked: false,
      profile: null,
    };
  }

  const profile = await prisma.employee.findUnique({
    where: { id: context.currentEmployeeId },
    select: getMyProfileSelect(),
  });

  if (!profile) {
    return {
      accountLinked: false,
      profile: null,
    };
  }

  return {
    accountLinked: true,
    profile: serializeProfile(profile),
  };
}

export async function updateMyProfile(data: UpdateMyProfileInput, context: MyProfileContext) {
  const employeeId = requireLinkedEmployee(context);

  const profile = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      email: data.email,
      phone: trimToNull(data.phone),
      addressLine1: trimToNull(data.addressLine1),
      addressLine2: trimToNull(data.addressLine2),
      city: trimToNull(data.city),
      province: trimToNull(data.province),
      postalCode: trimToNull(data.postalCode),
      country: data.country,
      emergencyName: trimToNull(data.emergencyName),
      emergencyPhone: trimToNull(data.emergencyPhone),
      emergencyRelation: trimToNull(data.emergencyRelation),
      updatedBy: context.userId ?? null,
    },
    select: getMyProfileSelect(),
  });

  return serializeProfile(profile);
}

export async function listMySkills(context: MyProfileContext) {
  const employeeId = requireLinkedEmployee(context);

  const skills = await prisma.employeeSkill.findMany({
    where: {
      employeeId,
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
      createdAt: true,
      updatedAt: true,
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

  return skills.map(serializeEmployeeSkillForSelf);
}

export async function createMySkill(data: CreateMySkillInput, context: MyProfileContext) {
  const employeeId = requireLinkedEmployee(context);

  const skillTag = await prisma.skillTag.findFirst({
    where: {
      id: data.skillTagId,
      isActive: true,
      category: {
        isActive: true,
      },
    },
    select: { id: true },
  });

  if (!skillTag) {
    throw createHttpError(404, 'Selected skill was not found.');
  }

  const skill = await prisma.employeeSkill.upsert({
    where: {
      employeeId_skillTagId_source: {
        employeeId,
        skillTagId: data.skillTagId,
        source: 'Self',
      },
    },
    update: {
      selfReportedLevel: trimToNull(data.selfReportedLevel),
      confidence: data.confidence ?? null,
    },
    create: {
      employeeId,
      skillTagId: data.skillTagId,
      source: 'Self',
      selfReportedLevel: trimToNull(data.selfReportedLevel),
      confidence: data.confidence ?? null,
    },
    select: {
      id: true,
      source: true,
      selfReportedLevel: true,
      confidence: true,
      createdAt: true,
      updatedAt: true,
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

  return serializeEmployeeSkillForSelf(skill);
}

export async function updateMySkill(skillId: string, data: UpdateMySkillInput, context: MyProfileContext) {
  const employeeId = requireLinkedEmployee(context);

  const skill = await prisma.employeeSkill.findFirst({
    where: {
      id: skillId,
      employeeId,
      source: 'Self',
    },
    select: { id: true },
  });

  if (!skill) {
    throw createHttpError(404, 'Employee skill was not found.');
  }

  const updatedSkill = await prisma.employeeSkill.update({
    where: { id: skillId },
    data: {
      selfReportedLevel: trimToNull(data.selfReportedLevel),
      confidence: data.confidence ?? null,
    },
    select: {
      id: true,
      source: true,
      selfReportedLevel: true,
      confidence: true,
      createdAt: true,
      updatedAt: true,
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

  return serializeEmployeeSkillForSelf(updatedSkill);
}

export async function deleteMySkill(skillId: string, context: MyProfileContext) {
  const employeeId = requireLinkedEmployee(context);

  const deleteResult = await prisma.employeeSkill.deleteMany({
    where: {
      id: skillId,
      employeeId,
      source: 'Self',
    },
  });

  if (deleteResult.count === 0) {
    throw createHttpError(404, 'Employee skill was not found.');
  }

  return { id: skillId };
}
