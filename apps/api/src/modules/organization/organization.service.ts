import { Prisma } from '../../generated/prisma';
import { prisma } from '../../shared/lib/prisma';
import {
  ArchiveRecordInput,
  CreateClassificationInput,
  CreateLevelInput,
  CreateOrgUnitInput,
  CreatePositionInput,
  ListEmployeeOptionsQuery,
  ListLevelsQuery,
  ListOrgUnitsQuery,
  ListPositionsQuery,
  OrganizationListQuery,
  UpdateClassificationInput,
  UpdateLevelInput,
  UpdateOrgUnitInput,
  UpdatePositionInput,
} from './organization.schemas';

const ACTIVE_RECORD_STATUS = 'Active';
const ARCHIVED_RECORD_STATUS = 'Archived';
const TERMINATED_EMPLOYEE_STATUS = 'Terminated';

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function createHttpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function buildRecordStatusWhere(query: Pick<OrganizationListQuery, 'includeArchived' | 'recordStatus'>) {
  if (query.recordStatus) {
    return { recordStatus: query.recordStatus };
  }

  return query.includeArchived ? {} : { recordStatus: ACTIVE_RECORD_STATUS };
}

function normalizePositionStatus(positionStatus: string, incumbentCount: number) {
  if (incumbentCount > 0 && positionStatus === 'Vacant') {
    return 'Active';
  }

  return positionStatus;
}

function serializeEmployeeSummary(employee: any) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    status: employee.status,
    jobTitle: employee.jobTitle,
    department: employee.department,
    positionId: employee.positionId ?? null,
  };
}

function serializePosition(position: any) {
  const incumbents = (position.employees ?? []).map(serializeEmployeeSummary);

  return {
    id: position.id,
    positionCode: position.positionCode,
    title: position.title,
    positionStatus: position.positionStatus,
    headcount: position.headcount,
    vacancyCount: Math.max(position.headcount - incumbents.length, 0),
    recordStatus: position.recordStatus,
    archivedAt: toIsoString(position.archivedAt),
    archivedBy: position.archivedBy ?? null,
    archiveReason: position.archiveReason ?? null,
    createdAt: toIsoString(position.createdAt),
    updatedAt: toIsoString(position.updatedAt),
    orgUnit: position.orgUnit ? {
      id: position.orgUnit.id,
      code: position.orgUnit.code,
      name: position.orgUnit.name,
      type: position.orgUnit.type,
      recordStatus: position.orgUnit.recordStatus,
    } : null,
    classification: position.classification ? {
      id: position.classification.id,
      code: position.classification.code,
      title: position.classification.title,
      occupationCode: position.classification.occupationCode,
      annualHours: position.classification.annualHours,
      family: position.classification.family ?? null,
      recordStatus: position.classification.recordStatus,
    } : null,
    level: position.level ? {
      id: position.level.id,
      classificationId: position.level.classificationId,
      levelCode: position.level.levelCode,
      currency: position.level.currency,
      rangeMin: decimalToNumber(position.level.rangeMin),
      rangeMid: decimalToNumber(position.level.rangeMid),
      rangeMax: decimalToNumber(position.level.rangeMax),
      recordStatus: position.level.recordStatus,
    } : null,
    reportsToPosition: position.reportsToPosition ? {
      id: position.reportsToPosition.id,
      positionCode: position.reportsToPosition.positionCode,
      title: position.reportsToPosition.title,
      recordStatus: position.reportsToPosition.recordStatus,
    } : null,
    directReportCount: position.directReports?.length ?? 0,
    incumbents,
  };
}

function serializeOrgUnit(unit: any) {
  const incumbentCount = (unit.positions ?? []).reduce((total: number, position: any) => {
    return total + (position.employees?.length ?? 0);
  }, 0);

  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    parentId: unit.parentId ?? null,
    parent: unit.parent ? {
      id: unit.parent.id,
      code: unit.parent.code,
      name: unit.parent.name,
      recordStatus: unit.parent.recordStatus,
    } : null,
    activeChildCount: unit.children?.length ?? 0,
    activePositionCount: unit.positions?.length ?? 0,
    incumbentCount,
    recordStatus: unit.recordStatus,
    archivedAt: toIsoString(unit.archivedAt),
    archivedBy: unit.archivedBy ?? null,
    archiveReason: unit.archiveReason ?? null,
    createdAt: toIsoString(unit.createdAt),
    updatedAt: toIsoString(unit.updatedAt),
  };
}

function serializeClassification(classification: any) {
  return {
    id: classification.id,
    code: classification.code,
    title: classification.title,
    occupationCode: classification.occupationCode,
    annualHours: classification.annualHours,
    family: classification.family ?? null,
    description: classification.description ?? null,
    recordStatus: classification.recordStatus,
    archivedAt: toIsoString(classification.archivedAt),
    archivedBy: classification.archivedBy ?? null,
    archiveReason: classification.archiveReason ?? null,
    createdAt: toIsoString(classification.createdAt),
    updatedAt: toIsoString(classification.updatedAt),
    activePositionCount: classification.positions?.length ?? 0,
    levels: (classification.levels ?? []).map((level: any) => ({
      id: level.id,
      classificationId: level.classificationId,
      levelCode: level.levelCode,
      currency: level.currency,
      rangeMin: decimalToNumber(level.rangeMin),
      rangeMid: decimalToNumber(level.rangeMid),
      rangeMax: decimalToNumber(level.rangeMax),
      recordStatus: level.recordStatus,
      archivedAt: toIsoString(level.archivedAt),
      archivedBy: level.archivedBy ?? null,
      archiveReason: level.archiveReason ?? null,
      createdAt: toIsoString(level.createdAt),
      updatedAt: toIsoString(level.updatedAt),
      activePositionCount: level.positions?.length ?? 0,
    })),
  };
}

function serializeLevel(level: any) {
  return {
    id: level.id,
    classificationId: level.classificationId,
    levelCode: level.levelCode,
    currency: level.currency,
    rangeMin: decimalToNumber(level.rangeMin),
    rangeMid: decimalToNumber(level.rangeMid),
    rangeMax: decimalToNumber(level.rangeMax),
    recordStatus: level.recordStatus,
    archivedAt: toIsoString(level.archivedAt),
    archivedBy: level.archivedBy ?? null,
    archiveReason: level.archiveReason ?? null,
    createdAt: toIsoString(level.createdAt),
    updatedAt: toIsoString(level.updatedAt),
    activePositionCount: level.positions?.length ?? 0,
    classification: level.classification ? {
      id: level.classification.id,
      code: level.classification.code,
      title: level.classification.title,
      occupationCode: level.classification.occupationCode,
      annualHours: level.classification.annualHours,
      recordStatus: level.classification.recordStatus,
    } : null,
  };
}

function serializeEmployeeOption(employee: any) {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    status: employee.status,
    jobTitle: employee.jobTitle,
    department: employee.department,
    positionId: employee.positionId ?? null,
    currentPosition: employee.position ? {
      id: employee.position.id,
      positionCode: employee.position.positionCode,
      title: employee.position.title,
      recordStatus: employee.position.recordStatus,
    } : null,
  };
}

function buildOrgTree(orgUnits: any[]) {
  const nodesById = new Map<string, any>();
  const roots: any[] = [];

  for (const unit of orgUnits) {
    const positions = (unit.positions ?? []).map(serializePosition);
    const incumbentEmployees = positions.reduce((total: number, position: any) => total + position.incumbents.length, 0);
    const openSeats = positions.reduce((total: number, position: any) => total + position.vacancyCount, 0);

    nodesById.set(unit.id, {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      type: unit.type,
      parentId: unit.parentId ?? null,
      summary: {
        approvedPositions: positions.length,
        filledPositions: positions.filter((position: any) => position.incumbents.length > 0).length,
        openSeats,
        incumbentEmployees,
      },
      positions,
      children: [],
    });
  }

  for (const node of nodesById.values()) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }

    const parent = nodesById.get(node.parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }

    parent.children.push(node);
  }

  const sortTree = (nodes: any[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name));

    for (const node of nodes) {
      sortTree(node.children);
      node.positions.sort((left: any, right: any) => left.title.localeCompare(right.title));
    }
  };

  sortTree(roots);

  return roots;
}

async function getOrgUnitForValidation(transaction: Prisma.TransactionClient, orgUnitId: string) {
  const orgUnit = await transaction.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      recordStatus: true,
    },
  });

  if (!orgUnit) {
    throw createHttpError(404, 'Org unit not found.');
  }

  return orgUnit;
}

async function getClassificationForValidation(transaction: Prisma.TransactionClient, classificationId: string) {
  const classification = await transaction.jobClassification.findUnique({
    where: { id: classificationId },
    select: {
      id: true,
      code: true,
      title: true,
      recordStatus: true,
    },
  });

  if (!classification) {
    throw createHttpError(404, 'Classification not found.');
  }

  return classification;
}

async function getLevelForValidation(transaction: Prisma.TransactionClient, levelId: string) {
  const level = await transaction.positionLevel.findUnique({
    where: { id: levelId },
    select: {
      id: true,
      classificationId: true,
      levelCode: true,
      recordStatus: true,
    },
  });

  if (!level) {
    throw createHttpError(404, 'Classification level not found.');
  }

  return level;
}

async function getPositionForValidation(transaction: Prisma.TransactionClient, positionId: string) {
  const position = await transaction.position.findUnique({
    where: { id: positionId },
    select: {
      id: true,
      positionCode: true,
      title: true,
      orgUnitId: true,
      classificationId: true,
      levelId: true,
      reportsToPositionId: true,
      positionStatus: true,
      headcount: true,
      recordStatus: true,
    },
  });

  if (!position) {
    throw createHttpError(404, 'Position not found.');
  }

  return position;
}

async function collectOrgUnitDescendantIds(transaction: Prisma.TransactionClient, orgUnitId: string) {
  const descendants = new Set<string>();
  let frontier = [orgUnitId];

  while (frontier.length > 0) {
    const children = await transaction.orgUnit.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });

    const nextFrontier = children
      .map((child) => child.id)
      .filter((childId) => !descendants.has(childId));

    nextFrontier.forEach((childId) => descendants.add(childId));
    frontier = nextFrontier;
  }

  return descendants;
}

async function collectPositionDescendantIds(transaction: Prisma.TransactionClient, positionId: string) {
  const descendants = new Set<string>();
  let frontier = [positionId];

  while (frontier.length > 0) {
    const children = await transaction.position.findMany({
      where: { reportsToPositionId: { in: frontier } },
      select: { id: true },
    });

    const nextFrontier = children
      .map((child) => child.id)
      .filter((childId) => !descendants.has(childId));

    nextFrontier.forEach((childId) => descendants.add(childId));
    frontier = nextFrontier;
  }

  return descendants;
}

async function ensureOrgUnitParentIsValid(
  transaction: Prisma.TransactionClient,
  parentId: string | null | undefined,
  currentOrgUnitId?: string
) {
  if (!parentId) {
    return null;
  }

  if (currentOrgUnitId && parentId === currentOrgUnitId) {
    throw createHttpError(409, 'An org unit cannot report to itself.');
  }

  const parent = await getOrgUnitForValidation(transaction, parentId);

  if (parent.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Choose an active parent org unit before continuing.');
  }

  if (currentOrgUnitId) {
    const descendants = await collectOrgUnitDescendantIds(transaction, currentOrgUnitId);
    if (descendants.has(parentId)) {
      throw createHttpError(409, 'An org unit cannot be moved under one of its descendants.');
    }
  }

  return parent;
}

async function ensurePositionParentIsValid(
  transaction: Prisma.TransactionClient,
  reportsToPositionId: string | null | undefined,
  currentPositionId?: string
) {
  if (!reportsToPositionId) {
    return null;
  }

  if (currentPositionId && reportsToPositionId === currentPositionId) {
    throw createHttpError(409, 'A position cannot report to itself.');
  }

  const parentPosition = await getPositionForValidation(transaction, reportsToPositionId);

  if (parentPosition.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Choose an active parent position before continuing.');
  }

  if (currentPositionId) {
    const descendants = await collectPositionDescendantIds(transaction, currentPositionId);
    if (descendants.has(reportsToPositionId)) {
      throw createHttpError(409, 'A position cannot report into its own descendant chain.');
    }
  }

  return parentPosition;
}

async function validatePositionDependencies(
  transaction: Prisma.TransactionClient,
  input: Pick<CreatePositionInput, 'orgUnitId' | 'classificationId' | 'levelId' | 'reportsToPositionId'>,
  currentPositionId?: string
) {
  const [orgUnit, classification, level] = await Promise.all([
    getOrgUnitForValidation(transaction, input.orgUnitId),
    getClassificationForValidation(transaction, input.classificationId),
    getLevelForValidation(transaction, input.levelId),
  ]);

  await ensurePositionParentIsValid(transaction, input.reportsToPositionId, currentPositionId);

  if (orgUnit.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Selected org unit is archived. Restore it before assigning positions.');
  }

  if (classification.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Selected classification is archived.');
  }

  if (level.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Selected classification level is archived.');
  }

  if (level.classificationId !== classification.id) {
    throw createHttpError(409, 'Selected level does not belong to the chosen classification.');
  }

  return { orgUnit, classification, level };
}

async function validateIncumbentAssignments(
  transaction: Prisma.TransactionClient,
  employeeIds: string[],
  headcount: number
) {
  if (employeeIds.length > headcount) {
    throw createHttpError(409, 'Assigned incumbents exceed the approved headcount for this position.');
  }

  if (employeeIds.length === 0) {
    return [];
  }

  const employees = await transaction.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      status: true,
    },
  });

  if (employees.length !== employeeIds.length) {
    throw createHttpError(404, 'One or more selected employees could not be found.');
  }

  const blockedEmployee = employees.find((employee) => employee.status === TERMINATED_EMPLOYEE_STATUS);
  if (blockedEmployee) {
    throw createHttpError(409, 'Terminated employees cannot be assigned to positions.');
  }

  return employeeIds;
}

async function syncPositionAssignments(
  transaction: Prisma.TransactionClient,
  positionId: string,
  employeeIds: string[],
  jobTitle: string,
  department: string,
  userId?: string
) {
  await transaction.employee.updateMany({
    where: {
      positionId,
      ...(employeeIds.length > 0 ? { id: { notIn: employeeIds } } : {}),
    },
    data: {
      positionId: null,
      updatedBy: userId ?? null,
    },
  });

  if (employeeIds.length === 0) {
    return;
  }

  await transaction.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: {
      positionId,
      jobTitle,
      department,
      updatedBy: userId ?? null,
    },
  });
}

async function syncEmployeesForPositionMetadata(
  transaction: Prisma.TransactionClient,
  positionId: string,
  jobTitle: string,
  department: string,
  userId?: string
) {
  await transaction.employee.updateMany({
    where: {
      positionId,
      status: { not: TERMINATED_EMPLOYEE_STATUS },
    },
    data: {
      jobTitle,
      department,
      updatedBy: userId ?? null,
    },
  });
}

async function syncEmployeesForOrgUnitName(
  transaction: Prisma.TransactionClient,
  orgUnitId: string,
  department: string,
  userId?: string
) {
  const positions = await transaction.position.findMany({
    where: { orgUnitId },
    select: { id: true },
  });

  if (positions.length === 0) {
    return;
  }

  await transaction.employee.updateMany({
    where: {
      positionId: { in: positions.map((position) => position.id) },
      status: { not: TERMINATED_EMPLOYEE_STATUS },
    },
    data: {
      department,
      updatedBy: userId ?? null,
    },
  });
}

export async function getOrganizationSnapshot() {
  const [orgUnits, positions, classifications] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { recordStatus: ACTIVE_RECORD_STATUS },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        positions: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          orderBy: [{ title: 'asc' }],
          select: {
            id: true,
            positionCode: true,
            title: true,
            positionStatus: true,
            headcount: true,
            recordStatus: true,
            archivedAt: true,
            archivedBy: true,
            archiveReason: true,
            createdAt: true,
            updatedAt: true,
            orgUnit: {
              select: { id: true, code: true, name: true, type: true, recordStatus: true },
            },
            classification: {
              select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
            },
            level: {
              select: {
                id: true,
                classificationId: true,
                levelCode: true,
                currency: true,
                rangeMin: true,
                rangeMid: true,
                rangeMax: true,
                recordStatus: true,
              },
            },
            reportsToPosition: {
              select: { id: true, positionCode: true, title: true, recordStatus: true },
            },
            directReports: {
              where: { recordStatus: ACTIVE_RECORD_STATUS },
              select: { id: true },
            },
            employees: {
              where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
              orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
              select: {
                id: true,
                employeeNumber: true,
                firstName: true,
                lastName: true,
                status: true,
                jobTitle: true,
                department: true,
                positionId: true,
              },
            },
          },
        },
      },
    }),
    prisma.position.findMany({
      where: { recordStatus: ACTIVE_RECORD_STATUS },
      orderBy: [{ orgUnit: { name: 'asc' } }, { title: 'asc' }],
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    }),
    prisma.jobClassification.findMany({
      where: { recordStatus: ACTIVE_RECORD_STATUS },
      orderBy: [{ family: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        code: true,
        title: true,
        occupationCode: true,
        annualHours: true,
        family: true,
        description: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        levels: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          orderBy: [{ levelCode: 'asc' }],
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
            archivedAt: true,
            archivedBy: true,
            archiveReason: true,
            createdAt: true,
            updatedAt: true,
            positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
          },
        },
      },
    }),
  ]);

  const serializedPositions = positions.map(serializePosition);

  return {
    metrics: {
      orgUnitCount: orgUnits.length,
      positionCount: serializedPositions.length,
      filledPositionCount: serializedPositions.filter((position) => position.incumbents.length > 0).length,
      openSeatCount: serializedPositions.reduce((total, position) => total + position.vacancyCount, 0),
      classificationCount: classifications.length,
    },
    orgUnits: buildOrgTree(orgUnits),
    positions: serializedPositions,
    classifications: classifications.map(serializeClassification),
  };
}

export async function listOrgUnits(query: ListOrgUnitsQuery) {
  const search = query.search?.trim();
  const where: Prisma.OrgUnitWhereInput = {
    ...buildRecordStatusWhere(query),
  };

  if (query.parentId) {
    where.parentId = query.parentId;
  }

  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { type: { contains: search } },
    ];
  }

  const orgUnits = await prisma.orgUnit.findMany({
    where,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      parent: {
        select: { id: true, code: true, name: true, recordStatus: true },
      },
      children: {
        where: { recordStatus: ACTIVE_RECORD_STATUS },
        select: { id: true },
      },
      positions: {
        where: { recordStatus: ACTIVE_RECORD_STATUS },
        select: {
          id: true,
          employees: {
            where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
            select: { id: true },
          },
        },
      },
    },
  });

  return orgUnits.map(serializeOrgUnit);
}

export async function createOrgUnit(data: CreateOrgUnitInput) {
  const orgUnit = await prisma.$transaction(async (transaction) => {
    await ensureOrgUnitParentIsValid(transaction, data.parentId ?? null);

    return transaction.orgUnit.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: data.parentId ?? null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: { id: true, code: true, name: true, recordStatus: true },
        },
        children: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        positions: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: {
            id: true,
            employees: {
              where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
              select: { id: true },
            },
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeOrgUnit(orgUnit);
}

export async function updateOrgUnit(orgUnitId: string, data: UpdateOrgUnitInput, userId?: string) {
  const orgUnit = await prisma.$transaction(async (transaction) => {
    const existingOrgUnit = await getOrgUnitForValidation(transaction, orgUnitId);

    if (existingOrgUnit.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Archived org units must be restored before they can be edited.');
    }

    await ensureOrgUnitParentIsValid(transaction, data.parentId ?? null, orgUnitId);

    const updatedOrgUnit = await transaction.orgUnit.update({
      where: { id: orgUnitId },
      data: {
        name: data.name,
        type: data.type,
        parentId: data.parentId ?? null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: { id: true, code: true, name: true, recordStatus: true },
        },
        children: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        positions: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: {
            id: true,
            employees: {
              where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
              select: { id: true },
            },
          },
        },
      },
    });

    if (existingOrgUnit.name !== data.name) {
      await syncEmployeesForOrgUnitName(transaction, orgUnitId, data.name, userId);
    }

    return updatedOrgUnit;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeOrgUnit(orgUnit);
}

export async function archiveOrgUnit(orgUnitId: string, data: ArchiveRecordInput, userId?: string) {
  const orgUnit = await prisma.$transaction(async (transaction) => {
    const existingOrgUnit = await getOrgUnitForValidation(transaction, orgUnitId);

    if (existingOrgUnit.recordStatus === ARCHIVED_RECORD_STATUS) {
      throw createHttpError(409, 'This org unit is already archived.');
    }

    const [activeChildren, activePositions] = await Promise.all([
      transaction.orgUnit.count({
        where: { parentId: orgUnitId, recordStatus: ACTIVE_RECORD_STATUS },
      }),
      transaction.position.count({
        where: { orgUnitId, recordStatus: ACTIVE_RECORD_STATUS },
      }),
    ]);

    if (activeChildren > 0) {
      throw createHttpError(409, 'Archive blocked: this org unit still has active child org units.');
    }

    if (activePositions > 0) {
      throw createHttpError(409, 'Archive blocked: this org unit still has active positions assigned to it.');
    }

    return transaction.orgUnit.update({
      where: { id: orgUnitId },
      data: {
        recordStatus: ARCHIVED_RECORD_STATUS,
        archivedAt: new Date(),
        archivedBy: userId ?? null,
        archiveReason: data.archiveReason?.trim() || null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: { id: true, code: true, name: true, recordStatus: true },
        },
        children: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        positions: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: {
            id: true,
            employees: {
              where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
              select: { id: true },
            },
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeOrgUnit(orgUnit);
}

export async function restoreOrgUnit(orgUnitId: string) {
  const orgUnit = await prisma.$transaction(async (transaction) => {
    const existingOrgUnit = await getOrgUnitForValidation(transaction, orgUnitId);

    if (existingOrgUnit.recordStatus === ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'This org unit is already active.');
    }

    if (existingOrgUnit.parentId) {
      const parent = await getOrgUnitForValidation(transaction, existingOrgUnit.parentId);
      if (parent.recordStatus !== ACTIVE_RECORD_STATUS) {
        throw createHttpError(409, 'Restore blocked: parent org unit is archived.');
      }
    }

    return transaction.orgUnit.update({
      where: { id: orgUnitId },
      data: {
        recordStatus: ACTIVE_RECORD_STATUS,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        parent: {
          select: { id: true, code: true, name: true, recordStatus: true },
        },
        children: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        positions: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: {
            id: true,
            employees: {
              where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
              select: { id: true },
            },
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeOrgUnit(orgUnit);
}

export async function listPositions(query: ListPositionsQuery) {
  const search = query.search?.trim();
  const where: Prisma.PositionWhereInput = {
    ...buildRecordStatusWhere(query),
  };

  if (query.orgUnitId) {
    where.orgUnitId = query.orgUnitId;
  }

  if (query.classificationId) {
    where.classificationId = query.classificationId;
  }

  if (query.levelId) {
    where.levelId = query.levelId;
  }

  if (query.reportsToPositionId) {
    where.reportsToPositionId = query.reportsToPositionId;
  }

  if (query.positionStatus) {
    where.positionStatus = query.positionStatus;
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { positionCode: { contains: search } },
      { orgUnit: { is: { name: { contains: search } } } },
      { classification: { is: { title: { contains: search } } } },
      { classification: { is: { occupationCode: { contains: search } } } },
      { level: { is: { levelCode: { contains: search } } } },
    ];
  }

  const positions = await prisma.position.findMany({
    where,
    orderBy: [{ orgUnit: { name: 'asc' } }, { title: 'asc' }],
    select: {
      id: true,
      positionCode: true,
      title: true,
      positionStatus: true,
      headcount: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      orgUnit: {
        select: { id: true, code: true, name: true, type: true, recordStatus: true },
      },
      classification: {
        select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
      },
      level: {
        select: {
          id: true,
          classificationId: true,
          levelCode: true,
          currency: true,
          rangeMin: true,
          rangeMid: true,
          rangeMax: true,
          recordStatus: true,
        },
      },
      reportsToPosition: {
        select: { id: true, positionCode: true, title: true, recordStatus: true },
      },
      directReports: {
        where: { recordStatus: ACTIVE_RECORD_STATUS },
        select: { id: true },
      },
      employees: {
        where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          jobTitle: true,
          department: true,
          positionId: true,
        },
      },
    },
  });

  return positions.map(serializePosition);
}

export async function createPosition(data: CreatePositionInput, userId?: string) {
  const position = await prisma.$transaction(async (transaction) => {
    const incumbentEmployeeIds = await validateIncumbentAssignments(
      transaction,
      data.incumbentEmployeeIds,
      data.headcount
    );
    const { orgUnit } = await validatePositionDependencies(transaction, data);

    const createdPosition = await transaction.position.create({
      data: {
        positionCode: data.positionCode,
        title: data.title,
        orgUnitId: data.orgUnitId,
        classificationId: data.classificationId,
        levelId: data.levelId,
        reportsToPositionId: data.reportsToPositionId ?? null,
        headcount: data.headcount,
        positionStatus: normalizePositionStatus(data.positionStatus, incumbentEmployeeIds.length),
      },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });

    await syncPositionAssignments(
      transaction,
      createdPosition.id,
      incumbentEmployeeIds,
      createdPosition.title,
      orgUnit.name,
      userId
    );

    return transaction.position.findUniqueOrThrow({
      where: { id: createdPosition.id },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializePosition(position);
}

export async function updatePosition(positionId: string, data: UpdatePositionInput, userId?: string) {
  const position = await prisma.$transaction(async (transaction) => {
    const existingPosition = await getPositionForValidation(transaction, positionId);

    if (existingPosition.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Archived positions must be restored before they can be edited.');
    }

    const incumbentEmployeeIds = await validateIncumbentAssignments(
      transaction,
      data.incumbentEmployeeIds,
      data.headcount
    );
    const { orgUnit } = await validatePositionDependencies(transaction, data, positionId);

    const updatedPosition = await transaction.position.update({
      where: { id: positionId },
      data: {
        title: data.title,
        orgUnitId: data.orgUnitId,
        classificationId: data.classificationId,
        levelId: data.levelId,
        reportsToPositionId: data.reportsToPositionId ?? null,
        headcount: data.headcount,
        positionStatus: normalizePositionStatus(data.positionStatus, incumbentEmployeeIds.length),
      },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });

    await syncPositionAssignments(
      transaction,
      positionId,
      incumbentEmployeeIds,
      updatedPosition.title,
      orgUnit.name,
      userId
    );

    await syncEmployeesForPositionMetadata(
      transaction,
      positionId,
      updatedPosition.title,
      orgUnit.name,
      userId
    );

    return transaction.position.findUniqueOrThrow({
      where: { id: positionId },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializePosition(position);
}

export async function archivePosition(positionId: string, data: ArchiveRecordInput, userId?: string) {
  const position = await prisma.$transaction(async (transaction) => {
    const existingPosition = await getPositionForValidation(transaction, positionId);

    if (existingPosition.recordStatus === ARCHIVED_RECORD_STATUS) {
      throw createHttpError(409, 'This position is already archived.');
    }

    const [incumbents, activeDirectReports] = await Promise.all([
      transaction.employee.count({
        where: {
          positionId,
          status: { not: TERMINATED_EMPLOYEE_STATUS },
        },
      }),
      transaction.position.count({
        where: {
          reportsToPositionId: positionId,
          recordStatus: ACTIVE_RECORD_STATUS,
        },
      }),
    ]);

    if (incumbents > 0) {
      throw createHttpError(409, 'Archive blocked: this position still has active incumbents assigned.');
    }

    if (activeDirectReports > 0) {
      throw createHttpError(409, 'Archive blocked: active child positions still report to this position.');
    }

    return transaction.position.update({
      where: { id: positionId },
      data: {
        recordStatus: ARCHIVED_RECORD_STATUS,
        archivedAt: new Date(),
        archivedBy: userId ?? null,
        archiveReason: data.archiveReason?.trim() || null,
      },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializePosition(position);
}

export async function restorePosition(positionId: string) {
  const position = await prisma.$transaction(async (transaction) => {
    const existingPosition = await getPositionForValidation(transaction, positionId);

    if (existingPosition.recordStatus === ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'This position is already active.');
    }

    await validatePositionDependencies(transaction, {
      orgUnitId: existingPosition.orgUnitId,
      classificationId: existingPosition.classificationId,
      levelId: existingPosition.levelId,
      reportsToPositionId: existingPosition.reportsToPositionId ?? null,
    }, positionId);

    return transaction.position.update({
      where: { id: positionId },
      data: {
        recordStatus: ACTIVE_RECORD_STATUS,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      select: {
        id: true,
        positionCode: true,
        title: true,
        positionStatus: true,
        headcount: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: { id: true, code: true, name: true, type: true, recordStatus: true },
        },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, family: true, recordStatus: true },
        },
        level: {
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
          },
        },
        reportsToPosition: {
          select: { id: true, positionCode: true, title: true, recordStatus: true },
        },
        directReports: {
          where: { recordStatus: ACTIVE_RECORD_STATUS },
          select: { id: true },
        },
        employees: {
          where: { status: { not: TERMINATED_EMPLOYEE_STATUS } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            jobTitle: true,
            department: true,
            positionId: true,
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializePosition(position);
}

export async function listClassifications(query: OrganizationListQuery) {
  const search = query.search?.trim();
  const where: Prisma.JobClassificationWhereInput = {
    ...buildRecordStatusWhere(query),
  };

  if (search) {
    where.OR = [
      { code: { contains: search } },
      { title: { contains: search } },
      { occupationCode: { contains: search } },
      { family: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const classifications = await prisma.jobClassification.findMany({
    where,
    orderBy: [{ family: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      code: true,
      title: true,
      occupationCode: true,
      annualHours: true,
      family: true,
      description: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
      levels: {
        where: buildRecordStatusWhere(query),
        orderBy: [{ levelCode: 'asc' }],
        select: {
          id: true,
          classificationId: true,
          levelCode: true,
          currency: true,
          rangeMin: true,
          rangeMid: true,
          rangeMax: true,
          recordStatus: true,
          archivedAt: true,
          archivedBy: true,
          archiveReason: true,
          createdAt: true,
          updatedAt: true,
          positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        },
      },
    },
  });

  return classifications.map(serializeClassification);
}

export async function createClassification(data: CreateClassificationInput) {
  const classification = await prisma.jobClassification.create({
    data: {
      code: data.code,
      title: data.title,
      occupationCode: data.occupationCode,
      annualHours: data.annualHours,
      family: data.family?.trim() || null,
      description: data.description?.trim() || null,
    },
    select: {
      id: true,
      code: true,
      title: true,
      occupationCode: true,
      annualHours: true,
      family: true,
      description: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
      levels: {
        where: { recordStatus: ACTIVE_RECORD_STATUS },
        orderBy: [{ levelCode: 'asc' }],
        select: {
          id: true,
          classificationId: true,
          levelCode: true,
          currency: true,
          rangeMin: true,
          rangeMid: true,
          rangeMax: true,
          recordStatus: true,
          archivedAt: true,
          archivedBy: true,
          archiveReason: true,
          createdAt: true,
          updatedAt: true,
          positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        },
      },
    },
  });

  return serializeClassification(classification);
}

export async function updateClassification(classificationId: string, data: UpdateClassificationInput) {
  const existingClassification = await prisma.jobClassification.findUnique({
    where: { id: classificationId },
    select: { id: true, recordStatus: true },
  });

  if (!existingClassification) {
    throw createHttpError(404, 'Classification not found.');
  }

  if (existingClassification.recordStatus !== ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'Archived classifications must be restored before they can be edited.');
  }

  const classification = await prisma.jobClassification.update({
    where: { id: classificationId },
    data: {
      title: data.title,
      occupationCode: data.occupationCode,
      annualHours: data.annualHours,
      family: data.family?.trim() || null,
      description: data.description?.trim() || null,
    },
    select: {
      id: true,
      code: true,
      title: true,
      occupationCode: true,
      annualHours: true,
      family: true,
      description: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
      levels: {
        where: { recordStatus: ACTIVE_RECORD_STATUS },
        orderBy: [{ levelCode: 'asc' }],
        select: {
          id: true,
          classificationId: true,
          levelCode: true,
          currency: true,
          rangeMin: true,
          rangeMid: true,
          rangeMax: true,
          recordStatus: true,
          archivedAt: true,
          archivedBy: true,
          archiveReason: true,
          createdAt: true,
          updatedAt: true,
          positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        },
      },
    },
  });

  return serializeClassification(classification);
}

export async function archiveClassification(classificationId: string, data: ArchiveRecordInput, userId?: string) {
  const classification = await prisma.$transaction(async (transaction) => {
    const existingClassification = await getClassificationForValidation(transaction, classificationId);

    if (existingClassification.recordStatus === ARCHIVED_RECORD_STATUS) {
      throw createHttpError(409, 'This classification is already archived.');
    }

    const [activePositions, activeLevels] = await Promise.all([
      transaction.position.count({
        where: { classificationId, recordStatus: ACTIVE_RECORD_STATUS },
      }),
      transaction.positionLevel.count({
        where: { classificationId, recordStatus: ACTIVE_RECORD_STATUS },
      }),
    ]);

    if (activePositions > 0) {
      throw createHttpError(409, 'Archive blocked: active positions still reference this classification.');
    }

    if (activeLevels > 0) {
      throw createHttpError(409, 'Archive blocked: active levels still exist under this classification.');
    }

    return transaction.jobClassification.update({
      where: { id: classificationId },
      data: {
        recordStatus: ARCHIVED_RECORD_STATUS,
        archivedAt: new Date(),
        archivedBy: userId ?? null,
        archiveReason: data.archiveReason?.trim() || null,
      },
      select: {
        id: true,
        code: true,
        title: true,
        occupationCode: true,
        annualHours: true,
        family: true,
        description: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        levels: {
          where: {},
          orderBy: [{ levelCode: 'asc' }],
          select: {
            id: true,
            classificationId: true,
            levelCode: true,
            currency: true,
            rangeMin: true,
            rangeMid: true,
            rangeMax: true,
            recordStatus: true,
            archivedAt: true,
            archivedBy: true,
            archiveReason: true,
            createdAt: true,
            updatedAt: true,
            positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
          },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeClassification(classification);
}

export async function restoreClassification(classificationId: string) {
  const existingClassification = await prisma.jobClassification.findUnique({
    where: { id: classificationId },
    select: { id: true, recordStatus: true },
  });

  if (!existingClassification) {
    throw createHttpError(404, 'Classification not found.');
  }

  if (existingClassification.recordStatus === ACTIVE_RECORD_STATUS) {
    throw createHttpError(409, 'This classification is already active.');
  }

  const classification = await prisma.jobClassification.update({
    where: { id: classificationId },
    data: {
      recordStatus: ACTIVE_RECORD_STATUS,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    },
    select: {
      id: true,
      code: true,
      title: true,
      occupationCode: true,
      annualHours: true,
      family: true,
      description: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
      levels: {
        where: {},
        orderBy: [{ levelCode: 'asc' }],
        select: {
          id: true,
          classificationId: true,
          levelCode: true,
          currency: true,
          rangeMin: true,
          rangeMid: true,
          rangeMax: true,
          recordStatus: true,
          archivedAt: true,
          archivedBy: true,
          archiveReason: true,
          createdAt: true,
          updatedAt: true,
          positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        },
      },
    },
  });

  return serializeClassification(classification);
}

export async function listLevels(query: ListLevelsQuery) {
  const search = query.search?.trim();
  const where: Prisma.PositionLevelWhereInput = {
    ...buildRecordStatusWhere(query),
  };

  if (query.classificationId) {
    where.classificationId = query.classificationId;
  }

  if (search) {
    where.OR = [
      { levelCode: { contains: search } },
      { classification: { is: { code: { contains: search } } } },
      { classification: { is: { title: { contains: search } } } },
      { classification: { is: { occupationCode: { contains: search } } } },
    ];
  }

  const levels = await prisma.positionLevel.findMany({
    where,
    orderBy: [{ classification: { title: 'asc' } }, { levelCode: 'asc' }],
    select: {
      id: true,
      classificationId: true,
      levelCode: true,
      currency: true,
      rangeMin: true,
      rangeMid: true,
      rangeMax: true,
      recordStatus: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true,
      createdAt: true,
      updatedAt: true,
      positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
      classification: {
        select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, recordStatus: true },
      },
    },
  });

  return levels.map(serializeLevel);
}

export async function createLevel(data: CreateLevelInput) {
  const level = await prisma.$transaction(async (transaction) => {
    const classification = await getClassificationForValidation(transaction, data.classificationId);

    if (classification.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Archived classifications cannot accept new levels.');
    }

    return transaction.positionLevel.create({
      data: {
        classificationId: data.classificationId,
        levelCode: data.levelCode,
        currency: data.currency,
        rangeMin: new Prisma.Decimal(data.rangeMin),
        rangeMid: new Prisma.Decimal(data.rangeMid),
        rangeMax: new Prisma.Decimal(data.rangeMax),
      },
      select: {
        id: true,
        classificationId: true,
        levelCode: true,
        currency: true,
        rangeMin: true,
        rangeMid: true,
        rangeMax: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, recordStatus: true },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLevel(level);
}

export async function updateLevel(levelId: string, data: UpdateLevelInput) {
  const level = await prisma.$transaction(async (transaction) => {
    const existingLevel = await getLevelForValidation(transaction, levelId);

    if (existingLevel.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Archived levels must be restored before they can be edited.');
    }

    const classification = await getClassificationForValidation(transaction, existingLevel.classificationId);
    if (classification.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Restore the parent classification before editing this level.');
    }

    return transaction.positionLevel.update({
      where: { id: levelId },
      data: {
        currency: data.currency,
        rangeMin: new Prisma.Decimal(data.rangeMin),
        rangeMid: new Prisma.Decimal(data.rangeMid),
        rangeMax: new Prisma.Decimal(data.rangeMax),
      },
      select: {
        id: true,
        classificationId: true,
        levelCode: true,
        currency: true,
        rangeMin: true,
        rangeMid: true,
        rangeMax: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, recordStatus: true },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLevel(level);
}

export async function archiveLevel(levelId: string, data: ArchiveRecordInput, userId?: string) {
  const level = await prisma.$transaction(async (transaction) => {
    const existingLevel = await getLevelForValidation(transaction, levelId);

    if (existingLevel.recordStatus === ARCHIVED_RECORD_STATUS) {
      throw createHttpError(409, 'This classification level is already archived.');
    }

    const activePositions = await transaction.position.count({
      where: { levelId, recordStatus: ACTIVE_RECORD_STATUS },
    });

    if (activePositions > 0) {
      throw createHttpError(409, 'Archive blocked: active positions still reference this classification level.');
    }

    return transaction.positionLevel.update({
      where: { id: levelId },
      data: {
        recordStatus: ARCHIVED_RECORD_STATUS,
        archivedAt: new Date(),
        archivedBy: userId ?? null,
        archiveReason: data.archiveReason?.trim() || null,
      },
      select: {
        id: true,
        classificationId: true,
        levelCode: true,
        currency: true,
        rangeMin: true,
        rangeMid: true,
        rangeMax: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, recordStatus: true },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLevel(level);
}

export async function restoreLevel(levelId: string) {
  const level = await prisma.$transaction(async (transaction) => {
    const existingLevel = await getLevelForValidation(transaction, levelId);

    if (existingLevel.recordStatus === ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'This classification level is already active.');
    }

    const classification = await getClassificationForValidation(transaction, existingLevel.classificationId);
    if (classification.recordStatus !== ACTIVE_RECORD_STATUS) {
      throw createHttpError(409, 'Restore blocked: parent classification is archived.');
    }

    return transaction.positionLevel.update({
      where: { id: levelId },
      data: {
        recordStatus: ACTIVE_RECORD_STATUS,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      select: {
        id: true,
        classificationId: true,
        levelCode: true,
        currency: true,
        rangeMin: true,
        rangeMid: true,
        rangeMax: true,
        recordStatus: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
        positions: { where: { recordStatus: ACTIVE_RECORD_STATUS }, select: { id: true } },
        classification: {
          select: { id: true, code: true, title: true, occupationCode: true, annualHours: true, recordStatus: true },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return serializeLevel(level);
}

export async function listEmployeeOptions(query: ListEmployeeOptionsQuery) {
  const search = query.search?.trim();
  const where: Prisma.EmployeeWhereInput = {
    status: { not: TERMINATED_EMPLOYEE_STATUS },
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { employeeNumber: { contains: search } },
      { email: { contains: search } },
      { jobTitle: { contains: search } },
    ];
  }

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      jobTitle: true,
      department: true,
      positionId: true,
      position: {
        select: { id: true, positionCode: true, title: true, recordStatus: true },
      },
    },
  });

  return employees.map(serializeEmployeeOption);
}
