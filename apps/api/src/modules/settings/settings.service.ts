import { prisma } from '../../shared/lib/prisma';
import { type FeatureKey, getFeatureStateRecord, listFeatureStates } from '../../shared/lib/features';
import { createHttpError, trimToNull } from '../../shared/lib/service-utils';
import {
  createApprovalRuleSet,
  createFundingType,
  createRequestType,
  listApprovalRuleSets,
  listFundingTypes,
  listRequestTypes,
  publishApprovalRuleSet,
  simulateApprovalRuleSet,
  updateApprovalRuleSet,
  updateFundingType,
  updateRequestType,
} from '../recruitment/recruitment.service';
import type {
  ApprovalRuleSetInput,
  CreateSkillCategoryInput,
  CreateSkillTagInput,
  FundingTypeInput,
  RequestTypeInput,
  SimulateApprovalRuleSetInput,
  UpdateApprovalRuleSetInput,
  UpdateFundingTypeInput,
  UpdateRequestTypeInput,
  UpdateSkillCategoryInput,
  UpdateSkillTagInput,
} from './settings.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);

function assertHrAdmin(roles: string[]) {
  if (!roles.some((role) => HR_ADMIN_ROLES.has(role))) {
    throw createHttpError(403, 'Only HR administrators can manage application settings.');
  }
}

function serializeSkillTaxonomy(categories: any[]) {
  return categories.map((category) => ({
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description ?? null,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    tags: (category.skillTags ?? []).map((tag: any) => ({
      id: tag.id,
      code: tag.code,
      name: tag.name,
      description: tag.description ?? null,
      displayOrder: tag.displayOrder,
      isActive: tag.isActive,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    })),
  }));
}

export async function listFeatureSettings(context: { roles?: string[] }) {
  assertHrAdmin(context.roles ?? []);
  return listFeatureStates();
}

export async function updateFeatureSetting(
  featureKey: FeatureKey,
  enabled: boolean,
  context: {
    roles?: string[];
    accountId?: string | null;
  },
) {
  assertHrAdmin(context.roles ?? []);

  await prisma.featureToggle.upsert({
    where: { key: featureKey },
    update: {
      enabled,
      updatedByAccountId: context.accountId ?? null,
    },
    create: {
      key: featureKey,
      enabled,
      updatedByAccountId: context.accountId ?? null,
    },
  });

  const featureStates = await getFeatureStateRecord();
  return featureStates[featureKey];
}

function toRecruitmentContext(context: { roles?: string[]; accountId?: string | null }) {
  return {
    roles: context.roles ?? [],
    currentAccountId: context.accountId ?? null,
  };
}

export async function listRequestTypeSettings(context: { roles?: string[]; accountId?: string | null }) {
  return listRequestTypes(toRecruitmentContext(context));
}

export async function createRequestTypeSetting(data: RequestTypeInput, context: { roles?: string[]; accountId?: string | null }) {
  return createRequestType(data, toRecruitmentContext(context));
}

export async function updateRequestTypeSetting(id: string, data: UpdateRequestTypeInput, context: { roles?: string[]; accountId?: string | null }) {
  return updateRequestType(id, data, toRecruitmentContext(context));
}

export async function listFundingTypeSettings(context: { roles?: string[]; accountId?: string | null }) {
  return listFundingTypes(toRecruitmentContext(context));
}

export async function createFundingTypeSetting(data: FundingTypeInput, context: { roles?: string[]; accountId?: string | null }) {
  return createFundingType(data, toRecruitmentContext(context));
}

export async function updateFundingTypeSetting(id: string, data: UpdateFundingTypeInput, context: { roles?: string[]; accountId?: string | null }) {
  return updateFundingType(id, data, toRecruitmentContext(context));
}

export async function listApprovalRuleSetSettings(context: { roles?: string[]; accountId?: string | null }) {
  return listApprovalRuleSets({}, toRecruitmentContext(context));
}

export async function createApprovalRuleSetSetting(data: ApprovalRuleSetInput, context: { roles?: string[]; accountId?: string | null }) {
  return createApprovalRuleSet(data, toRecruitmentContext(context));
}

export async function updateApprovalRuleSetSetting(id: string, data: UpdateApprovalRuleSetInput, context: { roles?: string[]; accountId?: string | null }) {
  return updateApprovalRuleSet(id, data, toRecruitmentContext(context));
}

export async function publishApprovalRuleSetSetting(id: string, context: { roles?: string[]; accountId?: string | null }) {
  return publishApprovalRuleSet(id, toRecruitmentContext(context));
}

export async function simulateApprovalRuleSetSetting(id: string, data: SimulateApprovalRuleSetInput, context: { roles?: string[]; accountId?: string | null }) {
  return simulateApprovalRuleSet(id, data, toRecruitmentContext(context));
}

export async function listSkillSettings(context: { roles?: string[] }) {
  assertHrAdmin(context.roles ?? []);

  const categories = await prisma.skillCategory.findMany({
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      displayOrder: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      skillTags: {
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          displayOrder: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return serializeSkillTaxonomy(categories);
}

export async function createSkillCategory(
  data: CreateSkillCategoryInput,
  context: { roles?: string[] },
) {
  assertHrAdmin(context.roles ?? []);

  await prisma.skillCategory.create({
    data: {
      code: data.code,
      name: data.name,
      description: trimToNull(data.description),
      displayOrder: data.displayOrder,
      isActive: data.isActive,
    },
  });

  return listSkillSettings(context);
}

export async function updateSkillCategory(
  categoryId: string,
  data: UpdateSkillCategoryInput,
  context: { roles?: string[] },
) {
  assertHrAdmin(context.roles ?? []);

  await prisma.skillCategory.update({
    where: { id: categoryId },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      description: data.description === undefined ? undefined : trimToNull(data.description),
      displayOrder: data.displayOrder ?? undefined,
      isActive: data.isActive ?? undefined,
    },
  });

  return listSkillSettings(context);
}

export async function createSkillTag(
  data: CreateSkillTagInput,
  context: { roles?: string[] },
) {
  assertHrAdmin(context.roles ?? []);

  await prisma.skillTag.create({
    data: {
      categoryId: data.categoryId,
      code: data.code,
      name: data.name,
      description: trimToNull(data.description),
      displayOrder: data.displayOrder,
      isActive: data.isActive,
    },
  });

  return listSkillSettings(context);
}

export async function updateSkillTag(
  tagId: string,
  data: UpdateSkillTagInput,
  context: { roles?: string[] },
) {
  assertHrAdmin(context.roles ?? []);

  await prisma.skillTag.update({
    where: { id: tagId },
    data: {
      categoryId: data.categoryId ?? undefined,
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      description: data.description === undefined ? undefined : trimToNull(data.description),
      displayOrder: data.displayOrder ?? undefined,
      isActive: data.isActive ?? undefined,
    },
  });

  return listSkillSettings(context);
}
