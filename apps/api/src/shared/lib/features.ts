import { Prisma } from '../../generated/prisma';
import { prisma } from './prisma';
import { toIsoString } from './service-utils';

export const FEATURE_KEY_VALUES = [
  'recruitment_management',
  'learning_management',
  'learning_self_service',
  'planning_management',
  'planning_self_service',
  'time_attendance_self_service',
  'time_attendance_management',
  'time_off_requests',
] as const;

export type FeatureKey = typeof FEATURE_KEY_VALUES[number];
export type FeatureType = 'workspace' | 'subfeature';

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  featureType: FeatureType;
  defaultEnabled: boolean;
  impacts: string[];
  routes: string[];
}

export interface FeatureState extends FeatureDefinition {
  enabled: boolean;
  updatedAt: string | null;
  updatedByAccount: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

export type FeatureStateRecord = Record<FeatureKey, FeatureState>;

export const featureRegistry: readonly FeatureDefinition[] = [
  {
    key: 'recruitment_management',
    label: 'Recruitment',
    description: 'Position requests, approval routing, hiring close-out, and request lifecycle oversight.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects recruitment APIs'],
    routes: ['/recruitment'],
  },
  {
    key: 'learning_management',
    label: 'Learning Management',
    description: 'Provider-backed learning administration, assignments, paths, and compliance oversight.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects management APIs'],
    routes: ['/learning'],
  },
  {
    key: 'learning_self_service',
    label: 'My Learning',
    description: 'Employee self-service learning workspace, launches, transcript, and certificate visibility.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects self-service APIs'],
    routes: ['/my-learning'],
  },
  {
    key: 'planning_management',
    label: 'Planning for Success',
    description: 'Manager and HR planning workspace for cycles, team reviews, and goals.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects management APIs'],
    routes: ['/performance'],
  },
  {
    key: 'planning_self_service',
    label: 'My Planning for Success',
    description: 'Employee self-service performance workspace for self-reviews, acknowledgments, and goal updates.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects self-service APIs'],
    routes: ['/my-performance'],
  },
  {
    key: 'time_attendance_self_service',
    label: 'Time & Attendance',
    description: 'Employee self-service workspace for schedules, time cards, leave visibility, and time history.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects self-service APIs'],
    routes: ['/time-attendance'],
  },
  {
    key: 'time_attendance_management',
    label: 'Workforce Time',
    description: 'Manager and HR workspace for schedules, time-card approvals, exceptions, and work rule administration.',
    featureType: 'workspace',
    defaultEnabled: true,
    impacts: ['Affects menu', 'Affects route', 'Affects management APIs'],
    routes: ['/workforce-time'],
  },
  {
    key: 'time_off_requests',
    label: 'Time Off Requests',
    description: 'Time off request submission, editing, cancellation, and approval workflow actions.',
    featureType: 'subfeature',
    defaultEnabled: true,
    impacts: ['Affects actions', 'Affects request APIs', 'Affects inbox and reporting'],
    routes: ['/time-off'],
  },
] as const;

const featureDefinitionMap = new Map(featureRegistry.map((feature) => [feature.key, feature]));

export const routeFeatureMap: Partial<Record<string, FeatureKey>> = {
  '/recruitment': 'recruitment_management',
  '/learning': 'learning_management',
  '/my-learning': 'learning_self_service',
  '/performance': 'planning_management',
  '/my-performance': 'planning_self_service',
  '/time-attendance': 'time_attendance_self_service',
  '/workforce-time': 'time_attendance_management',
};

export const taskTypeFeatureMap: Partial<Record<string, FeatureKey>> = {
  JobRequestApproval: 'recruitment_management',
  JobRequestRework: 'recruitment_management',
  HiringCloseout: 'recruitment_management',
  LeaveApproval: 'time_off_requests',
  PerformanceManagerReview: 'planning_management',
  PerformanceSelfReview: 'planning_self_service',
  PerformanceAcknowledgment: 'planning_self_service',
  LearningDue: 'learning_self_service',
  LearningRenewal: 'learning_self_service',
  TimeCardApproval: 'time_attendance_management',
  TimeCardCorrection: 'time_attendance_self_service',
  OvertimeReview: 'time_attendance_management',
};

type FeaturePersistenceClient = typeof prisma | Prisma.TransactionClient;

export function getFeatureDefinition(key: FeatureKey) {
  return featureDefinitionMap.get(key) ?? null;
}

export function isFeatureEnabled(featureStates: FeatureStateRecord, key: FeatureKey) {
  return featureStates[key]?.enabled ?? getFeatureDefinition(key)?.defaultEnabled ?? false;
}

export function filterRoutesByFeature(routes: string[], featureStates: FeatureStateRecord) {
  return routes.filter((route) => {
    const featureKey = routeFeatureMap[route];
    return featureKey ? isFeatureEnabled(featureStates, featureKey) : true;
  });
}

function createDefaultFeatureState(definition: FeatureDefinition): FeatureState {
  return {
    ...definition,
    enabled: definition.defaultEnabled,
    updatedAt: null,
    updatedByAccount: null,
  };
}

export async function listFeatureStates(client: FeaturePersistenceClient = prisma) {
  const overrides = await client.featureToggle.findMany({
    include: {
      updatedByAccount: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  const overrideMap = new Map(overrides.map((override) => [override.key, override]));

  return featureRegistry.map((definition) => {
    const override = overrideMap.get(definition.key);

    if (!override) {
      return createDefaultFeatureState(definition);
    }

    return {
      ...definition,
      enabled: override.enabled,
      updatedAt: toIsoString(override.updatedAt),
      updatedByAccount: override.updatedByAccount
        ? {
          id: override.updatedByAccount.id,
          displayName: override.updatedByAccount.displayName,
          email: override.updatedByAccount.email,
        }
        : null,
    } satisfies FeatureState;
  });
}

export async function getFeatureStateRecord(client: FeaturePersistenceClient = prisma) {
  const featureStates = await listFeatureStates(client);

  return Object.fromEntries(
    featureStates.map((featureState) => [featureState.key, featureState]),
  ) as FeatureStateRecord;
}

export function getFeatureStateRecordFromList(featureStates: FeatureState[]) {
  return Object.fromEntries(
    featureStates.map((featureState) => [featureState.key, featureState]),
  ) as FeatureStateRecord;
}
