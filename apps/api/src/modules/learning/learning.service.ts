import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import { resolveLearningProviderAdapter } from '../../shared/lib/learning-providers';
import {
  addUtcDays,
  applyActiveLearningRulesForEmployee,
  LEARNING_ASSIGNMENT_TYPE_CONTENT,
  LEARNING_ASSIGNMENT_TYPE_PATH,
  LEARNING_RECORD_STATUS_ASSIGNED,
  LEARNING_RECORD_STATUS_CANCELLED,
  LEARNING_RECORD_STATUS_COMPLETED,
  LEARNING_RECORD_STATUS_EXPIRED,
  LEARNING_RECORD_STATUS_IN_PROGRESS,
  LEARNING_REQUIREMENT_REQUIRED,
  LEARNING_SOURCE_MANUAL,
  LEARNING_SOURCE_RULE,
  materializeLearningRecordsForSource,
  parseLearningTagList,
  serializeLearningTagList,
  syncLearningWorkflowTasks,
} from '../../shared/lib/learning-ops';
import { createHttpError, toDateValue, toIsoString, trimToNull } from '../../shared/lib/service-utils';
import type {
  CreateLearningAssignmentInput,
  CreateLearningAssignmentRuleInput,
  CreateLearningPathInput,
  LaunchLearningAssignmentInput,
  LearningWebhookInput,
  ListLearningAssignmentsQuery,
  ListLearningCatalogQuery,
  UpdateLearningAssignmentInput,
  UpdateLearningAssignmentRuleInput,
  UpdateLearningContentSkillsInput,
  UpdateLearningPathInput,
} from './learning.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);

interface LearningContext {
  currentEmployeeId?: string | null;
  currentAccountId?: string | null;
  roles?: string[];
}

function isHrAdmin(context: LearningContext) {
  return (context.roles ?? []).some((role) => HR_ADMIN_ROLES.has(role));
}

function assertHrAdmin(context: LearningContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage learning configuration.');
  }
}

function assertLinkedEmployee(context: LearningContext) {
  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to use learning.');
  }

  return context.currentEmployeeId;
}

async function getManagerScopeEmployeeIds(currentEmployeeId: string | null | undefined) {
  if (!currentEmployeeId) {
    return [];
  }

  const employees = await prisma.employee.findMany({
    where: {
      managerId: currentEmployeeId,
      status: { not: 'Terminated' },
    },
    select: { id: true },
  });

  return employees.map((employee) => employee.id);
}

function getDisplayStatus(record: {
  status: string;
  dueDate: Date | null;
  certificateExpiresAt: Date | null;
}) {
  const now = new Date();

  if (
    record.status !== LEARNING_RECORD_STATUS_COMPLETED
    && record.status !== LEARNING_RECORD_STATUS_EXPIRED
    && record.status !== LEARNING_RECORD_STATUS_CANCELLED
    && record.dueDate
    && record.dueDate < now
  ) {
    return 'Overdue';
  }

  if (
    (record.status === LEARNING_RECORD_STATUS_COMPLETED || record.status === LEARNING_RECORD_STATUS_EXPIRED)
    && record.certificateExpiresAt
    && record.certificateExpiresAt < now
  ) {
    return 'Expired';
  }

  return record.status;
}

function serializeEmployee(employee: any) {
  if (!employee) {
    return null;
  }

  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    jobTitle: employee.jobTitle,
  };
}

function serializeProvider(provider: any) {
  return {
    id: provider.id,
    code: provider.code,
    displayName: provider.displayName,
    providerType: provider.providerType,
    status: provider.status,
    syncMode: provider.syncMode,
    defaultLaunchBaseUrl: provider.defaultLaunchBaseUrl ?? null,
    lastSyncStartedAt: toIsoString(provider.lastSyncStartedAt),
    lastSyncCompletedAt: toIsoString(provider.lastSyncCompletedAt),
    lastSyncStatus: provider.lastSyncStatus ?? null,
    lastSyncMessage: provider.lastSyncMessage ?? null,
    contentCount: provider._count?.contents ?? 0,
    syncRunCount: provider._count?.syncRuns ?? 0,
  };
}

function serializeLearningContent(content: any) {
  return {
    id: content.id,
    providerContentId: content.providerContentId,
    title: content.title,
    description: content.description ?? null,
    modality: content.modality,
    durationMinutes: content.durationMinutes ?? null,
    thumbnailUrl: content.thumbnailUrl ?? null,
    launchUrl: content.launchUrl,
    tags: parseLearningTagList(content.tagList),
    versionLabel: content.versionLabel ?? null,
    certificateEligible: content.certificateEligible,
    contentStatus: content.contentStatus,
    lastSyncedAt: toIsoString(content.lastSyncedAt),
    provider: serializeProvider(content.provider),
    assignmentCount: content._count?.assignments ?? 0,
    pathCount: content._count?.pathItems ?? 0,
    skills: (content.contentSkills ?? []).map((contentSkill: any) => ({
      id: contentSkill.skillTag.id,
      code: contentSkill.skillTag.code,
      name: contentSkill.skillTag.name,
      category: contentSkill.skillTag.category
        ? {
          id: contentSkill.skillTag.category.id,
          code: contentSkill.skillTag.category.code,
          name: contentSkill.skillTag.category.name,
        }
        : null,
    })),
  };
}

function serializeLearningPath(path: any) {
  return {
    id: path.id,
    code: path.code,
    name: path.name,
    description: path.description ?? null,
    status: path.status,
    createdAt: toIsoString(path.createdAt),
    updatedAt: toIsoString(path.updatedAt),
    itemCount: path.items.length,
    assignmentCount: path._count?.assignments ?? 0,
    items: path.items.map((item: any) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      isRequired: item.isRequired,
      content: {
        id: item.content.id,
        title: item.content.title,
        modality: item.content.modality,
        providerName: item.content.provider.displayName,
      },
    })),
  };
}

function serializeLearningRecord(record: any) {
  const displayStatus = getDisplayStatus(record);
  const now = new Date();
  const isOverdue = displayStatus === 'Overdue';
  const isDueSoon = Boolean(
    record.dueDate
    && record.status !== LEARNING_RECORD_STATUS_COMPLETED
    && record.status !== LEARNING_RECORD_STATUS_CANCELLED
    && record.dueDate >= now
    && record.dueDate <= addUtcDays(now, 7),
  );

  return {
    id: record.id,
    assignmentId: record.assignmentId ?? null,
    displayStatus,
    status: record.status,
    requirementType: record.requirementType,
    mandatory: record.mandatory,
    dueDate: toIsoString(record.dueDate),
    renewalDueDate: toIsoString(record.renewalDueDate),
    assignedAt: toIsoString(record.assignedAt),
    launchedAt: toIsoString(record.launchedAt),
    lastActivityAt: toIsoString(record.lastActivityAt),
    completedAt: toIsoString(record.completedAt),
    progressPercent: record.progressPercent,
    certificateIssuedAt: toIsoString(record.certificateIssuedAt),
    certificateExpiresAt: toIsoString(record.certificateExpiresAt),
    certificateNumber: record.certificateNumber ?? null,
    providerStatus: record.providerStatus ?? null,
    isOverdue,
    isDueSoon,
    canLaunch: record.status !== LEARNING_RECORD_STATUS_COMPLETED && record.status !== LEARNING_RECORD_STATUS_CANCELLED,
    employee: serializeEmployee(record.employee),
    content: {
      id: record.content.id,
      title: record.content.title,
      description: record.content.description ?? null,
      modality: record.content.modality,
      durationMinutes: record.content.durationMinutes ?? null,
      launchUrl: record.content.launchUrl,
      tags: parseLearningTagList(record.content.tagList),
      skills: (record.content.contentSkills ?? []).map((contentSkill: any) => ({
        id: contentSkill.skillTag.id,
        code: contentSkill.skillTag.code,
        name: contentSkill.skillTag.name,
        category: contentSkill.skillTag.category
          ? {
            id: contentSkill.skillTag.category.id,
            code: contentSkill.skillTag.category.code,
            name: contentSkill.skillTag.category.name,
          }
          : null,
      })),
      certificateEligible: record.content.certificateEligible,
      provider: serializeProvider(record.content.provider),
    },
    path: record.path ? {
      id: record.path.id,
      code: record.path.code,
      name: record.path.name,
    } : null,
  };
}

function getLearningRecordSelect() {
  return {
    id: true,
    assignmentId: true,
    status: true,
    requirementType: true,
    mandatory: true,
    dueDate: true,
    renewalDueDate: true,
    assignedAt: true,
    launchedAt: true,
    lastActivityAt: true,
    completedAt: true,
    progressPercent: true,
    certificateIssuedAt: true,
    certificateExpiresAt: true,
    certificateNumber: true,
    providerStatus: true,
    employee: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
      },
    },
    content: {
      select: {
        id: true,
        title: true,
        description: true,
        modality: true,
        durationMinutes: true,
        launchUrl: true,
        tagList: true,
        certificateEligible: true,
        contentSkills: {
          select: {
            skillTag: {
              select: {
                id: true,
                code: true,
                name: true,
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
        provider: {
          select: {
            id: true,
            code: true,
            displayName: true,
            providerType: true,
            status: true,
            syncMode: true,
            defaultLaunchBaseUrl: true,
            lastSyncStartedAt: true,
            lastSyncCompletedAt: true,
            lastSyncStatus: true,
            lastSyncMessage: true,
          },
        },
      },
    },
    path: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
  } satisfies Prisma.LearningRecordSelect;
}

function countCompliance(records: Array<{ status: string; requirementType: string; mandatory: boolean }>) {
  const requiredRecords = records.filter((record) => record.requirementType === LEARNING_REQUIREMENT_REQUIRED || record.mandatory);

  if (requiredRecords.length === 0) {
    return 100;
  }

  const completedRequiredRecords = requiredRecords.filter((record) => record.status === LEARNING_RECORD_STATUS_COMPLETED).length;
  return Math.round((completedRequiredRecords / requiredRecords.length) * 100);
}

export async function getLearningSummary(context: LearningContext) {
  const now = new Date();
  const currentEmployeeId = context.currentEmployeeId ?? null;
  const [providerCount, activeAssignments, automationRules, directReports, employeeRecords] = await Promise.all([
    prisma.learningProvider.count({
      where: { status: 'Active' },
    }),
    prisma.learningAssignment.count({
      where: { status: 'Active' },
    }),
    prisma.learningAssignmentRule.count({
      where: { isActive: true },
    }),
    currentEmployeeId
      ? prisma.employee.count({
        where: {
          managerId: currentEmployeeId,
          status: { not: 'Terminated' },
        },
      })
      : Promise.resolve(0),
    currentEmployeeId
      ? prisma.learningRecord.findMany({
        where: { employeeId: currentEmployeeId },
        select: {
          status: true,
          dueDate: true,
          certificateExpiresAt: true,
          requirementType: true,
          mandatory: true,
        },
      })
      : Promise.resolve([]),
  ]);

  const managementRecords = isHrAdmin(context)
    ? await prisma.learningRecord.findMany({
      select: {
        status: true,
        dueDate: true,
        renewalDueDate: true,
        requirementType: true,
        mandatory: true,
      },
    })
    : (currentEmployeeId
      ? await prisma.learningRecord.findMany({
        where: {
          employee: {
            managerId: currentEmployeeId,
          },
        },
        select: {
          status: true,
          dueDate: true,
          renewalDueDate: true,
          requirementType: true,
          mandatory: true,
        },
      })
      : []);

  return {
    access: {
      accountLinked: Boolean(currentEmployeeId),
      isManager: directReports > 0,
      isHrAdmin: isHrAdmin(context),
    },
    my: {
      requiredOpen: employeeRecords.filter((record) =>
        (record.requirementType === LEARNING_REQUIREMENT_REQUIRED || record.mandatory)
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      recommendedOpen: employeeRecords.filter((record) =>
        record.requirementType !== LEARNING_REQUIREMENT_REQUIRED
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      dueSoon: employeeRecords.filter((record) =>
        record.dueDate
        && record.dueDate >= now
        && record.dueDate <= addUtcDays(now, 7)
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      overdue: employeeRecords.filter((record) =>
        record.dueDate
        && record.dueDate < now
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      completed: employeeRecords.filter((record) => record.status === LEARNING_RECORD_STATUS_COMPLETED).length,
      certificateAlerts: employeeRecords.filter((record) =>
        record.certificateExpiresAt
        && record.certificateExpiresAt >= now
        && record.certificateExpiresAt <= addUtcDays(now, 30)
      ).length,
    },
    management: {
      providerCount,
      activeAssignments,
      automationRules,
      overdueLearners: managementRecords.filter((record) =>
        record.dueDate
        && record.dueDate < now
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      complianceRate: countCompliance(managementRecords),
      certificateRenewals: managementRecords.filter((record) =>
        record.renewalDueDate
        && record.renewalDueDate <= addUtcDays(now, 30)
      ).length,
    },
  };
}

export async function getMyLearningWorkspace(context: LearningContext) {
  const currentEmployeeId = context.currentEmployeeId ?? null;
  const summary = await getLearningSummary(context);

  if (!currentEmployeeId) {
    return {
      summary,
      assigned: [],
      optional: [],
      transcript: [],
      certificates: [],
    };
  }

  const records = await prisma.learningRecord.findMany({
    where: { employeeId: currentEmployeeId },
    orderBy: [
      { dueDate: 'asc' },
      { updatedAt: 'desc' },
    ],
    select: getLearningRecordSelect(),
  });

  const serializedRecords = records.map(serializeLearningRecord);

  return {
    summary,
    assigned: serializedRecords.filter((record) =>
      (record.requirementType === LEARNING_REQUIREMENT_REQUIRED || record.mandatory)
      && !['Completed', 'Cancelled', 'Expired'].includes(record.status)
    ),
    optional: serializedRecords.filter((record) =>
      record.requirementType !== LEARNING_REQUIREMENT_REQUIRED
      && !['Completed', 'Cancelled', 'Expired'].includes(record.status)
    ),
    transcript: serializedRecords.filter((record) => ['Completed', 'Expired'].includes(record.status)),
    certificates: serializedRecords.filter((record) =>
      record.content.certificateEligible
      && Boolean(record.certificateIssuedAt || record.certificateExpiresAt || record.completedAt)
    ),
  };
}

export async function listLearningCatalog(query: ListLearningCatalogQuery, _context: LearningContext) {
  const where: Prisma.LearningContentWhereInput = {
    ...(query.status ? { contentStatus: query.status } : { contentStatus: 'Active' }),
  };

  if (query.providerId) {
    where.providerId = query.providerId;
  }

  if (query.search?.trim()) {
    where.OR = [
      { title: { contains: query.search.trim() } },
      { description: { contains: query.search.trim() } },
      { tagList: { contains: query.search.trim() } },
    ];
  }

  const contents = await prisma.learningContent.findMany({
    where,
    orderBy: [{ title: 'asc' }],
    select: {
      id: true,
      providerContentId: true,
      title: true,
      description: true,
      modality: true,
      durationMinutes: true,
      thumbnailUrl: true,
      launchUrl: true,
      tagList: true,
      versionLabel: true,
      certificateEligible: true,
      contentStatus: true,
      lastSyncedAt: true,
      contentSkills: {
        select: {
          skillTag: {
            select: {
              id: true,
              code: true,
              name: true,
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
      provider: {
        select: {
          id: true,
          code: true,
          displayName: true,
          providerType: true,
          status: true,
          syncMode: true,
          defaultLaunchBaseUrl: true,
          lastSyncStartedAt: true,
          lastSyncCompletedAt: true,
          lastSyncStatus: true,
          lastSyncMessage: true,
        },
      },
      _count: {
        select: {
          assignments: true,
          pathItems: true,
        },
      },
    },
  });

  return contents.map(serializeLearningContent);
}

export async function updateLearningContentSkills(
  contentId: string,
  data: UpdateLearningContentSkillsInput,
  context: LearningContext,
) {
  assertHrAdmin(context);

  await prisma.$transaction(async (transaction) => {
    const content = await transaction.learningContent.findUnique({
      where: { id: contentId },
      select: { id: true },
    });

    if (!content) {
      throw createHttpError(404, 'Learning content was not found.');
    }

    if (data.skillTagIds.length > 0) {
      const skillCount = await transaction.skillTag.count({
        where: {
          id: { in: data.skillTagIds },
          isActive: true,
          category: {
            isActive: true,
          },
        },
      });

      if (skillCount !== data.skillTagIds.length) {
        throw createHttpError(404, 'One or more selected skills were not found.');
      }
    }

    await transaction.learningContentSkill.deleteMany({
      where: { contentId },
    });

    if (data.skillTagIds.length > 0) {
      await transaction.learningContentSkill.createMany({
        data: data.skillTagIds.map((skillTagId) => ({
          contentId,
          skillTagId,
        })),
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const contents = await listLearningCatalog({}, context);
  return contents.find((content) => content.id === contentId) ?? null;
}

export async function listLearningPaths(context: LearningContext) {
  const paths = await prisma.learningPath.findMany({
    where: isHrAdmin(context) ? {} : { status: 'Active' },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: [{ sortOrder: 'asc' }],
        select: {
          id: true,
          sortOrder: true,
          isRequired: true,
          content: {
            select: {
              id: true,
              title: true,
              modality: true,
              provider: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          assignments: true,
        },
      },
    },
  });

  return paths.map(serializeLearningPath);
}

export async function createLearningPath(data: CreateLearningPathInput, context: LearningContext) {
  assertHrAdmin(context);

  const pathId = await prisma.$transaction(async (transaction) => {
    for (const contentId of data.itemContentIds) {
      const content = await transaction.learningContent.findFirst({
        where: {
          id: contentId,
          contentStatus: 'Active',
        },
        select: { id: true },
      });

      if (!content) {
        throw createHttpError(404, 'Selected learning content was not found.');
      }
    }

    const path = await transaction.learningPath.create({
      data: {
        code: data.code,
        name: data.name,
        description: trimToNull(data.description),
        status: data.status,
      },
      select: { id: true },
    });

    for (const [index, contentId] of data.itemContentIds.entries()) {
      await transaction.learningPathItem.create({
        data: {
          pathId: path.id,
          contentId,
          sortOrder: index,
          isRequired: true,
        },
      });
    }

    return path.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const paths = await listLearningPaths(context);
  return paths.find((path) => path.id === pathId) ?? null;
}

export async function updateLearningPath(pathId: string, data: UpdateLearningPathInput, context: LearningContext) {
  assertHrAdmin(context);

  await prisma.$transaction(async (transaction) => {
    const existingPath = await transaction.learningPath.findUnique({
      where: { id: pathId },
      select: { id: true },
    });

    if (!existingPath) {
      throw createHttpError(404, 'Learning path not found.');
    }

    await transaction.learningPath.update({
      where: { id: pathId },
      data: {
        name: data.name ?? undefined,
        description: data.description === undefined ? undefined : trimToNull(data.description),
        status: data.status ?? undefined,
      },
    });

    if (data.itemContentIds) {
      for (const contentId of data.itemContentIds) {
        const content = await transaction.learningContent.findFirst({
          where: {
            id: contentId,
            contentStatus: 'Active',
          },
          select: { id: true },
        });

        if (!content) {
          throw createHttpError(404, 'Selected learning content was not found.');
        }
      }

      await transaction.learningPathItem.deleteMany({
        where: { pathId },
      });

      for (const [index, contentId] of data.itemContentIds.entries()) {
        await transaction.learningPathItem.create({
          data: {
            pathId,
            contentId,
            sortOrder: index,
            isRequired: true,
          },
        });
      }
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const paths = await listLearningPaths(context);
  return paths.find((path) => path.id === pathId) ?? null;
}

function getAssignmentSelect() {
  return {
    id: true,
    assignmentType: true,
    requirementType: true,
    status: true,
    mandatory: true,
    dueDate: true,
    renewalDays: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    cancelledAt: true,
    employeeId: true,
    orgUnitId: true,
    positionId: true,
    classificationId: true,
    content: {
      select: {
        id: true,
        providerContentId: true,
        title: true,
        description: true,
        modality: true,
        durationMinutes: true,
        thumbnailUrl: true,
        launchUrl: true,
        tagList: true,
        versionLabel: true,
        certificateEligible: true,
        contentStatus: true,
        lastSyncedAt: true,
        provider: {
          select: {
            id: true,
            code: true,
            displayName: true,
            providerType: true,
            status: true,
            syncMode: true,
            defaultLaunchBaseUrl: true,
            lastSyncStartedAt: true,
            lastSyncCompletedAt: true,
            lastSyncStatus: true,
            lastSyncMessage: true,
          },
        },
        _count: {
          select: {
            assignments: true,
            pathItems: true,
          },
        },
      },
    },
    path: {
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: [{ sortOrder: 'asc' }],
          select: {
            id: true,
            sortOrder: true,
            isRequired: true,
            content: {
              select: {
                id: true,
                title: true,
                modality: true,
                provider: {
                  select: {
                    displayName: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    },
    employee: {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        jobTitle: true,
        managerId: true,
      },
    },
    orgUnit: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
    position: {
      select: {
        id: true,
        positionCode: true,
        title: true,
      },
    },
    classification: {
      select: {
        id: true,
        code: true,
        title: true,
      },
    },
    records: {
      select: {
        id: true,
        status: true,
        dueDate: true,
        certificateExpiresAt: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
          },
        },
      },
    },
  } satisfies Prisma.LearningAssignmentSelect;
}

function serializeAudience(assignment: any) {
  if (assignment.employee) {
    return {
      type: 'Employee',
      id: assignment.employee.id,
      label: `${assignment.employee.employeeNumber} | ${assignment.employee.firstName} ${assignment.employee.lastName}`,
    };
  }

  if (assignment.orgUnit) {
    return {
      type: 'Org Unit',
      id: assignment.orgUnit.id,
      label: `${assignment.orgUnit.code} | ${assignment.orgUnit.name}`,
    };
  }

  if (assignment.position) {
    return {
      type: 'Position',
      id: assignment.position.id,
      label: `${assignment.position.positionCode} | ${assignment.position.title}`,
    };
  }

  if (assignment.classification) {
    return {
      type: 'Classification',
      id: assignment.classification.id,
      label: `${assignment.classification.code} | ${assignment.classification.title}`,
    };
  }

  return {
    type: 'Unknown',
    id: '',
    label: 'Unknown audience',
  };
}

function serializeLearningAssignment(assignment: any, context: LearningContext) {
  const now = new Date();
  const completedCount = assignment.records.filter((record: any) => record.status === LEARNING_RECORD_STATUS_COMPLETED).length;
  const inProgressCount = assignment.records.filter((record: any) => record.status === LEARNING_RECORD_STATUS_IN_PROGRESS).length;
  const overdueCount = assignment.records.filter((record: any) => {
    return record.dueDate
      && record.dueDate < now
      && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status);
  }).length;
  const certificateAlerts = assignment.records.filter((record: any) => {
    return record.certificateExpiresAt
      && record.certificateExpiresAt >= now
      && record.certificateExpiresAt <= addUtcDays(now, 30);
  }).length;

  return {
    id: assignment.id,
    assignmentType: assignment.assignmentType,
    requirementType: assignment.requirementType,
    status: assignment.status,
    mandatory: assignment.mandatory,
    dueDate: toIsoString(assignment.dueDate),
    renewalDays: assignment.renewalDays ?? null,
    notes: assignment.notes ?? null,
    createdAt: toIsoString(assignment.createdAt),
    updatedAt: toIsoString(assignment.updatedAt),
    cancelledAt: toIsoString(assignment.cancelledAt),
    audience: serializeAudience(assignment),
    content: assignment.content ? serializeLearningContent(assignment.content) : null,
    path: assignment.path ? serializeLearningPath(assignment.path) : null,
    counts: {
      assigned: assignment.records.length,
      completed: completedCount,
      inProgress: inProgressCount,
      overdue: overdueCount,
      certificateAlerts,
    },
    sampleEmployees: assignment.records.slice(0, 5).map((record: any) => serializeEmployee(record.employee)),
    permissions: {
      canEdit: isHrAdmin(context) || Boolean(context.currentEmployeeId && assignment.employee?.managerId === context.currentEmployeeId),
      canCancel: isHrAdmin(context) || Boolean(context.currentEmployeeId && assignment.employee?.managerId === context.currentEmployeeId),
    },
  };
}

async function ensureEmployeeTargetAccess(
  transaction: Prisma.TransactionClient,
  employeeId: string,
  context: LearningContext,
) {
  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      managerId: true,
      status: true,
    },
  });

  if (!employee || employee.status === 'Terminated') {
    throw createHttpError(404, 'Selected employee was not found.');
  }

  if (!isHrAdmin(context) && employee.managerId !== context.currentEmployeeId) {
    throw createHttpError(403, 'Managers can only assign learning to direct reports.');
  }

  return employee;
}

async function ensureActiveLearningResource(
  transaction: Prisma.TransactionClient,
  assignmentType: string,
  contentId: string | null | undefined,
  pathId: string | null | undefined,
) {
  if (assignmentType === LEARNING_ASSIGNMENT_TYPE_CONTENT) {
    const content = await transaction.learningContent.findFirst({
      where: {
        id: contentId ?? undefined,
        contentStatus: 'Active',
      },
      select: { id: true },
    });

    if (!content) {
      throw createHttpError(404, 'Selected learning content was not found.');
    }

    return;
  }

  const path = await transaction.learningPath.findFirst({
    where: {
      id: pathId ?? undefined,
      status: 'Active',
    },
    select: { id: true },
  });

  if (!path) {
    throw createHttpError(404, 'Selected learning path was not found.');
  }
}

export async function listLearningAssignments(query: ListLearningAssignmentsQuery, context: LearningContext) {
  const directReportIds = !isHrAdmin(context)
    ? await getManagerScopeEmployeeIds(context.currentEmployeeId)
    : [];

  const where: Prisma.LearningAssignmentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(!isHrAdmin(context) ? {
      employeeId: {
        in: directReportIds.length > 0 ? directReportIds : ['__no-match__'],
      },
    } : {}),
  };

  if (query.search?.trim()) {
    where.OR = [
      { notes: { contains: query.search.trim() } },
      { content: { is: { title: { contains: query.search.trim() } } } },
      { path: { is: { name: { contains: query.search.trim() } } } },
      { employee: { is: { firstName: { contains: query.search.trim() } } } },
      { employee: { is: { lastName: { contains: query.search.trim() } } } },
    ];
  }

  const assignments = await prisma.learningAssignment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    select: getAssignmentSelect(),
  });

  return assignments.map((assignment) => serializeLearningAssignment(assignment, context));
}

export async function createLearningAssignment(data: CreateLearningAssignmentInput, context: LearningContext) {
  if (!isHrAdmin(context) && !context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to assign learning.');
  }

  const assignmentId = await prisma.$transaction(async (transaction) => {
    if (!isHrAdmin(context)) {
      if (!data.employeeId || data.orgUnitId || data.positionId || data.classificationId) {
        throw createHttpError(403, 'Managers can only create direct employee learning assignments.');
      }

      await ensureEmployeeTargetAccess(transaction, data.employeeId, context);
    }

    await ensureActiveLearningResource(transaction, data.assignmentType, data.contentId, data.pathId);

    const assignment = await transaction.learningAssignment.create({
      data: {
        assignmentType: data.assignmentType,
        requirementType: data.requirementType,
        contentId: data.assignmentType === LEARNING_ASSIGNMENT_TYPE_CONTENT ? data.contentId ?? null : null,
        pathId: data.assignmentType === LEARNING_ASSIGNMENT_TYPE_PATH ? data.pathId ?? null : null,
        employeeId: data.employeeId ?? null,
        orgUnitId: data.orgUnitId ?? null,
        positionId: data.positionId ?? null,
        classificationId: data.classificationId ?? null,
        assignedByAccountId: context.currentAccountId ?? null,
        sourceType: LEARNING_SOURCE_MANUAL,
        status: 'Active',
        mandatory: data.mandatory,
        dueDate: (toDateValue(data.dueDate) as Date | null | undefined) ?? null,
        renewalDays: data.renewalDays ?? null,
        notes: trimToNull(data.notes),
      },
      select: { id: true },
    });

    await materializeLearningRecordsForSource(transaction, {
      assignmentId: assignment.id,
      assignmentType: data.assignmentType,
      contentId: data.contentId,
      pathId: data.pathId,
      employeeId: data.employeeId ?? null,
      orgUnitId: data.orgUnitId ?? null,
      positionId: data.positionId ?? null,
      classificationId: data.classificationId ?? null,
      requirementType: data.requirementType,
      mandatory: data.mandatory,
      dueDate: (toDateValue(data.dueDate) as Date | null | undefined) ?? null,
      renewalDays: data.renewalDays ?? null,
      sourceType: LEARNING_SOURCE_MANUAL,
    });

    return assignment.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const assignments = await listLearningAssignments({}, context);
  return assignments.find((assignment) => assignment.id === assignmentId) ?? null;
}

export async function updateLearningAssignment(
  assignmentId: string,
  data: UpdateLearningAssignmentInput,
  context: LearningContext,
) {
  const directReportIds = !isHrAdmin(context)
    ? await getManagerScopeEmployeeIds(context.currentEmployeeId)
    : [];

  await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.learningAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        employeeId: true,
        orgUnitId: true,
        positionId: true,
        classificationId: true,
        assignmentType: true,
        contentId: true,
        pathId: true,
      },
    });

    if (!assignment) {
      throw createHttpError(404, 'Learning assignment not found.');
    }

    if (!isHrAdmin(context) && (!assignment.employeeId || !directReportIds.includes(assignment.employeeId))) {
      throw createHttpError(403, 'Managers can only update assignments for direct reports.');
    }

    await transaction.learningAssignment.update({
      where: { id: assignmentId },
      data: {
        requirementType: data.requirementType ?? undefined,
        dueDate: data.dueDate === undefined ? undefined : ((toDateValue(data.dueDate) as Date | null | undefined) ?? null),
        renewalDays: data.renewalDays === undefined ? undefined : data.renewalDays,
        mandatory: data.mandatory ?? undefined,
        notes: data.notes === undefined ? undefined : trimToNull(data.notes),
      },
    });

    const refreshedAssignment = await transaction.learningAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        id: true,
        assignmentType: true,
        contentId: true,
        pathId: true,
        employeeId: true,
        orgUnitId: true,
        positionId: true,
        classificationId: true,
        requirementType: true,
        mandatory: true,
        dueDate: true,
        renewalDays: true,
      },
    });

    await materializeLearningRecordsForSource(transaction, {
      assignmentId: refreshedAssignment.id,
      assignmentType: refreshedAssignment.assignmentType,
      contentId: refreshedAssignment.contentId,
      pathId: refreshedAssignment.pathId,
      employeeId: refreshedAssignment.employeeId,
      orgUnitId: refreshedAssignment.orgUnitId,
      positionId: refreshedAssignment.positionId,
      classificationId: refreshedAssignment.classificationId,
      requirementType: refreshedAssignment.requirementType,
      mandatory: refreshedAssignment.mandatory,
      dueDate: refreshedAssignment.dueDate,
      renewalDays: refreshedAssignment.renewalDays,
      sourceType: LEARNING_SOURCE_MANUAL,
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const assignments = await listLearningAssignments({}, context);
  return assignments.find((assignment) => assignment.id === assignmentId) ?? null;
}

export async function cancelLearningAssignment(assignmentId: string, context: LearningContext) {
  const directReportIds = !isHrAdmin(context)
    ? await getManagerScopeEmployeeIds(context.currentEmployeeId)
    : [];

  await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.learningAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        employeeId: true,
      },
    });

    if (!assignment) {
      throw createHttpError(404, 'Learning assignment not found.');
    }

    if (!isHrAdmin(context) && (!assignment.employeeId || !directReportIds.includes(assignment.employeeId))) {
      throw createHttpError(403, 'Managers can only cancel assignments for direct reports.');
    }

    await transaction.learningAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
      },
    });

    const records = await transaction.learningRecord.findMany({
      where: {
        assignmentId,
        status: {
          notIn: [LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED],
        },
      },
      select: { id: true },
    });

    await transaction.learningRecord.updateMany({
      where: {
        assignmentId,
        status: {
          notIn: [LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED],
        },
      },
      data: {
        status: LEARNING_RECORD_STATUS_CANCELLED,
      },
    });

    for (const record of records) {
      await transaction.workflowTask.updateMany({
        where: {
          relatedEntityType: 'LearningRecord',
          relatedEntityId: record.id,
          status: { in: ['Open', 'Completed'] },
        },
        data: {
          status: 'Cancelled',
          completedAt: new Date(),
          comments: 'Learning assignment was cancelled.',
        },
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function serializeLearningRule(rule: any) {
  let audience = 'Unknown audience';

  if (rule.orgUnit) {
    audience = `${rule.orgUnit.code} | ${rule.orgUnit.name}`;
  } else if (rule.position) {
    audience = `${rule.position.positionCode} | ${rule.position.title}`;
  } else if (rule.classification) {
    audience = `${rule.classification.code} | ${rule.classification.title}`;
  } else if (rule.managerEmployee) {
    audience = `${rule.managerEmployee.employeeNumber} | ${rule.managerEmployee.firstName} ${rule.managerEmployee.lastName}`;
  }

  return {
    id: rule.id,
    assignmentType: rule.assignmentType,
    requirementType: rule.requirementType,
    mandatory: rule.mandatory,
    renewalDays: rule.renewalDays ?? null,
    defaultDueDays: rule.defaultDueDays ?? null,
    isActive: rule.isActive,
    createdAt: toIsoString(rule.createdAt),
    updatedAt: toIsoString(rule.updatedAt),
    audience,
    content: rule.content ? {
      id: rule.content.id,
      title: rule.content.title,
    } : null,
    path: rule.path ? {
      id: rule.path.id,
      name: rule.path.name,
    } : null,
    recordCount: rule.records.length,
  };
}

export async function listLearningAssignmentRules(context: LearningContext) {
  assertHrAdmin(context);

  const rules = await prisma.learningAssignmentRule.findMany({
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      assignmentType: true,
      requirementType: true,
      mandatory: true,
      renewalDays: true,
      defaultDueDays: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      content: {
        select: {
          id: true,
          title: true,
        },
      },
      path: {
        select: {
          id: true,
          name: true,
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      position: {
        select: {
          id: true,
          positionCode: true,
          title: true,
        },
      },
      classification: {
        select: {
          id: true,
          code: true,
          title: true,
        },
      },
      managerEmployee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
        },
      },
      records: {
        select: { id: true },
      },
    },
  });

  return rules.map(serializeLearningRule);
}

export async function createLearningAssignmentRule(
  data: CreateLearningAssignmentRuleInput,
  context: LearningContext,
) {
  assertHrAdmin(context);

  const ruleId = await prisma.$transaction(async (transaction) => {
    await ensureActiveLearningResource(transaction, data.assignmentType, data.contentId, data.pathId);

    const rule = await transaction.learningAssignmentRule.create({
      data: {
        assignmentType: data.assignmentType,
        contentId: data.assignmentType === LEARNING_ASSIGNMENT_TYPE_CONTENT ? data.contentId ?? null : null,
        pathId: data.assignmentType === LEARNING_ASSIGNMENT_TYPE_PATH ? data.pathId ?? null : null,
        orgUnitId: data.orgUnitId ?? null,
        positionId: data.positionId ?? null,
        classificationId: data.classificationId ?? null,
        managerEmployeeId: data.managerEmployeeId ?? null,
        createdByAccountId: context.currentAccountId ?? null,
        requirementType: data.requirementType,
        mandatory: data.mandatory,
        renewalDays: data.renewalDays ?? null,
        defaultDueDays: data.defaultDueDays ?? null,
        isActive: data.isActive,
      },
      select: { id: true },
    });

    if (data.isActive) {
      await materializeLearningRecordsForSource(transaction, {
        assignmentRuleId: rule.id,
        assignmentType: data.assignmentType,
        contentId: data.contentId,
        pathId: data.pathId,
        orgUnitId: data.orgUnitId ?? null,
        positionId: data.positionId ?? null,
        classificationId: data.classificationId ?? null,
        managerEmployeeId: data.managerEmployeeId ?? null,
        requirementType: data.requirementType,
        mandatory: data.mandatory,
        defaultDueDays: data.defaultDueDays ?? null,
        renewalDays: data.renewalDays ?? null,
        sourceType: LEARNING_SOURCE_RULE,
      });
    }

    return rule.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const rules = await listLearningAssignmentRules(context);
  return rules.find((rule) => rule.id === ruleId) ?? null;
}

export async function updateLearningAssignmentRule(
  ruleId: string,
  data: UpdateLearningAssignmentRuleInput,
  context: LearningContext,
) {
  assertHrAdmin(context);

  await prisma.$transaction(async (transaction) => {
    const rule = await transaction.learningAssignmentRule.findUnique({
      where: { id: ruleId },
      select: {
        id: true,
        assignmentType: true,
        contentId: true,
        pathId: true,
        orgUnitId: true,
        positionId: true,
        classificationId: true,
        managerEmployeeId: true,
      },
    });

    if (!rule) {
      throw createHttpError(404, 'Learning automation rule not found.');
    }

    await transaction.learningAssignmentRule.update({
      where: { id: ruleId },
      data: {
        requirementType: data.requirementType ?? undefined,
        mandatory: data.mandatory ?? undefined,
        renewalDays: data.renewalDays === undefined ? undefined : data.renewalDays,
        defaultDueDays: data.defaultDueDays === undefined ? undefined : data.defaultDueDays,
        isActive: data.isActive ?? undefined,
      },
    });

    const refreshedRule = await transaction.learningAssignmentRule.findUniqueOrThrow({
      where: { id: ruleId },
      select: {
        id: true,
        assignmentType: true,
        contentId: true,
        pathId: true,
        orgUnitId: true,
        positionId: true,
        classificationId: true,
        managerEmployeeId: true,
        requirementType: true,
        mandatory: true,
        renewalDays: true,
        defaultDueDays: true,
        isActive: true,
      },
    });

    if (refreshedRule.isActive) {
      await materializeLearningRecordsForSource(transaction, {
        assignmentRuleId: refreshedRule.id,
        assignmentType: refreshedRule.assignmentType,
        contentId: refreshedRule.contentId,
        pathId: refreshedRule.pathId,
        orgUnitId: refreshedRule.orgUnitId,
        positionId: refreshedRule.positionId,
        classificationId: refreshedRule.classificationId,
        managerEmployeeId: refreshedRule.managerEmployeeId,
        requirementType: refreshedRule.requirementType,
        mandatory: refreshedRule.mandatory,
        defaultDueDays: refreshedRule.defaultDueDays,
        renewalDays: refreshedRule.renewalDays,
        sourceType: LEARNING_SOURCE_RULE,
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const rules = await listLearningAssignmentRules(context);
  return rules.find((rule) => rule.id === ruleId) ?? null;
}

export async function listLearningProviders(context: LearningContext) {
  assertHrAdmin(context);

  const providers = await prisma.learningProvider.findMany({
    orderBy: [{ displayName: 'asc' }],
    select: {
      id: true,
      code: true,
      displayName: true,
      providerType: true,
      status: true,
      syncMode: true,
      defaultLaunchBaseUrl: true,
      lastSyncStartedAt: true,
      lastSyncCompletedAt: true,
      lastSyncStatus: true,
      lastSyncMessage: true,
      _count: {
        select: {
          contents: true,
          syncRuns: true,
        },
      },
    },
  });

  return providers.map(serializeProvider);
}

export async function syncLearningProvider(providerId: string, context: LearningContext) {
  assertHrAdmin(context);

  const provider = await prisma.learningProvider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      code: true,
      displayName: true,
      providerType: true,
      defaultLaunchBaseUrl: true,
      connectionMetadata: true,
    },
  });

  if (!provider) {
    throw createHttpError(404, 'Learning provider was not found.');
  }

  const adapter = resolveLearningProviderAdapter(provider);
  const syncedCatalog = await adapter.syncCatalog(provider);
  const syncStartedAt = new Date();

  await prisma.learningProvider.update({
    where: { id: providerId },
    data: {
      lastSyncStartedAt: syncStartedAt,
      lastSyncStatus: 'Running',
      lastSyncMessage: null,
    },
  });

  const syncRun = await prisma.learningSyncRun.create({
    data: {
      providerId,
      status: 'Running',
      startedAt: syncStartedAt,
    },
    select: { id: true },
  });

  let createdCount = 0;
  let updatedCount = 0;
  let retiredCount = 0;

  await prisma.$transaction(async (transaction) => {
    const existingContents = await transaction.learningContent.findMany({
      where: { providerId },
      select: {
        id: true,
        providerContentId: true,
      },
    });

    const existingByProviderContentId = new Map(existingContents.map((content) => [content.providerContentId, content.id]));
    const seenProviderContentIds = new Set<string>();

    for (const content of syncedCatalog) {
      seenProviderContentIds.add(content.providerContentId);
      const existingId = existingByProviderContentId.get(content.providerContentId);

      if (existingId) {
        await transaction.learningContent.update({
          where: { id: existingId },
          data: {
            title: content.title,
            description: trimToNull(content.description),
            modality: content.modality,
            durationMinutes: content.durationMinutes,
            thumbnailUrl: trimToNull(content.thumbnailUrl),
            launchUrl: content.launchUrl,
            tagList: serializeLearningTagList(content.tags),
            versionLabel: trimToNull(content.versionLabel),
            certificateEligible: content.certificateEligible,
            contentStatus: content.contentStatus,
            lastSyncedAt: new Date(),
          },
        });
        updatedCount += 1;
      } else {
        await transaction.learningContent.create({
          data: {
            providerId,
            providerContentId: content.providerContentId,
            title: content.title,
            description: trimToNull(content.description),
            modality: content.modality,
            durationMinutes: content.durationMinutes,
            thumbnailUrl: trimToNull(content.thumbnailUrl),
            launchUrl: content.launchUrl,
            tagList: serializeLearningTagList(content.tags),
            versionLabel: trimToNull(content.versionLabel),
            certificateEligible: content.certificateEligible,
            contentStatus: content.contentStatus,
            lastSyncedAt: new Date(),
          },
        });
        createdCount += 1;
      }
    }

    const contentIdsToRetire = existingContents
      .filter((content) => !seenProviderContentIds.has(content.providerContentId))
      .map((content) => content.id);

    if (contentIdsToRetire.length > 0) {
      await transaction.learningContent.updateMany({
        where: {
          id: { in: contentIdsToRetire },
        },
        data: {
          contentStatus: 'Retired',
          lastSyncedAt: new Date(),
        },
      });
      retiredCount = contentIdsToRetire.length;
    }

    const completedAt = new Date();
    await transaction.learningSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'Completed',
        completedAt,
        createdCount,
        updatedCount,
        retiredCount,
        message: `Synced ${syncedCatalog.length} catalog items.`,
      },
    });

    await transaction.learningProvider.update({
      where: { id: providerId },
      data: {
        lastSyncCompletedAt: completedAt,
        lastSyncStatus: 'Completed',
        lastSyncMessage: `Synced ${syncedCatalog.length} catalog items.`,
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return {
    providerId,
    createdCount,
    updatedCount,
    retiredCount,
    syncedCount: createdCount + updatedCount,
  };
}

function appendLaunchParameters(url: string, params: Record<string, string>) {
  const serializedParams = new URLSearchParams(params).toString();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${serializedParams}`;
}

export async function launchLearningAssignment(
  assignmentId: string,
  data: LaunchLearningAssignmentInput,
  context: LearningContext,
) {
  const currentEmployeeId = assertLinkedEmployee(context);

  return prisma.$transaction(async (transaction) => {
    const record = await transaction.learningRecord.findFirst({
      where: {
        assignmentId,
        employeeId: currentEmployeeId,
        ...(data.recordId ? { id: data.recordId } : {}),
      },
      orderBy: [
        { completedAt: 'asc' },
        { dueDate: 'asc' },
      ],
      select: {
        id: true,
        status: true,
        dueDate: true,
        renewalDueDate: true,
        requirementType: true,
        mandatory: true,
        employeeId: true,
        content: {
          select: {
            title: true,
            launchUrl: true,
            certificateEligible: true,
          },
        },
        employee: {
          select: {
            firstName: true,
            lastName: true,
            managerId: true,
          },
        },
      },
    });

    if (!record) {
      throw createHttpError(404, 'No learning record is available to launch for this assignment.');
    }

    const nextStatus = record.status === LEARNING_RECORD_STATUS_ASSIGNED ? LEARNING_RECORD_STATUS_IN_PROGRESS : record.status;
    const updatedRecord = await transaction.learningRecord.update({
      where: { id: record.id },
      data: {
        status: nextStatus,
        launchedAt: new Date(),
        lastActivityAt: new Date(),
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

    await syncLearningWorkflowTasks(transaction, updatedRecord);

    return {
      recordId: record.id,
      launchUrl: appendLaunchParameters(record.content.launchUrl, {
        assignmentId,
        recordId: record.id,
        employeeId: currentEmployeeId,
      }),
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function processLearningProviderWebhook(
  providerId: string,
  payload: LearningWebhookInput,
) {
  const provider = await prisma.learningProvider.findUnique({
    where: { id: providerId },
    select: { id: true },
  });

  if (!provider) {
    throw createHttpError(404, 'Learning provider was not found.');
  }

  return prisma.$transaction(async (transaction) => {
    const record = payload.recordId
      ? await transaction.learningRecord.findUnique({
        where: { id: payload.recordId },
        select: {
          id: true,
          status: true,
          requirementType: true,
          mandatory: true,
          dueDate: true,
          renewalDueDate: true,
          renewalDays: true,
          employeeId: true,
          completedAt: true,
          content: {
            select: {
              providerId: true,
              title: true,
              certificateEligible: true,
            },
          },
          employee: {
            select: {
              firstName: true,
              lastName: true,
              managerId: true,
            },
          },
        },
      })
      : await transaction.learningRecord.findFirst({
        where: {
          employeeId: payload.employeeId ?? undefined,
          employee: payload.employeeEmail ? {
            is: {
              email: payload.employeeEmail,
            },
          } : undefined,
          content: {
            providerId,
            providerContentId: payload.providerContentId ?? undefined,
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          requirementType: true,
          mandatory: true,
          dueDate: true,
          renewalDueDate: true,
          renewalDays: true,
          employeeId: true,
          completedAt: true,
          content: {
            select: {
              providerId: true,
              title: true,
              certificateEligible: true,
            },
          },
          employee: {
            select: {
              firstName: true,
              lastName: true,
              managerId: true,
            },
          },
        },
      });

    if (!record || record.content.providerId !== providerId) {
      throw createHttpError(404, 'Matching learning record was not found for this provider event.');
    }

    const nextCompletedAt = (toDateValue(payload.completedAt) as Date | null | undefined) ?? record.completedAt ?? null;
    const nextCertificateExpiresAt = payload.certificateExpiresAt === undefined
      ? undefined
      : ((toDateValue(payload.certificateExpiresAt) as Date | null | undefined) ?? null);
    const nextStatus = payload.status
      ?? (payload.completedAt ? LEARNING_RECORD_STATUS_COMPLETED : (payload.progressPercent && payload.progressPercent > 0 ? LEARNING_RECORD_STATUS_IN_PROGRESS : record.status));
    const nextRenewalDueDate = nextCertificateExpiresAt
      ? addUtcDays(nextCertificateExpiresAt, -30)
      : (nextCompletedAt && record.renewalDays ? addUtcDays(nextCompletedAt, Math.max(record.renewalDays - 30, 0)) : null);

    const updatedRecord = await transaction.learningRecord.update({
      where: { id: record.id },
      data: {
        status: nextStatus,
        progressPercent: payload.progressPercent ?? (nextStatus === LEARNING_RECORD_STATUS_COMPLETED ? 100 : undefined),
        providerStatus: payload.providerStatus ?? undefined,
        completedAt: nextStatus === LEARNING_RECORD_STATUS_COMPLETED ? nextCompletedAt ?? new Date() : undefined,
        lastActivityAt: new Date(),
        certificateIssuedAt: payload.certificateIssuedAt === undefined ? undefined : ((toDateValue(payload.certificateIssuedAt) as Date | null | undefined) ?? null),
        certificateExpiresAt: nextCertificateExpiresAt,
        certificateNumber: payload.certificateNumber === undefined ? undefined : trimToNull(payload.certificateNumber),
        renewalDueDate: nextRenewalDueDate,
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

    await syncLearningWorkflowTasks(transaction, updatedRecord);

    return {
      recordId: updatedRecord.id,
      status: updatedRecord.status,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function getLearningReport() {
  const now = new Date();
  const nextThirtyDays = addUtcDays(now, 30);
  const [providers, assignments, records] = await Promise.all([
    prisma.learningProvider.findMany({
      orderBy: [{ displayName: 'asc' }],
      select: {
        id: true,
        code: true,
        displayName: true,
        status: true,
        syncMode: true,
        lastSyncCompletedAt: true,
        _count: {
          select: {
            contents: true,
          },
        },
      },
    }),
    prisma.learningAssignment.findMany({
      where: { status: 'Active' },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        assignmentType: true,
        requirementType: true,
        mandatory: true,
        dueDate: true,
        content: {
          select: { title: true },
        },
        path: {
          select: { name: true },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        orgUnit: {
          select: {
            code: true,
            name: true,
          },
        },
        position: {
          select: {
            positionCode: true,
            title: true,
          },
        },
        classification: {
          select: {
            code: true,
            title: true,
          },
        },
        records: {
          select: {
            id: true,
            status: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.learningRecord.findMany({
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        status: true,
        requirementType: true,
        mandatory: true,
        dueDate: true,
        completedAt: true,
        certificateExpiresAt: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        content: {
          select: {
            title: true,
            provider: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    overview: {
      providerCount: providers.length,
      activeAssignments: assignments.length,
      requiredOpen: records.filter((record) =>
        (record.requirementType === LEARNING_REQUIREMENT_REQUIRED || record.mandatory)
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      overdue: records.filter((record) =>
        record.dueDate
        && record.dueDate < now
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
      completionRate: countCompliance(records),
      certificateRenewals: records.filter((record) =>
        record.certificateExpiresAt
        && record.certificateExpiresAt >= now
        && record.certificateExpiresAt <= nextThirtyDays
      ).length,
    },
    providers: providers.map((provider) => ({
      id: provider.id,
      code: provider.code,
      displayName: provider.displayName,
      status: provider.status,
      syncMode: provider.syncMode,
      contentCount: provider._count.contents,
      lastSyncCompletedAt: toIsoString(provider.lastSyncCompletedAt),
    })),
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      audience: assignment.employee
        ? `${assignment.employee.employeeNumber} | ${assignment.employee.firstName} ${assignment.employee.lastName}`
        : assignment.orgUnit
          ? `${assignment.orgUnit.code} | ${assignment.orgUnit.name}`
          : assignment.position
            ? `${assignment.position.positionCode} | ${assignment.position.title}`
            : assignment.classification
              ? `${assignment.classification.code} | ${assignment.classification.title}`
              : 'Unknown audience',
      learningItem: assignment.content?.title ?? assignment.path?.name ?? 'Learning item',
      assignmentType: assignment.assignmentType,
      requirementType: assignment.requirementType,
      mandatory: assignment.mandatory,
      dueDate: toIsoString(assignment.dueDate),
      assignedCount: assignment.records.length,
      completedCount: assignment.records.filter((record) => record.status === LEARNING_RECORD_STATUS_COMPLETED).length,
      overdueCount: assignment.records.filter((record) =>
        record.dueDate
        && record.dueDate < now
        && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
      ).length,
    })),
    records: records.map((record) => ({
      id: record.id,
      employee: record.employee ? {
        id: record.employee.id,
        employeeNumber: record.employee.employeeNumber,
        fullName: `${record.employee.firstName} ${record.employee.lastName}`,
        department: record.employee.department,
      } : null,
      learningItem: record.content.title,
      providerName: record.content.provider.displayName,
      status: getDisplayStatus(record),
      dueDate: toIsoString(record.dueDate),
      completedAt: toIsoString(record.completedAt),
      certificateExpiresAt: toIsoString(record.certificateExpiresAt),
    })),
  };
}

export async function getEmployeeLearningSummary(employeeId: string) {
  const now = new Date();
  const records = await prisma.learningRecord.findMany({
    where: { employeeId },
    select: {
      status: true,
      dueDate: true,
      certificateExpiresAt: true,
      requirementType: true,
      mandatory: true,
    },
  });

  return {
    assigned: records.filter((record) => ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)).length,
    overdue: records.filter((record) =>
      record.dueDate
      && record.dueDate < now
      && ![LEARNING_RECORD_STATUS_COMPLETED, LEARNING_RECORD_STATUS_CANCELLED].includes(record.status)
    ).length,
    completed: records.filter((record) => record.status === LEARNING_RECORD_STATUS_COMPLETED).length,
    certificateAlerts: records.filter((record) =>
      record.certificateExpiresAt
      && record.certificateExpiresAt >= now
      && record.certificateExpiresAt <= addUtcDays(now, 30)
    ).length,
  };
}

export async function applyLearningRulesAfterEmployeeChange(employeeId: string) {
  await prisma.$transaction(async (transaction) => {
    await applyActiveLearningRulesForEmployee(transaction, employeeId);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
