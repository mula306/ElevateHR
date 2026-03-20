import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import {
  completeWorkflowTasksForEntity,
  createWorkflowTask,
  TERMINATED_EMPLOYEE_STATUS,
} from '../../shared/lib/hr-ops';
import {
  createHttpError,
  toDateValue,
  toIsoString,
  trimToNull,
} from '../../shared/lib/service-utils';
import type {
  AcknowledgePerformanceReviewInput,
  CreatePerformanceCycleInput,
  CreatePerformanceGoalInput,
  CreatePerformanceGoalUpdateInput,
  ListPerformanceGoalsQuery,
  ListPerformanceReviewsQuery,
  UpdateManagerReviewInput,
  UpdatePerformanceCycleInput,
  UpdatePerformanceGoalInput,
  UpdateSelfReviewInput,
} from './performance.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const PERFORMANCE_SELF_REVIEW_TASK = 'PerformanceSelfReview';
const PERFORMANCE_MANAGER_REVIEW_TASK = 'PerformanceManagerReview';
const PERFORMANCE_ACK_TASK = 'PerformanceAcknowledgment';
const PERFORMANCE_REVIEW_STATUSES = {
  pendingSelf: 'Pending Self Review',
  selfSubmitted: 'Self Review Submitted',
  managerInProgress: 'Manager Review In Progress',
  finalized: 'Finalized',
  acknowledged: 'Acknowledged',
} as const;
const PERFORMANCE_GOAL_STATUSES = {
  active: 'Active',
  completed: 'Completed',
  closed: 'Closed',
} as const;

const reviewSectionDefinitions = [
  { sectionKey: 'achievements', sectionTitle: 'Achievements', sortOrder: 0 },
  { sectionKey: 'strengths', sectionTitle: 'Strengths', sortOrder: 1 },
  { sectionKey: 'growth_focus', sectionTitle: 'Growth Focus', sortOrder: 2 },
  { sectionKey: 'development_actions', sectionTitle: 'Development Actions', sortOrder: 3 },
] as const;

interface PerformanceContext {
  currentEmployeeId?: string | null;
  roles?: string[];
  userId?: string | null;
}

function isHrAdmin(context: PerformanceContext) {
  return (context.roles ?? []).some((role) => HR_ADMIN_ROLES.has(role));
}

function assertHrAdmin(context: PerformanceContext) {
  if (!isHrAdmin(context)) {
    throw createHttpError(403, 'Only HR administrators can manage review cycles.');
  }
}

function assertLinkedEmployee(context: PerformanceContext) {
  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to use performance self-service.');
  }

  return context.currentEmployeeId;
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
    status: employee.status,
  };
}

function serializeOrgUnit(orgUnit: any) {
  if (!orgUnit) {
    return null;
  }

  return {
    id: orgUnit.id,
    code: orgUnit.code,
    name: orgUnit.name,
    type: orgUnit.type,
  };
}

function serializeCycle(cycle: any) {
  const totalReviews = cycle.reviews?.length ?? 0;
  const finalizedReviews = (cycle.reviews ?? []).filter((review: any) => review.status === PERFORMANCE_REVIEW_STATUSES.finalized || review.status === PERFORMANCE_REVIEW_STATUSES.acknowledged).length;
  const acknowledgedReviews = (cycle.reviews ?? []).filter((review: any) => review.status === PERFORMANCE_REVIEW_STATUSES.acknowledged).length;

  return {
    id: cycle.id,
    name: cycle.name,
    status: cycle.status,
    startDate: toIsoString(cycle.startDate),
    endDate: toIsoString(cycle.endDate),
    selfReviewDueDate: toIsoString(cycle.selfReviewDueDate),
    managerReviewDueDate: toIsoString(cycle.managerReviewDueDate),
    releaseDate: toIsoString(cycle.releaseDate),
    publishedAt: toIsoString(cycle.publishedAt),
    createdAt: toIsoString(cycle.createdAt),
    updatedAt: toIsoString(cycle.updatedAt),
    orgUnit: serializeOrgUnit(cycle.orgUnit),
    reviewCount: totalReviews,
    finalizedReviews,
    acknowledgedReviews,
  };
}

function serializeReviewSection(section: any) {
  return {
    id: section.id,
    sectionKey: section.sectionKey,
    sectionTitle: section.sectionTitle,
    employeeResponse: section.employeeResponse ?? null,
    managerResponse: section.managerResponse ?? null,
    sortOrder: section.sortOrder,
  };
}

function getReviewPermissions(review: any, context: PerformanceContext) {
  const currentEmployeeId = context.currentEmployeeId ?? null;
  const hrAdmin = isHrAdmin(context);
  const employeeOwnsReview = Boolean(currentEmployeeId && review.employeeId === currentEmployeeId);
  const managerOwnsReview = Boolean(currentEmployeeId && review.managerId === currentEmployeeId);

  return {
    canSelfReview: employeeOwnsReview
      && [PERFORMANCE_REVIEW_STATUSES.pendingSelf, PERFORMANCE_REVIEW_STATUSES.selfSubmitted].includes(review.status),
    canManagerReview: (hrAdmin || managerOwnsReview)
      && [PERFORMANCE_REVIEW_STATUSES.selfSubmitted, PERFORMANCE_REVIEW_STATUSES.managerInProgress].includes(review.status),
    canFinalize: (hrAdmin || managerOwnsReview)
      && [PERFORMANCE_REVIEW_STATUSES.selfSubmitted, PERFORMANCE_REVIEW_STATUSES.managerInProgress].includes(review.status),
    canAcknowledge: employeeOwnsReview && review.status === PERFORMANCE_REVIEW_STATUSES.finalized,
  };
}

function serializeReview(review: any, context: PerformanceContext) {
  const employeeSectionsCompleted = (review.sections ?? []).filter((section: any) => Boolean(trimToNull(section.employeeResponse))).length;
  const managerSectionsCompleted = (review.sections ?? []).filter((section: any) => Boolean(trimToNull(section.managerResponse))).length;

  return {
    id: review.id,
    status: review.status,
    managerSummary: review.managerSummary ?? null,
    finalizedAt: toIsoString(review.finalizedAt),
    releasedAt: toIsoString(review.releasedAt),
    acknowledgedAt: toIsoString(review.acknowledgedAt),
    createdAt: toIsoString(review.createdAt),
    updatedAt: toIsoString(review.updatedAt),
    cycle: review.cycle ? serializeCycle(review.cycle) : null,
    employee: serializeEmployee(review.employee),
    manager: serializeEmployee(review.manager),
    sections: (review.sections ?? []).map(serializeReviewSection),
    sectionCompletion: {
      employeeCompleted: employeeSectionsCompleted,
      managerCompleted: managerSectionsCompleted,
      total: review.sections?.length ?? 0,
    },
    permissions: getReviewPermissions(review, context),
  };
}

function serializeGoalUpdate(update: any) {
  return {
    id: update.id,
    progressNote: update.progressNote,
    percentComplete: update.percentComplete ?? null,
    createdAt: toIsoString(update.createdAt),
    authorEmployee: serializeEmployee(update.authorEmployee),
  };
}

function serializeGoal(goal: any, context: PerformanceContext) {
  const currentEmployeeId = context.currentEmployeeId ?? null;
  const hrAdmin = isHrAdmin(context);
  const employeeOwnsGoal = Boolean(currentEmployeeId && goal.employeeId === currentEmployeeId);
  const managerOwnsGoal = Boolean(currentEmployeeId && goal.managerId === currentEmployeeId);

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description ?? null,
    status: goal.status,
    targetDate: toIsoString(goal.targetDate),
    closedAt: toIsoString(goal.closedAt),
    createdAt: toIsoString(goal.createdAt),
    updatedAt: toIsoString(goal.updatedAt),
    employee: serializeEmployee(goal.employee),
    manager: serializeEmployee(goal.manager),
    createdInCycle: goal.createdInCycle ? serializeCycle(goal.createdInCycle) : null,
    updates: (goal.updates ?? []).map(serializeGoalUpdate),
    permissions: {
      canEdit: hrAdmin || managerOwnsGoal,
      canAddUpdate: employeeOwnsGoal || managerOwnsGoal,
    },
  };
}

function getCycleSelect() {
  return {
    id: true,
    name: true,
    status: true,
    startDate: true,
    endDate: true,
    selfReviewDueDate: true,
    managerReviewDueDate: true,
    releaseDate: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    orgUnit: {
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    },
    reviews: {
      select: {
        id: true,
        status: true,
      },
    },
  } satisfies Prisma.PerformanceCycleSelect;
}

function getReviewSelect(includeSections = true) {
  return {
    id: true,
    cycleId: true,
    employeeId: true,
    managerId: true,
    status: true,
    managerSummary: true,
    finalizedAt: true,
    releasedAt: true,
    acknowledgedAt: true,
    createdAt: true,
    updatedAt: true,
    cycle: {
      select: getCycleSelect(),
    },
    employee: {
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
    manager: {
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
    sections: includeSections ? {
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true,
        sectionKey: true,
        sectionTitle: true,
        employeeResponse: true,
        managerResponse: true,
        sortOrder: true,
      },
    } : false,
  } satisfies Prisma.PerformanceReviewSelect;
}

function getGoalSelect() {
  return {
    id: true,
    employeeId: true,
    managerId: true,
    title: true,
    description: true,
    status: true,
    targetDate: true,
    closedAt: true,
    createdAt: true,
    updatedAt: true,
    employee: {
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
    manager: {
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
    createdInCycle: {
      select: getCycleSelect(),
    },
    updates: {
      orderBy: [{ createdAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        progressNote: true,
        percentComplete: true,
        createdAt: true,
        authorEmployee: {
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
      },
    },
  } satisfies Prisma.PerformanceGoalSelect;
}

function getReviewScopeWhere(context: PerformanceContext): Prisma.PerformanceReviewWhereInput {
  if (isHrAdmin(context)) {
    return {};
  }

  const currentEmployeeId = assertLinkedEmployee(context);

  return {
    OR: [
      { employeeId: currentEmployeeId },
      { managerId: currentEmployeeId },
    ],
  };
}

function getGoalScopeWhere(context: PerformanceContext): Prisma.PerformanceGoalWhereInput {
  if (isHrAdmin(context)) {
    return {};
  }

  const currentEmployeeId = assertLinkedEmployee(context);

  return {
    OR: [
      { employeeId: currentEmployeeId },
      { managerId: currentEmployeeId },
    ],
  };
}

function getCycleScopeWhere(context: PerformanceContext): Prisma.PerformanceCycleWhereInput {
  if (isHrAdmin(context)) {
    return {};
  }

  const currentEmployeeId = assertLinkedEmployee(context);

  return {
    reviews: {
      some: {
        OR: [
          { employeeId: currentEmployeeId },
          { managerId: currentEmployeeId },
        ],
      },
    },
  };
}

async function requireActiveEmployee(
  transaction: Prisma.TransactionClient,
  employeeId: string,
) {
  const employee = await transaction.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      department: true,
      jobTitle: true,
      status: true,
      managerId: true,
      positionId: true,
    },
  });

  if (!employee) {
    throw createHttpError(404, 'Employee not found.');
  }

  if (employee.status === TERMINATED_EMPLOYEE_STATUS) {
    throw createHttpError(409, 'Terminated employees cannot be included in performance management.');
  }

  return employee;
}

async function requireGoalAccess(
  transaction: Prisma.TransactionClient,
  goalId: string,
  context: PerformanceContext,
) {
  const goal = await transaction.performanceGoal.findUnique({
    where: { id: goalId },
    include: {
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
          status: true,
          managerId: true,
        },
      },
      manager: {
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
    },
  });

  if (!goal) {
    throw createHttpError(404, 'Performance goal not found.');
  }

  if (!isHrAdmin(context)) {
    const currentEmployeeId = assertLinkedEmployee(context);
    if (goal.employeeId !== currentEmployeeId && goal.managerId !== currentEmployeeId) {
      throw createHttpError(403, 'You do not have access to this performance goal.');
    }
  }

  return goal;
}

async function requireReviewAccess(
  transaction: Prisma.TransactionClient,
  reviewId: string,
  context: PerformanceContext,
) {
  const review = await transaction.performanceReview.findUnique({
    where: { id: reviewId },
    include: {
      cycle: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          selfReviewDueDate: true,
          managerReviewDueDate: true,
          releaseDate: true,
          publishedAt: true,
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
          status: true,
          managerId: true,
        },
      },
      manager: {
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
      sections: {
        orderBy: [{ sortOrder: 'asc' }],
      },
    },
  });

  if (!review) {
    throw createHttpError(404, 'Performance review not found.');
  }

  if (!isHrAdmin(context)) {
    const currentEmployeeId = assertLinkedEmployee(context);
    if (review.employeeId !== currentEmployeeId && review.managerId !== currentEmployeeId) {
      throw createHttpError(403, 'You do not have access to this performance review.');
    }
  }

  return review;
}

async function createReviewSections(
  transaction: Prisma.TransactionClient,
  reviewId: string,
) {
  for (const section of reviewSectionDefinitions) {
    await transaction.performanceReviewSection.create({
      data: {
        reviewId,
        sectionKey: section.sectionKey,
        sectionTitle: section.sectionTitle,
        sortOrder: section.sortOrder,
      },
    });
  }
}

async function upsertPerformanceTask(
  transaction: Prisma.TransactionClient,
  input: {
    taskType: string;
    reviewId: string;
    reviewName: string;
    cycleName: string;
    employeeId: string;
    ownerEmployeeId: string;
    ownerLabel: string;
    dueDate: Date;
    priority?: string;
  },
) {
  const updateResult = await transaction.workflowTask.updateMany({
    where: {
      relatedEntityType: input.taskType,
      relatedEntityId: input.reviewId,
    },
    data: {
      taskType: input.taskType,
      title: `${input.reviewName}: ${input.cycleName}`,
      description: input.taskType,
      employeeId: input.employeeId,
      ownerEmployeeId: input.ownerEmployeeId,
      ownerLabel: input.ownerLabel,
      dueDate: input.dueDate,
      priority: input.priority ?? 'Normal',
      status: 'Open',
      completedAt: null,
      comments: null,
    },
  });

  if (updateResult.count > 0) {
    return;
  }

  await createWorkflowTask(transaction, {
    taskType: input.taskType,
    title: `${input.reviewName}: ${input.cycleName}`,
    description: input.taskType,
    employeeId: input.employeeId,
    ownerEmployeeId: input.ownerEmployeeId,
    ownerLabel: input.ownerLabel,
    relatedEntityType: input.taskType,
    relatedEntityId: input.reviewId,
    dueDate: input.dueDate,
    priority: input.priority ?? 'Normal',
  });
}

async function createReviewWorkflowTasks(
  transaction: Prisma.TransactionClient,
  review: {
    id: string;
    employeeId: string;
    managerId: string;
    employee: { firstName: string; lastName: string };
    cycle: { name: string; selfReviewDueDate: Date; managerReviewDueDate: Date };
  },
) {
  const reviewName = `${review.employee.firstName} ${review.employee.lastName}`;

  await upsertPerformanceTask(transaction, {
    taskType: PERFORMANCE_SELF_REVIEW_TASK,
    reviewId: review.id,
    reviewName: `${reviewName}: self-review`,
    cycleName: review.cycle.name,
    employeeId: review.employeeId,
    ownerEmployeeId: review.employeeId,
    ownerLabel: 'Employee',
    dueDate: review.cycle.selfReviewDueDate,
  });

  await upsertPerformanceTask(transaction, {
    taskType: PERFORMANCE_MANAGER_REVIEW_TASK,
    reviewId: review.id,
    reviewName: `${reviewName}: manager review`,
    cycleName: review.cycle.name,
    employeeId: review.employeeId,
    ownerEmployeeId: review.managerId,
    ownerLabel: 'Manager',
    dueDate: review.cycle.managerReviewDueDate,
    priority: 'High',
  });
}

async function createAcknowledgmentTask(
  transaction: Prisma.TransactionClient,
  review: {
    id: string;
    employeeId: string;
    employee: { firstName: string; lastName: string };
    cycle: { name: string; releaseDate: Date };
  },
) {
  await upsertPerformanceTask(transaction, {
    taskType: PERFORMANCE_ACK_TASK,
    reviewId: review.id,
    reviewName: `${review.employee.firstName} ${review.employee.lastName}: acknowledge review`,
    cycleName: review.cycle.name,
    employeeId: review.employeeId,
    ownerEmployeeId: review.employeeId,
    ownerLabel: 'Employee',
    dueDate: review.cycle.releaseDate,
  });
}

function reviewCanAcceptSelfReview(review: any) {
  return [PERFORMANCE_REVIEW_STATUSES.pendingSelf, PERFORMANCE_REVIEW_STATUSES.selfSubmitted].includes(review.status)
    && review.cycle.status === 'Published';
}

function reviewCanAcceptManagerReview(review: any) {
  return [PERFORMANCE_REVIEW_STATUSES.selfSubmitted, PERFORMANCE_REVIEW_STATUSES.managerInProgress].includes(review.status)
    && review.cycle.status === 'Published';
}

function getPerformanceSummaryShape() {
  return {
    access: {
      isHrAdmin: false,
      isManager: false,
      accountLinked: false,
    },
    management: {
      activeCycleCount: 0,
      activeCycleName: null as string | null,
      overdueReviews: 0,
      pendingAcknowledgments: 0,
      goalCompletionRate: 0,
    },
    self: {
      activeGoals: 0,
      selfReviewDue: 0,
      acknowledgmentsDue: 0,
      completedGoals: 0,
    },
  };
}

export async function getPerformanceSummary(context: PerformanceContext) {
  const summary = getPerformanceSummaryShape();
  summary.access.isHrAdmin = isHrAdmin(context);
  summary.access.isManager = Boolean(context.currentEmployeeId && await prisma.employee.count({
    where: {
      managerId: context.currentEmployeeId,
      status: { not: TERMINATED_EMPLOYEE_STATUS },
    },
  }));
  summary.access.accountLinked = Boolean(context.currentEmployeeId);

  const activeCycle = await prisma.performanceCycle.findFirst({
    where: {
      ...getCycleScopeWhere(context),
      status: 'Published',
    },
    orderBy: [{ startDate: 'desc' }],
    select: {
      name: true,
    },
  });

  summary.management.activeCycleCount = await prisma.performanceCycle.count({
    where: {
      ...getCycleScopeWhere(context),
      status: 'Published',
    },
  });
  summary.management.activeCycleName = activeCycle?.name ?? null;

  const reviewWhere = getReviewScopeWhere(context);
  const goalWhere = getGoalScopeWhere(context);
  const now = new Date();

  summary.management.overdueReviews = await prisma.performanceReview.count({
    where: {
      ...reviewWhere,
      OR: [
        {
          status: PERFORMANCE_REVIEW_STATUSES.pendingSelf,
          cycle: {
            selfReviewDueDate: { lt: now },
          },
        },
        {
          status: {
            in: [
              PERFORMANCE_REVIEW_STATUSES.selfSubmitted,
              PERFORMANCE_REVIEW_STATUSES.managerInProgress,
            ],
          },
          cycle: {
            managerReviewDueDate: { lt: now },
          },
        },
      ],
    },
  });

  summary.management.pendingAcknowledgments = await prisma.performanceReview.count({
    where: {
      ...reviewWhere,
      status: PERFORMANCE_REVIEW_STATUSES.finalized,
    },
  });

  const [totalGoals, completedGoals] = await Promise.all([
    prisma.performanceGoal.count({
      where: goalWhere,
    }),
    prisma.performanceGoal.count({
      where: {
        ...goalWhere,
        status: {
          in: [PERFORMANCE_GOAL_STATUSES.completed, PERFORMANCE_GOAL_STATUSES.closed],
        },
      },
    }),
  ]);

  summary.management.goalCompletionRate = totalGoals === 0
    ? 0
    : Math.round((completedGoals / totalGoals) * 100);

  if (context.currentEmployeeId) {
    summary.self.activeGoals = await prisma.performanceGoal.count({
      where: {
        employeeId: context.currentEmployeeId,
        status: PERFORMANCE_GOAL_STATUSES.active,
      },
    });
    summary.self.selfReviewDue = await prisma.performanceReview.count({
      where: {
        employeeId: context.currentEmployeeId,
        status: PERFORMANCE_REVIEW_STATUSES.pendingSelf,
      },
    });
    summary.self.acknowledgmentsDue = await prisma.performanceReview.count({
      where: {
        employeeId: context.currentEmployeeId,
        status: PERFORMANCE_REVIEW_STATUSES.finalized,
      },
    });
    summary.self.completedGoals = await prisma.performanceGoal.count({
      where: {
        employeeId: context.currentEmployeeId,
        status: {
          in: [PERFORMANCE_GOAL_STATUSES.completed, PERFORMANCE_GOAL_STATUSES.closed],
        },
      },
    });
  }

  return summary;
}

export async function listPerformanceCycles(context: PerformanceContext) {
  const cycles = await prisma.performanceCycle.findMany({
    where: getCycleScopeWhere(context),
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    select: getCycleSelect(),
  });

  return cycles.map(serializeCycle);
}

export async function createPerformanceCycle(
  data: CreatePerformanceCycleInput,
  context: PerformanceContext,
) {
  assertHrAdmin(context);

  const cycleId = await prisma.$transaction(async (transaction) => {
    if (data.orgUnitId) {
      const orgUnit = await transaction.orgUnit.findFirst({
        where: {
          id: data.orgUnitId,
          recordStatus: 'Active',
        },
        select: { id: true },
      });

      if (!orgUnit) {
        throw createHttpError(404, 'Selected org unit was not found.');
      }
    }

    const cycle = await transaction.performanceCycle.create({
      data: {
        name: data.name,
        status: 'Draft',
        startDate: toDateValue(data.startDate) as Date,
        endDate: toDateValue(data.endDate) as Date,
        selfReviewDueDate: toDateValue(data.selfReviewDueDate) as Date,
        managerReviewDueDate: toDateValue(data.managerReviewDueDate) as Date,
        releaseDate: toDateValue(data.releaseDate) as Date,
        orgUnitId: data.orgUnitId ?? null,
        createdBy: context.userId ?? null,
        updatedBy: context.userId ?? null,
      },
      select: { id: true },
    });

    return cycle.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const cycle = await prisma.performanceCycle.findUniqueOrThrow({
    where: { id: cycleId },
    select: getCycleSelect(),
  });

  return serializeCycle(cycle);
}

export async function updatePerformanceCycle(
  cycleId: string,
  data: UpdatePerformanceCycleInput,
  context: PerformanceContext,
) {
  assertHrAdmin(context);

  const updatedCycleId = await prisma.$transaction(async (transaction) => {
    const existingCycle = await transaction.performanceCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        selfReviewDueDate: true,
        managerReviewDueDate: true,
        releaseDate: true,
      },
    });

    if (!existingCycle) {
      throw createHttpError(404, 'Performance cycle not found.');
    }

    if (existingCycle.status !== 'Draft') {
      throw createHttpError(409, 'Only draft performance cycles can be edited.');
    }

    const nextStartDate = (toDateValue(data.startDate) as Date | undefined) ?? existingCycle.startDate;
    const nextEndDate = (toDateValue(data.endDate) as Date | undefined) ?? existingCycle.endDate;
    const nextSelfDueDate = (toDateValue(data.selfReviewDueDate) as Date | undefined) ?? existingCycle.selfReviewDueDate;
    const nextManagerDueDate = (toDateValue(data.managerReviewDueDate) as Date | undefined) ?? existingCycle.managerReviewDueDate;
    const nextReleaseDate = (toDateValue(data.releaseDate) as Date | undefined) ?? existingCycle.releaseDate;

    if (nextStartDate > nextEndDate) {
      throw createHttpError(409, 'The end date must be on or after the start date.');
    }

    if (nextSelfDueDate < nextStartDate || nextSelfDueDate > nextEndDate) {
      throw createHttpError(409, 'Self-review due date must fall within the cycle window.');
    }

    if (nextManagerDueDate < nextSelfDueDate || nextManagerDueDate > nextEndDate) {
      throw createHttpError(409, 'Manager review due date must be on or after the self-review due date and within the cycle window.');
    }

    if (nextReleaseDate < nextManagerDueDate) {
      throw createHttpError(409, 'Release date must be on or after the manager review due date.');
    }

    await transaction.performanceCycle.update({
      where: { id: cycleId },
      data: {
        name: data.name ?? undefined,
        startDate: nextStartDate,
        endDate: nextEndDate,
        selfReviewDueDate: nextSelfDueDate,
        managerReviewDueDate: nextManagerDueDate,
        releaseDate: nextReleaseDate,
        orgUnitId: data.orgUnitId === undefined ? undefined : (data.orgUnitId ?? null),
        updatedBy: context.userId ?? null,
      },
    });

    return cycleId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const cycle = await prisma.performanceCycle.findUniqueOrThrow({
    where: { id: updatedCycleId },
    select: getCycleSelect(),
  });

  return serializeCycle(cycle);
}

export async function publishPerformanceCycle(cycleId: string, context: PerformanceContext) {
  assertHrAdmin(context);

  const publishedCycleId = await prisma.$transaction(async (transaction) => {
    const cycle = await transaction.performanceCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        name: true,
        status: true,
        orgUnitId: true,
        selfReviewDueDate: true,
        managerReviewDueDate: true,
        releaseDate: true,
      },
    });

    if (!cycle) {
      throw createHttpError(404, 'Performance cycle not found.');
    }

    if (cycle.status !== 'Draft') {
      throw createHttpError(409, 'Only draft performance cycles can be published.');
    }

    const eligibleEmployees = await transaction.employee.findMany({
      where: {
        status: { not: TERMINATED_EMPLOYEE_STATUS },
        managerId: { not: null },
        manager: {
          is: {
            status: { not: TERMINATED_EMPLOYEE_STATUS },
          },
        },
        ...(cycle.orgUnitId ? {
          position: {
            is: {
              orgUnitId: cycle.orgUnitId,
            },
          },
        } : {}),
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
        managerId: true,
      },
    });

    for (const employee of eligibleEmployees) {
      const existingReview = await transaction.performanceReview.findUnique({
        where: {
          cycleId_employeeId: {
            cycleId,
            employeeId: employee.id,
          },
        },
        select: { id: true },
      });

      const reviewId = existingReview?.id ?? (
        await transaction.performanceReview.create({
          data: {
            cycleId,
            employeeId: employee.id,
            managerId: employee.managerId!,
            status: PERFORMANCE_REVIEW_STATUSES.pendingSelf,
          },
          select: { id: true },
        })
      ).id;

      const sectionCount = await transaction.performanceReviewSection.count({
        where: { reviewId },
      });

      if (sectionCount === 0) {
        await createReviewSections(transaction, reviewId);
      }

      await createReviewWorkflowTasks(transaction, {
        id: reviewId,
        employeeId: employee.id,
        managerId: employee.managerId!,
        employee: {
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
        cycle: {
          name: cycle.name,
          selfReviewDueDate: cycle.selfReviewDueDate,
          managerReviewDueDate: cycle.managerReviewDueDate,
        },
      });
    }

    await transaction.performanceCycle.update({
      where: { id: cycleId },
      data: {
        status: 'Published',
        publishedAt: new Date(),
        updatedBy: context.userId ?? null,
      },
    });

    return cycleId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const cycle = await prisma.performanceCycle.findUniqueOrThrow({
    where: { id: publishedCycleId },
    select: getCycleSelect(),
  });

  return serializeCycle(cycle);
}

export async function listPerformanceReviews(
  query: ListPerformanceReviewsQuery,
  context: PerformanceContext,
) {
  const where: Prisma.PerformanceReviewWhereInput = {
    ...getReviewScopeWhere(context),
  };

  if (query.cycleId) {
    where.cycleId = query.cycleId;
  }

  if (query.status) {
    where.status = query.status;
  }

  const reviews = await prisma.performanceReview.findMany({
    where,
    orderBy: [
      { cycle: { startDate: 'desc' } },
      { employee: { lastName: 'asc' } },
      { employee: { firstName: 'asc' } },
    ],
    select: getReviewSelect(),
  });

  return reviews.map((review) => serializeReview(review, context));
}

export async function getPerformanceReviewById(reviewId: string, context: PerformanceContext) {
  const review = await prisma.performanceReview.findUnique({
    where: { id: reviewId },
    select: getReviewSelect(),
  });

  if (!review) {
    throw createHttpError(404, 'Performance review not found.');
  }

  if (!isHrAdmin(context)) {
    const currentEmployeeId = assertLinkedEmployee(context);
    if (review.employeeId !== currentEmployeeId && review.managerId !== currentEmployeeId) {
      throw createHttpError(403, 'You do not have access to this performance review.');
    }
  }

  return serializeReview(review, context);
}

export async function updateSelfReview(
  reviewId: string,
  data: UpdateSelfReviewInput,
  context: PerformanceContext,
) {
  const currentEmployeeId = assertLinkedEmployee(context);

  const updatedReviewId = await prisma.$transaction(async (transaction) => {
    const review = await requireReviewAccess(transaction, reviewId, context);

    if (review.employeeId !== currentEmployeeId) {
      throw createHttpError(403, 'Only the employee can submit the self-review.');
    }

    if (!reviewCanAcceptSelfReview(review)) {
      throw createHttpError(409, 'This review is not accepting employee self-review updates.');
    }

    for (const section of data.sections) {
      await transaction.performanceReviewSection.updateMany({
        where: {
          reviewId,
          sectionKey: section.sectionKey,
        },
        data: {
          employeeResponse: section.response,
        },
      });
    }

    await transaction.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: PERFORMANCE_REVIEW_STATUSES.selfSubmitted,
      },
    });

    await completeWorkflowTasksForEntity(transaction, PERFORMANCE_SELF_REVIEW_TASK, reviewId);

    return reviewId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return getPerformanceReviewById(updatedReviewId, context);
}

export async function updateManagerReview(
  reviewId: string,
  data: UpdateManagerReviewInput,
  context: PerformanceContext,
) {
  const updatedReviewId = await prisma.$transaction(async (transaction) => {
    const review = await requireReviewAccess(transaction, reviewId, context);

    if (!isHrAdmin(context)) {
      const currentEmployeeId = assertLinkedEmployee(context);
      if (review.managerId !== currentEmployeeId) {
        throw createHttpError(403, 'Only the employee manager can update the manager review.');
      }
    }

    if (!reviewCanAcceptManagerReview(review)) {
      throw createHttpError(409, 'This review is not ready for manager review updates.');
    }

    for (const section of data.sections) {
      await transaction.performanceReviewSection.updateMany({
        where: {
          reviewId,
          sectionKey: section.sectionKey,
        },
        data: {
          managerResponse: section.response,
        },
      });
    }

    await transaction.performanceReview.update({
      where: { id: reviewId },
      data: {
        managerSummary: data.managerSummary === undefined ? undefined : trimToNull(data.managerSummary),
        status: PERFORMANCE_REVIEW_STATUSES.managerInProgress,
      },
    });

    return reviewId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return getPerformanceReviewById(updatedReviewId, context);
}

export async function finalizePerformanceReview(reviewId: string, context: PerformanceContext) {
  const updatedReviewId = await prisma.$transaction(async (transaction) => {
    const review = await requireReviewAccess(transaction, reviewId, context);

    if (!isHrAdmin(context)) {
      const currentEmployeeId = assertLinkedEmployee(context);
      if (review.managerId !== currentEmployeeId) {
        throw createHttpError(403, 'Only the employee manager can finalize this review.');
      }
    }

    if (!reviewCanAcceptManagerReview(review)) {
      throw createHttpError(409, 'This review is not ready to finalize.');
    }

    const managerCompletedSectionCount = review.sections.filter((section) => Boolean(trimToNull(section.managerResponse))).length;
    if (managerCompletedSectionCount < reviewSectionDefinitions.length) {
      throw createHttpError(409, 'Complete all manager review sections before finalizing the review.');
    }

    const finalizedAt = new Date();
    await transaction.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: PERFORMANCE_REVIEW_STATUSES.finalized,
        finalizedAt,
        releasedAt: finalizedAt,
      },
    });

    await completeWorkflowTasksForEntity(transaction, PERFORMANCE_MANAGER_REVIEW_TASK, reviewId);
    await createAcknowledgmentTask(transaction, {
      id: review.id,
      employeeId: review.employeeId,
      employee: {
        firstName: review.employee.firstName,
        lastName: review.employee.lastName,
      },
      cycle: {
        name: review.cycle.name,
        releaseDate: review.cycle.releaseDate,
      },
    });

    return reviewId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return getPerformanceReviewById(updatedReviewId, context);
}

export async function acknowledgePerformanceReview(
  reviewId: string,
  _data: AcknowledgePerformanceReviewInput,
  context: PerformanceContext,
) {
  const currentEmployeeId = assertLinkedEmployee(context);

  const updatedReviewId = await prisma.$transaction(async (transaction) => {
    const review = await requireReviewAccess(transaction, reviewId, context);

    if (review.employeeId !== currentEmployeeId) {
      throw createHttpError(403, 'Only the employee can acknowledge this review.');
    }

    if (review.status !== PERFORMANCE_REVIEW_STATUSES.finalized) {
      throw createHttpError(409, 'Only finalized reviews can be acknowledged.');
    }

    await transaction.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: PERFORMANCE_REVIEW_STATUSES.acknowledged,
        acknowledgedAt: new Date(),
      },
    });

    await completeWorkflowTasksForEntity(transaction, PERFORMANCE_ACK_TASK, reviewId);

    return reviewId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return getPerformanceReviewById(updatedReviewId, context);
}

export async function listPerformanceGoals(
  query: ListPerformanceGoalsQuery,
  context: PerformanceContext,
) {
  const where: Prisma.PerformanceGoalWhereInput = {
    ...getGoalScopeWhere(context),
  };

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.status) {
    where.status = query.status;
  }

  const goals = await prisma.performanceGoal.findMany({
    where,
    orderBy: [
      { targetDate: 'asc' },
      { createdAt: 'desc' },
    ],
    select: getGoalSelect(),
  });

  return goals.map((goal) => serializeGoal(goal, context));
}

export async function createPerformanceGoal(
  data: CreatePerformanceGoalInput,
  context: PerformanceContext,
) {
  if (!isHrAdmin(context) && !context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to assign goals.');
  }

  const goalId = await prisma.$transaction(async (transaction) => {
    const employee = await requireActiveEmployee(transaction, data.employeeId);

    if (!isHrAdmin(context)) {
      const currentEmployeeId = assertLinkedEmployee(context);
      if (employee.managerId !== currentEmployeeId) {
        throw createHttpError(403, 'Managers can only assign goals to direct reports.');
      }
    }

    if (data.createdInCycleId) {
      const cycle = await transaction.performanceCycle.findUnique({
        where: { id: data.createdInCycleId },
        select: { id: true },
      });

      if (!cycle) {
        throw createHttpError(404, 'Selected performance cycle was not found.');
      }
    }

    const goal = await transaction.performanceGoal.create({
      data: {
        employeeId: employee.id,
        managerId: employee.managerId ?? context.currentEmployeeId ?? null,
        title: data.title,
        description: trimToNull(data.description),
        status: data.status,
        targetDate: (toDateValue(data.targetDate) as Date | null | undefined) ?? null,
        createdInCycleId: data.createdInCycleId ?? null,
      },
      select: { id: true },
    });

    return goal.id;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const goal = await prisma.performanceGoal.findUniqueOrThrow({
    where: { id: goalId },
    select: getGoalSelect(),
  });

  return serializeGoal(goal, context);
}

export async function updatePerformanceGoal(
  goalId: string,
  data: UpdatePerformanceGoalInput,
  context: PerformanceContext,
) {
  if (!isHrAdmin(context) && !context.currentEmployeeId) {
    throw createHttpError(409, 'Link your account to an employee profile to manage goals.');
  }

  const updatedGoalId = await prisma.$transaction(async (transaction) => {
    const goal = await requireGoalAccess(transaction, goalId, context);

    if (!isHrAdmin(context)) {
      const currentEmployeeId = assertLinkedEmployee(context);
      if (goal.managerId !== currentEmployeeId) {
        throw createHttpError(403, 'Only managers can edit goal definitions for direct reports.');
      }
    }

    await transaction.performanceGoal.update({
      where: { id: goalId },
      data: {
        title: data.title ?? undefined,
        description: data.description === undefined ? undefined : trimToNull(data.description),
        status: data.status ?? undefined,
        targetDate: data.targetDate === undefined ? undefined : ((toDateValue(data.targetDate) as Date | null | undefined) ?? null),
        closedAt: data.status && data.status !== PERFORMANCE_GOAL_STATUSES.active ? new Date() : undefined,
      },
    });

    return goalId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const goal = await prisma.performanceGoal.findUniqueOrThrow({
    where: { id: updatedGoalId },
    select: getGoalSelect(),
  });

  return serializeGoal(goal, context);
}

export async function createPerformanceGoalUpdate(
  goalId: string,
  data: CreatePerformanceGoalUpdateInput,
  context: PerformanceContext,
) {
  const currentEmployeeId = assertLinkedEmployee(context);

  const updatedGoalId = await prisma.$transaction(async (transaction) => {
    const goal = await requireGoalAccess(transaction, goalId, context);

    if (!isHrAdmin(context) && goal.employeeId !== currentEmployeeId && goal.managerId !== currentEmployeeId) {
      throw createHttpError(403, 'Only the employee or direct manager can add a goal update.');
    }

    await transaction.performanceGoalUpdate.create({
      data: {
        goalId,
        authorEmployeeId: currentEmployeeId,
        progressNote: data.progressNote,
        percentComplete: data.percentComplete ?? null,
      },
    });

    return goalId;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const goal = await prisma.performanceGoal.findUniqueOrThrow({
    where: { id: updatedGoalId },
    select: getGoalSelect(),
  });

  return serializeGoal(goal, context);
}
