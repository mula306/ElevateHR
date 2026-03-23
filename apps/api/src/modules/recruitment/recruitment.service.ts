import { Prisma } from '../../generated/prisma';
import {
  ACCOUNT_QUEUE_FINANCE,
  ACCOUNT_QUEUE_HRBP,
  ACCOUNT_QUEUE_HR_OPERATIONS,
  resolveWorkflowAssignment,
} from '../../shared/lib/accounts';
import {
  createApprovalAction,
  createWorkflowTask,
  WORKFLOW_STATUS_CANCELLED,
  WORKFLOW_STATUS_COMPLETED,
} from '../../shared/lib/hr-ops';
import { prisma } from '../../shared/lib/prisma';
import {
  createHttpError,
  decimalToNumber,
  toDateValue,
  toIsoString,
  trimToNull,
} from '../../shared/lib/service-utils';
import { dynamicFieldSchemaInputSchema } from './recruitment.schemas';
import type {
  ApprovalRuleInput,
  ApprovalRuleSetInput,
  CreateHiringRecordInput,
  CreateJobRequestInput,
  DynamicFieldDefinitionInput,
  FundingTypeInput,
  JobRequestDecisionInput,
  ListJobRequestsQuery,
  ListRuleSetsQuery,
  RequestTypeInput,
  SimulateApprovalRuleSetInput,
  UpdateApprovalRuleSetInput,
  UpdateFundingTypeInput,
  UpdateHiringRecordInput,
  UpdateJobRequestInput,
  UpdateRequestTypeInput,
} from './recruitment.schemas';

const HR_ADMIN_ROLES = new Set(['Admin', 'HR.Manager']);
const RECRUITMENT_CONTROL_ROLES = new Set(['Admin', 'HR.Manager', 'Finance', 'HR.BusinessPartner']);
const TERMINATED_EMPLOYEE_STATUS = 'Terminated';
const recruitmentPositionInclude = Prisma.validator<Prisma.PositionInclude>()({
  orgUnit: true,
  classification: true,
  level: true,
  reportsToPosition: {
    include: {
      employees: {
        where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
        orderBy: [{ hireDate: 'asc' }],
      },
    },
  },
});

type RecruitmentPositionRecord = Prisma.PositionGetPayload<{ include: typeof recruitmentPositionInclude }>;

interface RecruitmentContext {
  currentEmployeeId?: string | null;
  currentAccountId?: string | null;
  currentAccount?: Express.Request['account'];
  roles?: string[];
  userId?: string | null;
}

function hasRole(context: RecruitmentContext, allowedRoles: Set<string>) {
  return (context.roles ?? []).some((role) => allowedRoles.has(role));
}

function assertRecruitmentAdmin(context: RecruitmentContext) {
  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES)) {
    throw createHttpError(403, 'You do not have access to recruitment configuration.');
  }
}

function assertHrAdmin(context: RecruitmentContext) {
  if (!hasRole(context, HR_ADMIN_ROLES)) {
    throw createHttpError(403, 'Only HR administrators can perform this action.');
  }
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeJsonValue(value: Record<string, unknown> | DynamicFieldDefinitionInput[] | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  if (!Array.isArray(value) && Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function parseDynamicFieldSchema(value: string | null | undefined) {
  const result = dynamicFieldSchemaInputSchema.safeParse(value);
  return result.success ? result.data : [];
}

function validateDynamicFieldValue(field: DynamicFieldDefinitionInput, value: string | null) {
  if (!value) {
    return;
  }

  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    throw createHttpError(400, `The "${field.label}" field must contain a valid number.`);
  }

  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createHttpError(400, `The "${field.label}" field must use the YYYY-MM-DD date format.`);
  }

  if (field.type === 'select' && field.options && !field.options.includes(value)) {
    throw createHttpError(400, `The "${field.label}" field must use one of the configured options.`);
  }
}

async function buildValidatedRequestFieldValues(
  transaction: Prisma.TransactionClient,
  requestTypeId: string,
  fieldValues: Array<{
    fieldKey: string;
    fieldLabel: string;
    valueType: string;
    value?: string | null;
  }> | undefined,
) {
  if (fieldValues === undefined) {
    return undefined;
  }

  const requestType = await transaction.jobRequestType.findUnique({
    where: { id: requestTypeId },
    select: {
      id: true,
      name: true,
      fieldSchema: true,
    },
  });

  if (!requestType) {
    throw createHttpError(404, 'The selected request type could not be found.');
  }

  const configuredFields = parseDynamicFieldSchema(requestType.fieldSchema);
  const configuredFieldMap = new Map(configuredFields.map((field) => [field.key, field]));
  const submittedFieldMap = new Map<string, string | null>();

  for (const fieldValue of fieldValues) {
    if (!configuredFieldMap.has(fieldValue.fieldKey)) {
      throw createHttpError(400, `The "${fieldValue.fieldKey}" field is not configured for the selected request type.`);
    }

    if (submittedFieldMap.has(fieldValue.fieldKey)) {
      throw createHttpError(400, `The "${fieldValue.fieldKey}" field was provided more than once.`);
    }

    submittedFieldMap.set(fieldValue.fieldKey, trimToNull(fieldValue.value));
  }

  return configuredFields.map((field) => {
    const value = submittedFieldMap.get(field.key) ?? null;

    if (field.required && !value) {
      throw createHttpError(400, `The "${field.label}" field is required for the ${requestType.name} request type.`);
    }

    validateDynamicFieldValue(field, value);

    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      valueType: field.type,
      value,
    };
  });
}

async function getNextSequenceValue(
  transaction: Prisma.TransactionClient,
  key: string,
) {
  const sequence = await transaction.sequence.upsert({
    where: { key },
    update: {
      currentValue: {
        increment: 1,
      },
    },
    create: {
      key,
      currentValue: 1,
    },
    select: {
      currentValue: true,
    },
  });

  return sequence.currentValue;
}

async function getAncestorOrgUnitIds(orgUnitId: string) {
  const ids = new Set<string>();
  let currentId: string | null = orgUnitId;

  while (currentId) {
    ids.add(currentId);
    const current: { parentId: string | null } | null = await prisma.orgUnit.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = current?.parentId ?? null;
  }

  return [...ids];
}

function calculateRuleSpecificity(rule: any) {
  let score = 0;
  if (rule.requestTypeId) score += 1;
  if (rule.fundingTypeId) score += 1;
  if (rule.budgetImpacting !== null && rule.budgetImpacting !== undefined) score += 1;
  if (rule.requestorRole) score += 1;
  if (rule.orgUnitId) score += 1;
  const conditions = parseJsonValue<Record<string, unknown>>(rule.conditions, {});
  score += Object.keys(conditions).length;
  return score;
}

async function selectActiveRuleSet(orgUnitId: string) {
  const ancestorOrgUnitIds = await getAncestorOrgUnitIds(orgUnitId);
  const now = new Date();

  const ruleSets = await prisma.approvalRuleSet.findMany({
    where: {
      status: 'Active',
      OR: [
        { effectiveStartDate: null },
        { effectiveStartDate: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { effectiveEndDate: null },
            { effectiveEndDate: { gte: now } },
          ],
        },
        {
          OR: [
            { scopeOrgUnitId: null },
            { scopeOrgUnitId: { in: ancestorOrgUnitIds } },
          ],
        },
      ],
    },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      },
    },
    orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
  });

  if (ruleSets.length === 0) {
    throw createHttpError(409, 'No active approval rule set is available for this request.');
  }

  return ruleSets[0];
}

function ruleMatches(rule: any, input: {
  requestTypeId: string;
  fundingTypeId: string;
  budgetImpacting: boolean;
  requestorRoles: string[];
  ancestorOrgUnitIds: string[];
}) {
  if (rule.requestTypeId && rule.requestTypeId !== input.requestTypeId) {
    return false;
  }

  if (rule.fundingTypeId && rule.fundingTypeId !== input.fundingTypeId) {
    return false;
  }

  if (rule.budgetImpacting !== null && rule.budgetImpacting !== undefined && rule.budgetImpacting !== input.budgetImpacting) {
    return false;
  }

  if (rule.requestorRole && !input.requestorRoles.includes(rule.requestorRole)) {
    return false;
  }

  if (rule.orgUnitId && !input.ancestorOrgUnitIds.includes(rule.orgUnitId)) {
    return false;
  }

  const conditions = parseJsonValue<{ orgUnitIds?: string[] }>(rule.conditions, {});
  if (conditions.orgUnitIds?.length && !conditions.orgUnitIds.some((orgUnitId) => input.ancestorOrgUnitIds.includes(orgUnitId))) {
    return false;
  }

  return true;
}

async function resolveApprovalRoute(input: {
  requestTypeId: string;
  fundingTypeId: string;
  budgetImpacting: boolean;
  orgUnitId: string;
  requestorRoles: string[];
}) {
  const ancestorOrgUnitIds = await getAncestorOrgUnitIds(input.orgUnitId);
  const ruleSet = await selectActiveRuleSet(input.orgUnitId);
  const matchingRules = ruleSet.rules.filter((rule) => ruleMatches(rule, {
    ...input,
    ancestorOrgUnitIds,
  }));

  const selectedRule = [...matchingRules]
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return calculateRuleSpecificity(right) - calculateRuleSpecificity(left);
    })[0]
    ?? ruleSet.rules.find((rule) => rule.isFallback);

  if (!selectedRule) {
    throw createHttpError(409, 'No matching approval rule was found and no fallback rule is configured.');
  }

  return { ruleSet, rule: selectedRule };
}

function serializeRequestType(record: any) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    fieldSchema: parseDynamicFieldSchema(record.fieldSchema),
    isActive: record.isActive,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function serializeFundingType(record: any) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    category: record.category ?? null,
    description: record.description ?? null,
    durationType: record.durationType ?? null,
    isPermanent: record.isPermanent,
    isActive: record.isActive,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function serializeRuleSet(record: any) {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    status: record.status,
    version: record.version,
    scopeOrgUnitId: record.scopeOrgUnitId ?? null,
    effectiveStartDate: toIsoString(record.effectiveStartDate),
    effectiveEndDate: toIsoString(record.effectiveEndDate),
    publishedAt: toIsoString(record.publishedAt),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    rules: (record.rules ?? []).map((rule: any) => ({
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      isActive: rule.isActive,
      isFallback: rule.isFallback,
      requestTypeId: rule.requestTypeId ?? null,
      fundingTypeId: rule.fundingTypeId ?? null,
      budgetImpacting: rule.budgetImpacting ?? null,
      requestorRole: rule.requestorRole ?? null,
      orgUnitId: rule.orgUnitId ?? null,
      conditions: parseJsonValue(rule.conditions, {}),
      steps: (rule.steps ?? []).map((step: any) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        label: step.label,
        assigneeSource: step.assigneeSource,
        assigneeValue: step.assigneeValue ?? null,
        fallbackQueueKey: step.fallbackQueueKey ?? null,
        escalationDays: step.escalationDays ?? null,
        dueDays: step.dueDays ?? null,
      })),
    })),
  };
}

function serializeHiringRecord(record: any) {
  return {
    id: record.id,
    jobRequestId: record.jobRequestId,
    positionId: record.positionId,
    candidateName: record.candidateName,
    competitionNumber: record.competitionNumber,
    compensationAmount: decimalToNumber(record.compensationAmount),
    payFrequency: record.payFrequency,
    hireDate: toIsoString(record.hireDate),
    notes: record.notes ?? null,
    selectedEmployee: record.selectedEmployee ? {
      id: record.selectedEmployee.id,
      employeeNumber: record.selectedEmployee.employeeNumber,
      fullName: `${record.selectedEmployee.firstName} ${record.selectedEmployee.lastName}`,
    } : null,
    position: record.position ? {
      id: record.position.id,
      positionCode: record.position.positionCode,
      title: record.position.title,
    } : null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function serializeEmployeeSnapshot(record: any) {
  return {
    id: record.id,
    employeeId: record.employeeId ?? null,
    jobRequestId: record.jobRequestId,
    positionId: record.positionId,
    employeeNumber: record.employeeNumber ?? null,
    fullName: record.fullName,
    email: record.email ?? null,
    jobTitle: record.jobTitle,
    department: record.department,
    orgUnitName: record.orgUnitName,
    positionCode: record.positionCode,
    classificationCode: record.classificationCode,
    levelCode: record.levelCode,
    managerName: record.managerName ?? null,
    compensationAmount: decimalToNumber(record.compensationAmount),
    payFrequency: record.payFrequency,
    competitionNumber: record.competitionNumber ?? null,
    hireDate: toIsoString(record.hireDate),
    snapshotType: record.snapshotType,
    createdAt: toIsoString(record.createdAt),
  };
}

function serializeJobRequest(record: any) {
  return {
    id: record.id,
    requestNumber: record.requestNumber,
    status: record.status,
    budgetImpacting: record.budgetImpacting,
    title: record.title,
    headcount: record.headcount,
    fte: decimalToNumber(record.fte),
    weeklyHours: decimalToNumber(record.weeklyHours),
    justification: record.justification ?? null,
    businessCase: record.businessCase ?? null,
    submittedAt: toIsoString(record.submittedAt),
    approvedAt: toIsoString(record.approvedAt),
    rejectedAt: toIsoString(record.rejectedAt),
    closedAt: toIsoString(record.closedAt),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    requestType: record.requestType ? serializeRequestType(record.requestType) : null,
    fundingType: record.fundingType ? serializeFundingType(record.fundingType) : null,
    orgUnit: record.orgUnit ? {
      id: record.orgUnit.id,
      code: record.orgUnit.code,
      name: record.orgUnit.name,
      type: record.orgUnit.type,
    } : null,
    classification: record.classification ? {
      id: record.classification.id,
      code: record.classification.code,
      title: record.classification.title,
      occupationCode: record.classification.occupationCode,
    } : null,
    level: record.level ? {
      id: record.level.id,
      levelCode: record.level.levelCode,
      currency: record.level.currency,
      rangeMin: decimalToNumber(record.level.rangeMin),
      rangeMid: decimalToNumber(record.level.rangeMid),
      rangeMax: decimalToNumber(record.level.rangeMax),
    } : null,
    reportsToPosition: record.reportsToPosition ? {
      id: record.reportsToPosition.id,
      positionCode: record.reportsToPosition.positionCode,
      title: record.reportsToPosition.title,
    } : null,
    requestor: record.requestorEmployee ? {
      id: record.requestorEmployee.id,
      employeeNumber: record.requestorEmployee.employeeNumber,
      fullName: `${record.requestorEmployee.firstName} ${record.requestorEmployee.lastName}`,
      department: record.requestorEmployee.department,
      jobTitle: record.requestorEmployee.jobTitle,
    } : null,
    targetPosition: record.targetPosition ? {
      id: record.targetPosition.id,
      positionCode: record.targetPosition.positionCode,
      title: record.targetPosition.title,
      positionStatus: record.targetPosition.positionStatus,
    } : null,
    linkedPosition: record.linkedPosition ? {
      id: record.linkedPosition.id,
      positionCode: record.linkedPosition.positionCode,
      title: record.linkedPosition.title,
      positionStatus: record.linkedPosition.positionStatus,
    } : null,
    approvalRuleSet: record.approvalRuleSet ? {
      id: record.approvalRuleSet.id,
      name: record.approvalRuleSet.name,
      status: record.approvalRuleSet.status,
      version: record.approvalRuleSet.version,
    } : null,
    approvalRule: record.approvalRule ? {
      id: record.approvalRule.id,
      name: record.approvalRule.name,
      priority: record.approvalRule.priority,
    } : null,
    fieldValues: (record.fieldValues ?? []).map((field: any) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      valueType: field.valueType,
      value: field.value ?? null,
    })),
    approvalSteps: (record.approvalSteps ?? []).map((step: any) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      label: step.label,
      assigneeSource: step.assigneeSource,
      assigneeValue: step.assigneeValue ?? null,
      assigneeQueueKey: step.assigneeQueueKey ?? null,
      status: step.status,
      dueDate: toIsoString(step.dueDate),
      respondedAt: toIsoString(step.respondedAt),
      assigneeAccount: step.assigneeAccount ? {
        id: step.assigneeAccount.id,
        displayName: step.assigneeAccount.displayName,
        email: step.assigneeAccount.email,
      } : null,
      ownerEmployee: step.ownerEmployee ? {
        id: step.ownerEmployee.id,
        fullName: `${step.ownerEmployee.firstName} ${step.ownerEmployee.lastName}`,
      } : null,
      decisions: (step.decisions ?? []).map((decision: any) => ({
        id: decision.id,
        action: decision.action,
        comments: decision.comments ?? null,
        createdAt: toIsoString(decision.createdAt),
        actorEmployee: decision.actorEmployee ? {
          id: decision.actorEmployee.id,
          fullName: `${decision.actorEmployee.firstName} ${decision.actorEmployee.lastName}`,
        } : null,
      })),
    })),
    statusHistory: (record.statusHistory ?? []).map((entry: any) => ({
      id: entry.id,
      status: entry.status,
      action: entry.action,
      comments: entry.comments ?? null,
      createdAt: toIsoString(entry.createdAt),
      actorEmployee: entry.actorEmployee ? {
        id: entry.actorEmployee.id,
        fullName: `${entry.actorEmployee.firstName} ${entry.actorEmployee.lastName}`,
      } : null,
      actorAccount: entry.actorAccount ? {
        id: entry.actorAccount.id,
        displayName: entry.actorAccount.displayName,
      } : null,
    })),
    hiringRecord: record.hiringRecord ? serializeHiringRecord(record.hiringRecord) : null,
    employeeSnapshots: (record.employeeSnapshots ?? []).map(serializeEmployeeSnapshot),
  };
}

async function getRequestForDetail(requestId: string) {
  const request = await prisma.jobRequest.findUnique({
    where: { id: requestId },
    include: {
      requestType: true,
      fundingType: true,
      orgUnit: true,
      classification: true,
      level: true,
      reportsToPosition: true,
      requestorEmployee: true,
      targetPosition: true,
      linkedPosition: true,
      approvalRuleSet: true,
      approvalRule: true,
      fieldValues: { orderBy: [{ fieldLabel: 'asc' }] },
      statusHistory: {
        orderBy: [{ createdAt: 'desc' }],
        include: {
          actorEmployee: true,
          actorAccount: true,
        },
      },
      approvalSteps: {
        orderBy: [{ stepOrder: 'asc' }],
        include: {
          assigneeAccount: true,
          ownerEmployee: true,
          decisions: {
            orderBy: [{ createdAt: 'desc' }],
            include: {
              actorEmployee: true,
            },
          },
        },
      },
      hiringRecord: {
        include: {
          selectedEmployee: true,
          position: true,
        },
      },
      employeeSnapshots: {
        orderBy: [{ createdAt: 'desc' }],
      },
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  return request;
}

async function logJobRequestStatus(
  transaction: Prisma.TransactionClient,
  jobRequestId: string,
  status: string,
  action: string,
  context: RecruitmentContext,
  comments?: string | null,
) {
  await transaction.jobRequestStatusHistory.create({
    data: {
      jobRequestId,
      status,
      action,
      comments: trimToNull(comments),
      actorEmployeeId: context.currentEmployeeId ?? null,
      actorAccountId: context.currentAccountId ?? null,
    },
  });
}

async function replaceRequestFieldValues(
  transaction: Prisma.TransactionClient,
  jobRequestId: string,
  fieldValues: Array<{
    fieldKey: string;
    fieldLabel: string;
    valueType: string;
    value?: string | null;
  }> | undefined,
) {
  if (!fieldValues) {
    return;
  }

  await transaction.jobRequestFieldValue.deleteMany({
    where: { jobRequestId },
  });

  if (fieldValues.length === 0) {
    return;
  }

  await transaction.jobRequestFieldValue.createMany({
    data: fieldValues.map((fieldValue) => ({
      jobRequestId,
      fieldKey: fieldValue.fieldKey,
      fieldLabel: fieldValue.fieldLabel,
      valueType: fieldValue.valueType,
      value: trimToNull(fieldValue.value),
    })),
  });
}

async function loadRequestContextForRouting(transaction: Prisma.TransactionClient, requestId: string) {
  const request = await transaction.jobRequest.findUnique({
    where: { id: requestId },
    include: {
      requestorEmployee: true,
      targetPosition: {
        include: {
          employees: {
            where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
            orderBy: [{ hireDate: 'asc' }],
          },
        },
      },
      reportsToPosition: {
        include: {
          employees: {
            where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
            orderBy: [{ hireDate: 'asc' }],
          },
        },
      },
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  return request;
}

async function resolveStepAssignment(
  transaction: Prisma.TransactionClient,
  request: any,
  step: any,
) {
  if (step.assigneeSource === 'RequestorManager') {
    return resolveWorkflowAssignment(transaction, {
      ownerEmployeeId: request.requestorEmployee.managerId,
      assigneeQueueKey: step.fallbackQueueKey ?? ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'Manager',
    });
  }

  if (step.assigneeSource === 'PositionIncumbent') {
    const incumbentEmployeeId = request.targetPosition?.employees?.[0]?.id
      ?? request.reportsToPosition?.employees?.[0]?.id
      ?? null;

    return resolveWorkflowAssignment(transaction, {
      ownerEmployeeId: incumbentEmployeeId,
      assigneeQueueKey: step.fallbackQueueKey ?? ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'Manager',
    });
  }

  if (step.assigneeSource === 'SpecificAccount') {
    return {
      assigneeAccountId: step.assigneeValue ?? null,
      assigneeQueueKey: step.fallbackQueueKey ?? null,
    };
  }

  return {
    assigneeAccountId: null,
    assigneeQueueKey: step.assigneeValue ?? step.fallbackQueueKey ?? ACCOUNT_QUEUE_HR_OPERATIONS,
  };
}

function getQueueLabel(queueKey: string | null | undefined) {
  if (queueKey === ACCOUNT_QUEUE_HR_OPERATIONS) {
    return 'HR Operations';
  }

  if (queueKey === ACCOUNT_QUEUE_FINANCE) {
    return 'Finance';
  }

  if (queueKey === ACCOUNT_QUEUE_HRBP) {
    return 'HR Business Partner';
  }

  return queueKey ?? 'Assigned';
}

async function createApprovalSteps(
  transaction: Prisma.TransactionClient,
  requestId: string,
  context: RecruitmentContext,
) {
  const request = await loadRequestContextForRouting(transaction, requestId);
  const { ruleSet, rule } = await resolveApprovalRoute({
    requestTypeId: request.requestTypeId,
    fundingTypeId: request.fundingTypeId,
    budgetImpacting: request.budgetImpacting,
    orgUnitId: request.orgUnitId,
    requestorRoles: context.roles ?? [],
  });

  await transaction.jobRequest.update({
    where: { id: request.id },
    data: {
      approvalRuleSetId: ruleSet.id,
      approvalRuleId: rule.id,
      currentStepOrder: rule.steps[0]?.stepOrder ?? null,
      status: 'In Review',
      submittedAt: new Date(),
    },
  });

  for (const ruleStep of rule.steps) {
    const assignment = await resolveStepAssignment(transaction, request, ruleStep);
    const dueDate = ruleStep.dueDays ? new Date(Date.now() + ruleStep.dueDays * 24 * 60 * 60 * 1000) : null;
    const approvalStep = await transaction.jobRequestApprovalStep.create({
      data: {
        jobRequestId: request.id,
        ruleStepId: ruleStep.id,
        stepOrder: ruleStep.stepOrder,
        label: ruleStep.label,
        assigneeSource: ruleStep.assigneeSource,
        assigneeValue: ruleStep.assigneeValue ?? null,
        ownerEmployeeId: request.requestorEmployee.managerId ?? null,
        assigneeAccountId: assignment.assigneeAccountId,
        assigneeQueueKey: assignment.assigneeQueueKey,
        dueDate,
        status: ruleStep.stepOrder === rule.steps[0]?.stepOrder ? 'Pending' : 'Queued',
      },
    });

    if (ruleStep.stepOrder === rule.steps[0]?.stepOrder) {
      const workflowTask = await createWorkflowTask(transaction, {
        taskType: 'JobRequestApproval',
        title: `${request.requestNumber}: ${ruleStep.label}`,
        description: request.title,
        employeeId: request.requestorEmployeeId,
        ownerEmployeeId: approvalStep.ownerEmployeeId ?? undefined,
        assigneeAccountId: approvalStep.assigneeAccountId ?? undefined,
        assigneeQueueKey: approvalStep.assigneeQueueKey ?? undefined,
        ownerLabel: approvalStep.assigneeQueueKey ? getQueueLabel(approvalStep.assigneeQueueKey) : 'Manager',
        relatedEntityType: 'JobRequestApprovalStep',
        relatedEntityId: approvalStep.id,
        dueDate,
        priority: request.budgetImpacting ? 'High' : 'Normal',
      });

      await transaction.jobRequestApprovalStep.update({
        where: { id: approvalStep.id },
        data: {
          workflowTaskId: workflowTask.id,
        },
      });
    }
  }

  await logJobRequestStatus(transaction, request.id, 'In Review', 'Submitted', context, null);
}

async function ensurePositionForApprovedRequest(
  transaction: Prisma.TransactionClient,
  requestId: string,
): Promise<RecruitmentPositionRecord> {
  const request = await transaction.jobRequest.findUnique({
    where: { id: requestId },
    include: {
      linkedPosition: true,
      targetPosition: true,
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  const targetPositionId = request.targetPositionId ?? request.linkedPositionId ?? null;

  if (targetPositionId) {
    const position = await transaction.position.update({
      where: { id: targetPositionId },
      data: {
        title: request.title,
        orgUnitId: request.orgUnitId,
        classificationId: request.classificationId,
        levelId: request.levelId,
        reportsToPositionId: request.reportsToPositionId ?? null,
        headcount: request.headcount,
        fte: request.fte,
        weeklyHours: request.weeklyHours,
        fundingTypeId: request.fundingTypeId,
        budgetImpacting: request.budgetImpacting,
        positionStatus: 'In Progress',
        lastApprovedRequestId: request.id,
      },
      include: recruitmentPositionInclude,
    });

    await transaction.jobRequest.update({
      where: { id: request.id },
      data: { linkedPositionId: position.id },
    });

    return position;
  }

  const nextValue = await getNextSequenceValue(transaction, 'position_code');
  const position = await transaction.position.create({
    data: {
      positionCode: `POS-${String(nextValue).padStart(5, '0')}`,
      title: request.title,
      orgUnitId: request.orgUnitId,
      classificationId: request.classificationId,
      levelId: request.levelId,
      reportsToPositionId: request.reportsToPositionId ?? null,
      headcount: request.headcount,
      fte: request.fte,
      weeklyHours: request.weeklyHours,
      fundingTypeId: request.fundingTypeId,
      budgetImpacting: request.budgetImpacting,
      positionStatus: 'In Progress',
      lastApprovedRequestId: request.id,
    },
    include: recruitmentPositionInclude,
  });

  await transaction.jobRequest.update({
    where: { id: request.id },
    data: { linkedPositionId: position.id },
  });

  return position;
}

async function closeOpenTasksForRequest(
  transaction: Prisma.TransactionClient,
  requestId: string,
  comments?: string | null,
) {
  const steps = await transaction.jobRequestApprovalStep.findMany({
    where: {
      jobRequestId: requestId,
      workflowTaskId: { not: null },
    },
    select: {
      workflowTaskId: true,
    },
  });

  const taskIds = steps.map((step) => step.workflowTaskId).filter(Boolean) as string[];
  if (taskIds.length === 0) {
    return;
  }

  await transaction.workflowTask.updateMany({
    where: {
      id: { in: taskIds },
      status: 'Open',
    },
    data: {
      status: WORKFLOW_STATUS_CANCELLED,
      comments: trimToNull(comments),
      completedAt: new Date(),
    },
  });
}

async function openNextApprovalStep(
  transaction: Prisma.TransactionClient,
  jobRequestId: string,
  afterStepOrder: number,
  request: any,
) {
  const nextStep = await transaction.jobRequestApprovalStep.findFirst({
    where: {
      jobRequestId,
      stepOrder: {
        gt: afterStepOrder,
      },
    },
    orderBy: [{ stepOrder: 'asc' }],
  });

  if (!nextStep) {
    const position = await ensurePositionForApprovedRequest(transaction, jobRequestId);
    await transaction.jobRequest.update({
      where: { id: jobRequestId },
      data: {
        status: 'Approved',
        currentStepOrder: null,
        approvedAt: new Date(),
      },
    });

    await createWorkflowTask(transaction, {
      taskType: 'HiringCloseout',
      title: `${request.requestNumber}: Hiring close-out`,
      description: request.title,
      employeeId: request.requestorEmployeeId,
      assigneeQueueKey: ACCOUNT_QUEUE_HR_OPERATIONS,
      ownerLabel: 'HR Operations',
      relatedEntityType: 'JobRequest',
      relatedEntityId: jobRequestId,
      priority: 'Normal',
    });

    await logJobRequestStatus(
      transaction,
      jobRequestId,
      'Approved',
      'Approved',
      {
        currentEmployeeId: request.requestorEmployeeId,
        currentAccountId: request.requestorAccountId,
      },
      `Position ${position.positionCode} approved.`,
    );
    return;
  }

  const workflowTask = await createWorkflowTask(transaction, {
    taskType: 'JobRequestApproval',
    title: `${request.requestNumber}: ${nextStep.label}`,
    description: request.title,
    employeeId: request.requestorEmployeeId,
    ownerEmployeeId: nextStep.ownerEmployeeId ?? undefined,
    assigneeAccountId: nextStep.assigneeAccountId ?? undefined,
    assigneeQueueKey: nextStep.assigneeQueueKey ?? undefined,
    ownerLabel: nextStep.assigneeQueueKey ? getQueueLabel(nextStep.assigneeQueueKey) : 'Manager',
    relatedEntityType: 'JobRequestApprovalStep',
    relatedEntityId: nextStep.id,
    dueDate: nextStep.dueDate,
    priority: request.budgetImpacting ? 'High' : 'Normal',
  });

  await transaction.jobRequestApprovalStep.update({
    where: { id: nextStep.id },
    data: {
      status: 'Pending',
      workflowTaskId: workflowTask.id,
    },
  });

  await transaction.jobRequest.update({
    where: { id: jobRequestId },
    data: {
      currentStepOrder: nextStep.stepOrder,
      status: 'In Review',
    },
  });
}

async function canAccessRequest(request: any, context: RecruitmentContext) {
  if (hasRole(context, RECRUITMENT_CONTROL_ROLES)) {
    return true;
  }

  if (!context.currentEmployeeId) {
    return false;
  }

  if (request.requestorEmployeeId === context.currentEmployeeId) {
    return true;
  }

  return request.approvalSteps?.some((step: any) => {
    if (step.assigneeAccountId && context.currentAccountId && step.assigneeAccountId === context.currentAccountId) {
      return true;
    }

    return Boolean(step.assigneeQueueKey && context.currentAccount?.queueMemberships.includes(step.assigneeQueueKey));
  }) ?? false;
}

export async function listRequestTypes(context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  const records = await prisma.jobRequestType.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return records.map(serializeRequestType);
}

export async function createRequestType(data: RequestTypeInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.jobRequestType.create({
    data: {
      code: data.code,
      name: data.name,
      description: trimToNull(data.description),
      fieldSchema: serializeJsonValue(data.fieldSchema) ?? null,
      isActive: data.isActive,
    },
  });

  return listRequestTypes(context);
}

export async function updateRequestType(id: string, data: UpdateRequestTypeInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.jobRequestType.update({
    where: { id },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      description: data.description === undefined ? undefined : trimToNull(data.description),
      fieldSchema: data.fieldSchema === undefined ? undefined : (serializeJsonValue(data.fieldSchema) ?? null),
      isActive: data.isActive ?? undefined,
    },
  });

  return listRequestTypes(context);
}

export async function listFundingTypes(context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  const records = await prisma.fundingType.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return records.map(serializeFundingType);
}

export async function createFundingType(data: FundingTypeInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.fundingType.create({
    data: {
      code: data.code,
      name: data.name,
      category: trimToNull(data.category),
      description: trimToNull(data.description),
      durationType: trimToNull(data.durationType),
      isPermanent: data.isPermanent,
      isActive: data.isActive,
    },
  });
  return listFundingTypes(context);
}

export async function updateFundingType(id: string, data: UpdateFundingTypeInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.fundingType.update({
    where: { id },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      category: data.category === undefined ? undefined : trimToNull(data.category),
      description: data.description === undefined ? undefined : trimToNull(data.description),
      durationType: data.durationType === undefined ? undefined : trimToNull(data.durationType),
      isPermanent: data.isPermanent ?? undefined,
      isActive: data.isActive ?? undefined,
    },
  });
  return listFundingTypes(context);
}

async function replaceRuleSetRules(
  transaction: Prisma.TransactionClient,
  ruleSetId: string,
  rules: ApprovalRuleInput[],
) {
  await transaction.approvalRuleStep.deleteMany({
    where: {
      rule: {
        ruleSetId,
      },
    },
  });

  await transaction.approvalRule.deleteMany({
    where: { ruleSetId },
  });

  for (const rule of rules) {
    const createdRule = await transaction.approvalRule.create({
      data: {
        ruleSetId,
        name: rule.name,
        priority: rule.priority,
        isActive: rule.isActive,
        isFallback: rule.isFallback,
        requestTypeId: rule.requestTypeId ?? null,
        fundingTypeId: rule.fundingTypeId ?? null,
        budgetImpacting: rule.budgetImpacting ?? null,
        requestorRole: trimToNull(rule.requestorRole),
        orgUnitId: rule.orgUnitId ?? null,
        conditions: serializeJsonValue(rule.conditions) ?? null,
      },
    });

    for (const step of rule.steps) {
      await transaction.approvalRuleStep.create({
        data: {
          ruleId: createdRule.id,
          stepOrder: step.stepOrder,
          label: step.label,
          assigneeSource: step.assigneeSource,
          assigneeValue: trimToNull(step.assigneeValue),
          fallbackQueueKey: trimToNull(step.fallbackQueueKey),
          escalationDays: step.escalationDays ?? null,
          dueDays: step.dueDays ?? null,
        },
      });
    }
  }
}

export async function listApprovalRuleSets(query: ListRuleSetsQuery, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  const records = await prisma.approvalRuleSet.findMany({
    where: query.status ? { status: query.status } : undefined,
    orderBy: [{ status: 'asc' }, { version: 'desc' }, { name: 'asc' }],
    include: {
      rules: {
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      },
    },
  });

  return records.map(serializeRuleSet);
}

export async function createApprovalRuleSet(data: ApprovalRuleSetInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.$transaction(async (transaction) => {
    const ruleSet = await transaction.approvalRuleSet.create({
      data: {
        name: data.name,
        description: trimToNull(data.description),
        status: data.status,
        version: data.version,
        scopeOrgUnitId: data.scopeOrgUnitId ?? null,
        effectiveStartDate: toDateValue(data.effectiveStartDate) ?? null,
        effectiveEndDate: toDateValue(data.effectiveEndDate) ?? null,
        createdByAccountId: context.currentAccountId ?? null,
        updatedByAccountId: context.currentAccountId ?? null,
      },
    });

    await replaceRuleSetRules(transaction, ruleSet.id, data.rules);
  });

  return listApprovalRuleSets({}, context);
}

export async function updateApprovalRuleSet(id: string, data: UpdateApprovalRuleSetInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.$transaction(async (transaction) => {
    await transaction.approvalRuleSet.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        description: data.description === undefined ? undefined : trimToNull(data.description),
        status: data.status ?? undefined,
        version: data.version ?? undefined,
        scopeOrgUnitId: data.scopeOrgUnitId === undefined ? undefined : (data.scopeOrgUnitId ?? null),
        effectiveStartDate: data.effectiveStartDate === undefined ? undefined : (toDateValue(data.effectiveStartDate) ?? null),
        effectiveEndDate: data.effectiveEndDate === undefined ? undefined : (toDateValue(data.effectiveEndDate) ?? null),
        updatedByAccountId: context.currentAccountId ?? null,
      },
    });

    if (data.rules) {
      await replaceRuleSetRules(transaction, id, data.rules);
    }
  });

  return listApprovalRuleSets({}, context);
}

export async function publishApprovalRuleSet(id: string, context: RecruitmentContext) {
  assertHrAdmin(context);
  await prisma.$transaction(async (transaction) => {
    const ruleSet = await transaction.approvalRuleSet.findUnique({
      where: { id },
      include: {
        rules: {
          where: { isActive: true },
          include: { steps: true },
        },
      },
    });

    if (!ruleSet) {
      throw createHttpError(404, 'Approval rule set not found.');
    }

    if (!ruleSet.rules.some((rule) => rule.isFallback)) {
      throw createHttpError(409, 'A fallback rule is required before publishing.');
    }

    if (ruleSet.rules.some((rule) => rule.steps.length === 0)) {
      throw createHttpError(409, 'Every active rule must include at least one approval step.');
    }

    await transaction.approvalRuleSet.updateMany({
      where: {
        status: 'Active',
        NOT: { id },
      },
      data: {
        status: 'Archived',
      },
    });

    await transaction.approvalRuleSet.update({
      where: { id },
      data: {
        status: 'Active',
        publishedAt: new Date(),
        updatedByAccountId: context.currentAccountId ?? null,
      },
    });
  });

  return listApprovalRuleSets({}, context);
}

export async function simulateApprovalRuleSet(id: string, input: SimulateApprovalRuleSetInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  const ruleSet = await prisma.approvalRuleSet.findUnique({
    where: { id },
    include: {
      rules: {
        where: { isActive: true },
        include: {
          steps: {
            orderBy: [{ stepOrder: 'asc' }],
          },
        },
      },
    },
  });

  if (!ruleSet) {
    throw createHttpError(404, 'Approval rule set not found.');
  }

  const ancestorOrgUnitIds = await getAncestorOrgUnitIds(input.orgUnitId);
  const rule = [...ruleSet.rules.filter((candidate) => ruleMatches(candidate, {
    ...input,
    requestorRoles: input.requestorRole ? [input.requestorRole] : [],
    ancestorOrgUnitIds,
  }))]
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return calculateRuleSpecificity(right) - calculateRuleSpecificity(left);
    })[0]
    ?? ruleSet.rules.find((candidate) => candidate.isFallback);

  if (!rule) {
    return {
      matched: false,
      ruleSetId: ruleSet.id,
      ruleSetName: ruleSet.name,
      rule: null,
      steps: [],
    };
  }

  return {
    matched: true,
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    rule: {
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      isFallback: rule.isFallback,
    },
    steps: rule.steps.map((step) => ({
      stepOrder: step.stepOrder,
      label: step.label,
      assigneeSource: step.assigneeSource,
      assigneeValue: step.assigneeValue ?? null,
      fallbackQueueKey: step.fallbackQueueKey ?? null,
      escalationDays: step.escalationDays ?? null,
      dueDays: step.dueDays ?? null,
    })),
  };
}

export async function getRecruitmentSummary(context: RecruitmentContext) {
  const where = hasRole(context, RECRUITMENT_CONTROL_ROLES)
    ? {}
    : context.currentEmployeeId
      ? { requestorEmployeeId: context.currentEmployeeId }
      : { id: '__none__' };

  const [requestCounts, inFlightApprovals, hiringInProgress] = await Promise.all([
    prisma.jobRequest.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    }),
    prisma.jobRequestApprovalStep.count({
      where: {
        status: 'Pending',
      },
    }),
    prisma.jobRequest.count({
      where: {
        ...where,
        status: 'Hiring In Progress',
      },
    }),
  ]);

  const statusCounts = Object.fromEntries(requestCounts.map((entry) => [entry.status, entry._count.id]));

  return {
    totalRequests: Object.values(statusCounts).reduce((total: number, value: any) => total + Number(value), 0),
    submitted: Number(statusCounts.Submitted ?? 0) + Number(statusCounts['In Review'] ?? 0),
    needsRework: Number(statusCounts['Needs Rework'] ?? 0) + Number(statusCounts.Rejected ?? 0),
    approved: Number(statusCounts.Approved ?? 0),
    hiringInProgress,
    inFlightApprovals,
  };
}

export async function listJobRequests(query: ListJobRequestsQuery, context: RecruitmentContext) {
  const baseWhere: any = {};
  const search = trimToNull(query.search);

  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES)) {
    if (!context.currentEmployeeId) {
      return [];
    }

    baseWhere.requestorEmployeeId = context.currentEmployeeId;
  }

  if (query.status) {
    baseWhere.status = query.status;
  }

  if (query.requestTypeId) {
    baseWhere.requestTypeId = query.requestTypeId;
  }

  if (query.orgUnitId) {
    baseWhere.orgUnitId = query.orgUnitId;
  }

  if (search) {
    baseWhere.OR = [
      { requestNumber: { contains: search } },
      { title: { contains: search } },
      { requestorEmployee: { is: { firstName: { contains: search } } } },
      { requestorEmployee: { is: { lastName: { contains: search } } } },
    ];
  }

  const records = await prisma.jobRequest.findMany({
    where: baseWhere,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      requestType: true,
      fundingType: true,
      orgUnit: true,
      classification: true,
      level: true,
      requestorEmployee: true,
      targetPosition: true,
      linkedPosition: true,
      approvalRuleSet: true,
      approvalRule: true,
      fieldValues: true,
      statusHistory: {
        orderBy: [{ createdAt: 'desc' }],
        take: 3,
        include: {
          actorEmployee: true,
          actorAccount: true,
        },
      },
      approvalSteps: {
        orderBy: [{ stepOrder: 'asc' }],
        include: {
          assigneeAccount: true,
          ownerEmployee: true,
          decisions: {
            orderBy: [{ createdAt: 'desc' }],
            take: 2,
            include: {
              actorEmployee: true,
            },
          },
        },
      },
      hiringRecord: {
        include: {
          selectedEmployee: true,
          position: true,
        },
      },
      employeeSnapshots: {
        orderBy: [{ createdAt: 'desc' }],
        take: 2,
      },
    },
  });

  return records.map(serializeJobRequest);
}

export async function getJobRequestById(id: string, context: RecruitmentContext) {
  const request = await getRequestForDetail(id);
  if (!(await canAccessRequest(request, context))) {
    throw createHttpError(403, 'You do not have access to this job request.');
  }
  return serializeJobRequest(request);
}

export async function createJobRequest(data: CreateJobRequestInput, context: RecruitmentContext) {
  if (!context.currentEmployeeId) {
    throw createHttpError(409, 'A linked employee profile is required to create a job request.');
  }

  const request = await prisma.$transaction(async (transaction) => {
    const validatedFieldValues = await buildValidatedRequestFieldValues(transaction, data.requestTypeId, data.fieldValues);
    const nextValue = await getNextSequenceValue(transaction, 'job_request');
    const record = await transaction.jobRequest.create({
      data: {
        requestNumber: `REQ-${String(nextValue).padStart(5, '0')}`,
        requestTypeId: data.requestTypeId,
        requestorEmployeeId: context.currentEmployeeId!,
        requestorAccountId: context.currentAccountId ?? null,
        budgetImpacting: data.budgetImpacting,
        fundingTypeId: data.fundingTypeId,
        orgUnitId: data.orgUnitId,
        classificationId: data.classificationId,
        levelId: data.levelId,
        reportsToPositionId: data.reportsToPositionId ?? null,
        targetPositionId: data.targetPositionId ?? null,
        title: data.title,
        headcount: data.headcount,
        fte: data.fte,
        weeklyHours: data.weeklyHours,
        justification: trimToNull(data.justification),
        businessCase: trimToNull(data.businessCase),
      },
    });

    await replaceRequestFieldValues(transaction, record.id, validatedFieldValues);
    await logJobRequestStatus(transaction, record.id, 'Draft', 'Created', context, null);
    return record;
  });

  return getJobRequestById(request.id, context);
}

export async function updateJobRequest(id: string, data: UpdateJobRequestInput, context: RecruitmentContext) {
  const existing = await prisma.jobRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestorEmployeeId: true,
      requestTypeId: true,
      status: true,
    },
  });

  if (!existing) {
    throw createHttpError(404, 'Job request not found.');
  }

  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES) && existing.requestorEmployeeId !== context.currentEmployeeId) {
    throw createHttpError(403, 'You can only edit your own job requests.');
  }

  if (!['Draft', 'Needs Rework', 'Rejected'].includes(existing.status)) {
    throw createHttpError(409, 'Only draft or rework requests can be edited.');
  }

  if (data.requestTypeId && data.requestTypeId !== existing.requestTypeId && data.fieldValues === undefined) {
    throw createHttpError(400, 'Dynamic field values must be resubmitted when the request type changes.');
  }

  await prisma.$transaction(async (transaction) => {
    const effectiveRequestTypeId = data.requestTypeId ?? existing.requestTypeId;
    const validatedFieldValues = await buildValidatedRequestFieldValues(transaction, effectiveRequestTypeId, data.fieldValues);

    await transaction.jobRequest.update({
      where: { id },
      data: {
        requestTypeId: data.requestTypeId ?? undefined,
        budgetImpacting: data.budgetImpacting ?? undefined,
        fundingTypeId: data.fundingTypeId ?? undefined,
        orgUnitId: data.orgUnitId ?? undefined,
        classificationId: data.classificationId ?? undefined,
        levelId: data.levelId ?? undefined,
        reportsToPositionId: data.reportsToPositionId === undefined ? undefined : (data.reportsToPositionId ?? null),
        targetPositionId: data.targetPositionId === undefined ? undefined : (data.targetPositionId ?? null),
        title: data.title ?? undefined,
        headcount: data.headcount ?? undefined,
        fte: data.fte ?? undefined,
        weeklyHours: data.weeklyHours ?? undefined,
        justification: data.justification === undefined ? undefined : trimToNull(data.justification),
        businessCase: data.businessCase === undefined ? undefined : trimToNull(data.businessCase),
        status: existing.status === 'Rejected' ? 'Needs Rework' : undefined,
      },
    });

    await replaceRequestFieldValues(transaction, id, validatedFieldValues);
    await logJobRequestStatus(transaction, id, existing.status === 'Rejected' ? 'Needs Rework' : existing.status, 'Updated', context, null);
  });

  return getJobRequestById(id, context);
}

export async function submitJobRequest(id: string, context: RecruitmentContext) {
  const request = await prisma.jobRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestorEmployeeId: true,
      status: true,
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES) && request.requestorEmployeeId !== context.currentEmployeeId) {
    throw createHttpError(403, 'You can only submit your own job requests.');
  }

  if (!['Draft', 'Needs Rework', 'Rejected'].includes(request.status)) {
    throw createHttpError(409, 'Only draft or rework requests can be submitted.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobRequestApprovalStep.deleteMany({
      where: { jobRequestId: id },
    });
    await closeOpenTasksForRequest(transaction, id, 'Superseded by resubmission.');
    await createApprovalSteps(transaction, id, context);
  });

  return getJobRequestById(id, context);
}

function canActOnApprovalStep(step: any, context: RecruitmentContext) {
  if (hasRole(context, RECRUITMENT_CONTROL_ROLES)) {
    return true;
  }

  if (step.assigneeAccountId && context.currentAccountId && step.assigneeAccountId === context.currentAccountId) {
    return true;
  }

  return Boolean(step.assigneeQueueKey && context.currentAccount?.queueMemberships.includes(step.assigneeQueueKey));
}

export async function approveJobRequest(id: string, data: JobRequestDecisionInput, context: RecruitmentContext) {
  const request = await getRequestForDetail(id);
  const currentStep = request.approvalSteps.find((step: any) => step.status === 'Pending');

  if (!currentStep) {
    throw createHttpError(409, 'This request does not have a pending approval step.');
  }

  if (!canActOnApprovalStep(currentStep, context)) {
    throw createHttpError(403, 'You are not assigned to approve this request.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobRequestApprovalDecision.create({
      data: {
        approvalStepId: currentStep.id,
        action: 'Approved',
        comments: trimToNull(data.comments),
        actorEmployeeId: context.currentEmployeeId ?? null,
        actorAccountId: context.currentAccountId ?? null,
      },
    });

    await transaction.jobRequestApprovalStep.update({
      where: { id: currentStep.id },
      data: {
        status: 'Approved',
        respondedAt: new Date(),
      },
    });

    if (currentStep.workflowTaskId) {
      await transaction.workflowTask.update({
        where: { id: currentStep.workflowTaskId },
        data: {
          status: WORKFLOW_STATUS_COMPLETED,
          comments: trimToNull(data.comments),
          completedAt: new Date(),
        },
      });

      await createApprovalAction(
        transaction,
        currentStep.workflowTaskId,
        'Approved',
        context.currentEmployeeId ?? null,
        data.comments ?? null,
      );
    }

    await logJobRequestStatus(transaction, id, 'In Review', 'Approved Step', context, data.comments ?? null);
    await openNextApprovalStep(transaction, id, currentStep.stepOrder, request);
  });

  return getJobRequestById(id, context);
}

export async function rejectJobRequest(id: string, data: JobRequestDecisionInput, context: RecruitmentContext) {
  const request = await getRequestForDetail(id);
  const currentStep = request.approvalSteps.find((step: any) => step.status === 'Pending');

  if (!currentStep) {
    throw createHttpError(409, 'This request does not have a pending approval step.');
  }

  if (!canActOnApprovalStep(currentStep, context)) {
    throw createHttpError(403, 'You are not assigned to reject this request.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobRequestApprovalDecision.create({
      data: {
        approvalStepId: currentStep.id,
        action: 'Rejected',
        comments: trimToNull(data.comments),
        actorEmployeeId: context.currentEmployeeId ?? null,
        actorAccountId: context.currentAccountId ?? null,
      },
    });

    await transaction.jobRequestApprovalStep.update({
      where: { id: currentStep.id },
      data: {
        status: 'Rejected',
        respondedAt: new Date(),
      },
    });

    if (currentStep.workflowTaskId) {
      await transaction.workflowTask.update({
        where: { id: currentStep.workflowTaskId },
        data: {
          status: WORKFLOW_STATUS_COMPLETED,
          comments: trimToNull(data.comments),
          completedAt: new Date(),
        },
      });

      await createApprovalAction(
        transaction,
        currentStep.workflowTaskId,
        'Rejected',
        context.currentEmployeeId ?? null,
        data.comments ?? null,
      );
    }

    await transaction.jobRequest.update({
      where: { id },
      data: {
        status: 'Rejected',
        rejectedAt: new Date(),
        currentStepOrder: null,
      },
    });

    await closeOpenTasksForRequest(transaction, id, 'Request rejected.');

    const reworkTask = await createWorkflowTask(transaction, {
      taskType: 'JobRequestRework',
      title: `${request.requestNumber}: Rework request`,
      description: request.title,
      employeeId: request.requestorEmployeeId,
      ownerEmployeeId: request.requestorEmployeeId,
      relatedEntityType: 'JobRequest',
      relatedEntityId: request.id,
      priority: 'High',
      comments: data.comments ?? null,
    });

    await createApprovalAction(
      transaction,
      reworkTask.id,
      'Rework Requested',
      context.currentEmployeeId ?? null,
      data.comments ?? null,
    );

    await logJobRequestStatus(transaction, id, 'Rejected', 'Rejected', context, data.comments ?? null);
  });

  return getJobRequestById(id, context);
}

export async function reworkJobRequest(id: string, data: JobRequestDecisionInput, context: RecruitmentContext) {
  const request = await prisma.jobRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestorEmployeeId: true,
      status: true,
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES) && request.requestorEmployeeId !== context.currentEmployeeId) {
    throw createHttpError(403, 'You can only rework your own job requests.');
  }

  if (!['Rejected', 'Needs Rework'].includes(request.status)) {
    throw createHttpError(409, 'Only rejected requests can be moved back to draft.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobRequest.update({
      where: { id },
      data: {
        status: 'Draft',
        currentStepOrder: null,
      },
    });

    await transaction.workflowTask.updateMany({
      where: {
        relatedEntityType: 'JobRequest',
        relatedEntityId: id,
        taskType: 'JobRequestRework',
        status: 'Open',
      },
      data: {
        status: WORKFLOW_STATUS_COMPLETED,
        comments: trimToNull(data.comments),
        completedAt: new Date(),
      },
    });

    await logJobRequestStatus(transaction, id, 'Draft', 'Rework Started', context, data.comments ?? null);
  });

  return getJobRequestById(id, context);
}

export async function cancelJobRequest(id: string, data: JobRequestDecisionInput, context: RecruitmentContext) {
  const request = await prisma.jobRequest.findUnique({
    where: { id },
    select: {
      id: true,
      requestorEmployeeId: true,
      status: true,
    },
  });

  if (!request) {
    throw createHttpError(404, 'Job request not found.');
  }

  if (!hasRole(context, RECRUITMENT_CONTROL_ROLES) && request.requestorEmployeeId !== context.currentEmployeeId) {
    throw createHttpError(403, 'You can only cancel your own job requests.');
  }

  if (['Approved', 'Closed', 'Cancelled'].includes(request.status)) {
    throw createHttpError(409, 'This request can no longer be cancelled.');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.jobRequest.update({
      where: { id },
      data: {
        status: 'Cancelled',
        closedAt: new Date(),
        currentStepOrder: null,
      },
    });
    await closeOpenTasksForRequest(transaction, id, data.comments ?? null);
    await logJobRequestStatus(transaction, id, 'Cancelled', 'Cancelled', context, data.comments ?? null);
  });

  return getJobRequestById(id, context);
}

export async function createPositionFromApprovedRequest(id: string, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.$transaction(async (transaction) => {
    const request = await transaction.jobRequest.findUnique({
      where: { id },
      select: {
        status: true,
      },
    });

    if (!request) {
      throw createHttpError(404, 'Job request not found.');
    }

    if (!['Approved', 'Hiring In Progress', 'Closed'].includes(request.status)) {
      throw createHttpError(409, 'The request must be approved before a position can be created.');
    }

    await ensurePositionForApprovedRequest(transaction, id);
  });

  return getJobRequestById(id, context);
}

function deriveManagerName(position: RecruitmentPositionRecord | null | undefined) {
  const manager = position?.reportsToPosition?.employees?.[0];
  return manager ? `${manager.firstName} ${manager.lastName}` : null;
}

export async function createHiringRecordForRequest(id: string, data: CreateHiringRecordInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  await prisma.$transaction(async (transaction) => {
    const request = await transaction.jobRequest.findUnique({
      where: { id },
      include: {
        linkedPosition: { include: recruitmentPositionInclude },
      },
    });

    if (!request) {
      throw createHttpError(404, 'Job request not found.');
    }

    const position = request.linkedPosition ?? await ensurePositionForApprovedRequest(transaction, id);
    const hiringRecord = await transaction.hiringRecord.create({
      data: {
        jobRequestId: id,
        positionId: data.positionId ?? position.id,
        selectedEmployeeId: data.selectedEmployeeId ?? null,
        candidateName: data.candidateName,
        competitionNumber: data.competitionNumber,
        compensationAmount: data.compensationAmount,
        payFrequency: data.payFrequency,
        hireDate: new Date(data.hireDate),
        notes: trimToNull(data.notes),
      },
      include: {
        selectedEmployee: true,
        position: true,
      },
    });

    await transaction.position.update({
      where: { id: position.id },
      data: {
        positionStatus: 'Filled',
        currentCompetitionNumber: data.competitionNumber,
      },
    });

    if (data.selectedEmployeeId) {
      await transaction.employee.update({
        where: { id: data.selectedEmployeeId },
        data: {
          positionId: position.id,
          jobTitle: position.title,
          department: position.orgUnit.name,
          salary: data.compensationAmount,
          payFrequency: data.payFrequency,
          managerId: position.reportsToPosition?.employees?.[0]?.id ?? undefined,
          status: 'Active',
        },
      });
    }

    await transaction.employeeSnapshot.create({
      data: {
        employeeId: data.selectedEmployeeId ?? null,
        jobRequestId: id,
        hiringRecordId: hiringRecord.id,
        positionId: position.id,
        employeeNumber: hiringRecord.selectedEmployee?.employeeNumber ?? null,
        firstName: hiringRecord.selectedEmployee?.firstName ?? data.candidateName.split(' ')[0] ?? data.candidateName,
        lastName: hiringRecord.selectedEmployee?.lastName ?? (data.candidateName.split(' ').slice(1).join(' ') || data.candidateName),
        fullName: hiringRecord.selectedEmployee ? `${hiringRecord.selectedEmployee.firstName} ${hiringRecord.selectedEmployee.lastName}` : data.candidateName,
        email: hiringRecord.selectedEmployee?.email ?? null,
        jobTitle: position.title,
        department: position.orgUnit.name,
        orgUnitName: position.orgUnit.name,
        positionCode: position.positionCode,
        classificationCode: position.classification.code,
        levelCode: position.level.levelCode,
        managerName: deriveManagerName(position),
        compensationAmount: data.compensationAmount,
        payFrequency: data.payFrequency,
        competitionNumber: data.competitionNumber,
        hireDate: new Date(data.hireDate),
      },
    });

    await transaction.jobRequest.update({
      where: { id },
      data: {
        status: 'Closed',
        closedAt: new Date(),
      },
    });

    await transaction.workflowTask.updateMany({
      where: {
        relatedEntityType: 'JobRequest',
        relatedEntityId: id,
        taskType: 'HiringCloseout',
        status: 'Open',
      },
      data: {
        status: WORKFLOW_STATUS_COMPLETED,
        completedAt: new Date(),
      },
    });

    await logJobRequestStatus(transaction, id, 'Closed', 'Hiring Closed', context, data.notes ?? null);
  });

  return getJobRequestById(id, context);
}

export async function updateHiringRecord(id: string, data: UpdateHiringRecordInput, context: RecruitmentContext) {
  assertRecruitmentAdmin(context);
  const record = await prisma.hiringRecord.update({
    where: { id },
    data: {
      positionId: data.positionId === undefined ? undefined : (data.positionId ?? undefined),
      selectedEmployeeId: data.selectedEmployeeId === undefined ? undefined : (data.selectedEmployeeId ?? null),
      candidateName: data.candidateName ?? undefined,
      competitionNumber: data.competitionNumber ?? undefined,
      compensationAmount: data.compensationAmount ?? undefined,
      payFrequency: data.payFrequency ?? undefined,
      hireDate: data.hireDate === undefined ? undefined : new Date(data.hireDate),
      notes: data.notes === undefined ? undefined : trimToNull(data.notes),
    },
    include: {
      selectedEmployee: true,
      position: true,
    },
  });

  return serializeHiringRecord(record);
}
