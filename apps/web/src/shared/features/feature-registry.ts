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

export function getDefaultFeatureStateRecord() {
  return Object.fromEntries(
    featureRegistry.map((feature) => [feature.key, {
      ...feature,
      enabled: feature.defaultEnabled,
      updatedAt: null,
      updatedByAccount: null,
    }]),
  ) as FeatureStateRecord;
}

export function normalizeFeatureStateRecord(features: Partial<Record<FeatureKey, Partial<FeatureState>>> | null | undefined) {
  const defaults = getDefaultFeatureStateRecord();

  return Object.fromEntries(
    FEATURE_KEY_VALUES.map((featureKey) => {
      const defaultState = defaults[featureKey];
      const rawState = features?.[featureKey];

      return [featureKey, {
        ...defaultState,
        ...(rawState ?? {}),
        key: featureKey,
      }];
    }),
  ) as FeatureStateRecord;
}

export function isFeatureEnabled(featureStates: FeatureStateRecord | null | undefined, featureKey: FeatureKey) {
  return featureStates?.[featureKey]?.enabled ?? featureDefinitionMap.get(featureKey)?.defaultEnabled ?? false;
}
