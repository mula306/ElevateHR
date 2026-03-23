import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileJson,
  LoaderCircle,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { listOrgUnits, type OrgUnitRecord } from '@/pages/organization/organization.api';
import { Drawer, SurfaceField as DrawerField } from '@/shared/ui/primitives';
import {
  createEmptyDynamicField,
  dynamicFieldTypeOptions,
  slugifyDynamicFieldKey,
  validateDynamicFieldSchema,
} from '@/pages/recruitment/dynamic-fields';
import type {
  ApprovalRuleSetPayload,
  ApprovalRuleSetRecord,
  DynamicFieldDefinition,
  FundingTypeRecord,
  RequestTypeRecord,
} from '@/pages/recruitment/recruitment.api';
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
} from './settings.api';

type RecruitmentConfigTab = 'request-types' | 'funding-types' | 'rule-sets';
type EditorState =
  | null
  | { type: 'request-type'; id: string | null }
  | { type: 'funding-type'; id: string | null }
  | { type: 'rule-set'; id: string | null };

interface RequestTypeFormState {
  code: string;
  name: string;
  description: string;
  fieldSchema: DynamicFieldDefinition[];
  isActive: boolean;
}

interface FundingTypeFormState {
  code: string;
  name: string;
  category: string;
  description: string;
  durationType: string;
  isPermanent: boolean;
  isActive: boolean;
}

type RuleBuilderState = ApprovalRuleSetPayload['rules'][number];

interface RuleSetFormState {
  name: string;
  description: string;
  status: 'Draft' | 'Active' | 'Archived';
  version: string;
  scopeOrgUnitId: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  rules: RuleBuilderState[];
}

interface SimulationFormState {
  requestTypeId: string;
  budgetImpacting: boolean;
  fundingTypeId: string;
  orgUnitId: string;
  requestorRole: string;
}

const queueOptions = [
  { value: 'HR_OPERATIONS', label: 'HR Operations' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HRBP', label: 'HR Business Partner' },
  { value: 'IT', label: 'IT' },
  { value: 'ADMIN_REVIEW', label: 'Admin Review' },
];

const emptyRequestType: RequestTypeFormState = {
  code: '',
  name: '',
  description: '',
  fieldSchema: [],
  isActive: true,
};

const emptyFundingType: FundingTypeFormState = {
  code: '',
  name: '',
  category: '',
  description: '',
  durationType: '',
  isPermanent: false,
  isActive: true,
};

function createEmptyRuleStep(stepOrder: number): RuleBuilderState['steps'][number] {
  return {
    stepOrder,
    label: `Step ${stepOrder}`,
    assigneeSource: 'Queue',
    assigneeValue: 'HR_OPERATIONS',
    fallbackQueueKey: null,
    escalationDays: null,
    dueDays: null,
  };
}

function createEmptyRule(index: number): RuleBuilderState {
  return {
    name: `Rule ${index + 1}`,
    priority: Math.max(100 - index, 1),
    isActive: true,
    isFallback: false,
    requestTypeId: null,
    fundingTypeId: null,
    budgetImpacting: null,
    requestorRole: null,
    orgUnitId: null,
    conditions: null,
    steps: [createEmptyRuleStep(1)],
  };
}

const emptyRuleSet: RuleSetFormState = {
  name: '',
  description: '',
  status: 'Draft',
  version: '1',
  scopeOrgUnitId: '',
  effectiveStartDate: '',
  effectiveEndDate: '',
  rules: [createEmptyRule(0)],
};

const emptySimulationForm: SimulationFormState = {
  requestTypeId: '',
  budgetImpacting: false,
  fundingTypeId: '',
  orgUnitId: '',
  requestorRole: '',
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not changed yet';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [currentItem] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, currentItem);
  return nextItems;
}

function normalizeDynamicField(field: DynamicFieldDefinition): DynamicFieldDefinition {
  const nextField: DynamicFieldDefinition = {
    key: field.key.trim(),
    label: field.label.trim(),
    type: field.type,
    required: Boolean(field.required),
  };

  if (field.type === 'select') {
    nextField.options = (field.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean);
  }

  return nextField;
}

function parseDynamicFieldArrayJson(raw: string) {
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Field schema JSON must be an array.');
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`Field ${index + 1} must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const type = typeof record.type === 'string' && dynamicFieldTypeOptions.some((option) => option.value === record.type)
      ? record.type as DynamicFieldDefinition['type']
      : 'text';

    return normalizeDynamicField({
      key: String(record.key ?? ''),
      label: String(record.label ?? ''),
      type,
      required: Boolean(record.required),
      options: Array.isArray(record.options) ? record.options.map((option) => String(option)) : undefined,
    });
  });
}

function normalizeRuleStep(step: Partial<RuleBuilderState['steps'][number]>, index: number): RuleBuilderState['steps'][number] {
  const assigneeSource = step.assigneeSource ?? 'Queue';
  const assigneeValue = assigneeSource === 'Queue'
    ? (step.assigneeValue ?? 'HR_OPERATIONS')
    : (step.assigneeValue ?? null);

  return {
    id: step.id,
    stepOrder: index + 1,
    label: step.label?.trim() || `Step ${index + 1}`,
    assigneeSource,
    assigneeValue,
    fallbackQueueKey: step.fallbackQueueKey ?? null,
    escalationDays: step.escalationDays ?? null,
    dueDays: step.dueDays ?? null,
  };
}

function normalizeRule(rule: Partial<RuleBuilderState>, index: number): RuleBuilderState {
  return {
    id: rule.id,
    name: rule.name?.trim() || `Rule ${index + 1}`,
    priority: typeof rule.priority === 'number' && Number.isFinite(rule.priority) ? rule.priority : Math.max(100 - index, 1),
    isActive: rule.isActive ?? true,
    isFallback: rule.isFallback ?? false,
    requestTypeId: rule.requestTypeId ?? null,
    fundingTypeId: rule.fundingTypeId ?? null,
    budgetImpacting: typeof rule.budgetImpacting === 'boolean' ? rule.budgetImpacting : null,
    requestorRole: rule.requestorRole?.trim() || null,
    orgUnitId: rule.orgUnitId ?? null,
    conditions: rule.conditions && Object.keys(rule.conditions).length > 0 ? rule.conditions : null,
    steps: (rule.steps ?? [createEmptyRuleStep(1)]).map((step, stepIndex) => normalizeRuleStep(step, stepIndex)),
  };
}

function parseRulesJson(raw: string) {
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Rules JSON must be an array.');
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`Rule ${index + 1} must be an object.`);
    }

    return normalizeRule(value as Partial<RuleBuilderState>, index);
  });
}

function hydrateRuleSetForm(record: ApprovalRuleSetRecord): RuleSetFormState {
  return {
    name: record.name,
    description: record.description ?? '',
    status: record.status,
    version: String(record.version),
    scopeOrgUnitId: record.scopeOrgUnitId ?? '',
    effectiveStartDate: record.effectiveStartDate?.slice(0, 10) ?? '',
    effectiveEndDate: record.effectiveEndDate?.slice(0, 10) ?? '',
    rules: record.rules.map((rule, index) => normalizeRule({
      ...rule,
      steps: rule.steps,
    }, index)),
  };
}

function buildRuleSetPayload(form: RuleSetFormState): ApprovalRuleSetPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    status: form.status,
    version: Number(form.version || '1'),
    scopeOrgUnitId: form.scopeOrgUnitId || null,
    effectiveStartDate: form.effectiveStartDate || null,
    effectiveEndDate: form.effectiveEndDate || null,
    rules: form.rules.map((rule, index) => ({
      ...normalizeRule(rule, index),
      requestTypeId: rule.requestTypeId || null,
      fundingTypeId: rule.fundingTypeId || null,
      requestorRole: rule.requestorRole?.trim() || null,
      orgUnitId: rule.orgUnitId || null,
      conditions: rule.conditions && Object.keys(rule.conditions).length > 0 ? rule.conditions : null,
      steps: rule.steps.map((step, stepIndex) => normalizeRuleStep(step, stepIndex)),
    })),
  };
}

function validateRuleSetForm(form: RuleSetFormState) {
  if (!form.name.trim()) {
    return 'Rule set name is required.';
  }

  const version = Number(form.version || '0');
  if (!Number.isInteger(version) || version < 1) {
    return 'Version must be a whole number greater than zero.';
  }

  if (form.rules.length === 0) {
    return 'Add at least one routing rule before saving.';
  }

  const fallbackCount = form.rules.filter((rule) => rule.isFallback).length;
  if (fallbackCount > 1) {
    return 'Only one fallback rule can be configured in a rule set.';
  }

  for (const [ruleIndex, rule] of form.rules.entries()) {
    if (!rule.name.trim()) {
      return `Rule ${ruleIndex + 1} needs a name.`;
    }

    if (rule.steps.length === 0) {
      return `Rule "${rule.name}" needs at least one approval step.`;
    }

    for (const [stepIndex, step] of rule.steps.entries()) {
      if (!step.label.trim()) {
        return `Step ${stepIndex + 1} in "${rule.name}" needs a label.`;
      }

      if ((step.assigneeSource === 'Queue' || step.assigneeSource === 'SpecificAccount') && !step.assigneeValue?.trim()) {
        return `Step "${step.label}" in "${rule.name}" needs an assignee target.`;
      }
    }
  }

  return null;
}

function RequestTypePreview({ fields }: { fields: DynamicFieldDefinition[] }) {
  if (fields.length === 0) {
    return (
      <div className="settings-empty-state">
        <strong>No custom fields yet</strong>
        <p>Add fields to preview the intake form experience.</p>
      </div>
    );
  }

  return (
    <div className="settings-builder-preview-grid">
      {fields.map((field) => (
        <label key={field.key} className="settings-builder-preview-field">
          <span>
            {field.label || 'Untitled field'}
            {field.required ? ' *' : ''}
          </span>
          {field.type === 'textarea' ? <textarea rows={3} disabled placeholder="Preview value" /> : null}
          {field.type === 'number' ? <input type="number" disabled placeholder="0" /> : null}
          {field.type === 'date' ? <input type="date" disabled /> : null}
          {field.type === 'select' ? (
            <select disabled defaultValue="">
              <option value="">Select</option>
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : null}
          {field.type === 'text' ? <input type="text" disabled placeholder="Preview value" /> : null}
        </label>
      ))}
    </div>
  );
}

export function RecruitmentSettingsSection() {
  const [activeTab, setActiveTab] = useState<RecruitmentConfigTab>('request-types');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived' | 'draft'>('all');
  const [requestTypes, setRequestTypes] = useState<RequestTypeRecord[]>([]);
  const [fundingTypes, setFundingTypes] = useState<FundingTypeRecord[]>([]);
  const [ruleSets, setRuleSets] = useState<ApprovalRuleSetRecord[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [requestTypeForm, setRequestTypeForm] = useState<RequestTypeFormState>(emptyRequestType);
  const [fundingTypeForm, setFundingTypeForm] = useState<FundingTypeFormState>(emptyFundingType);
  const [ruleSetForm, setRuleSetForm] = useState<RuleSetFormState>(emptyRuleSet);
  const [simulationForm, setSimulationForm] = useState<SimulationFormState>(emptySimulationForm);
  const [simulationResult, setSimulationResult] = useState<Awaited<ReturnType<typeof simulateApprovalRuleSet>> | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [requestTypeJsonOpen, setRequestTypeJsonOpen] = useState(false);
  const [requestTypeJsonDraft, setRequestTypeJsonDraft] = useState('[]');
  const [ruleSetJsonOpen, setRuleSetJsonOpen] = useState(false);
  const [ruleSetJsonDraft, setRuleSetJsonDraft] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRecruitmentSettings() {
    setLoading(true);
    setError(null);

    try {
      const [nextRequestTypes, nextFundingTypes, nextRuleSets, nextOrgUnits] = await Promise.all([
        listRequestTypes(),
        listFundingTypes(),
        listApprovalRuleSets(),
        listOrgUnits(false),
      ]);

      setRequestTypes(nextRequestTypes);
      setFundingTypes(nextFundingTypes);
      setRuleSets(nextRuleSets);
      setOrgUnits(nextOrgUnits.filter((record) => record.recordStatus === 'Active'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load recruitment configuration.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecruitmentSettings();
  }, []);

  useEffect(() => {
    if (editor?.type !== 'rule-set') {
      return;
    }

    setSimulationForm((current) => ({
      requestTypeId: current.requestTypeId || requestTypes.find((record) => record.isActive)?.id || '',
      fundingTypeId: current.fundingTypeId || fundingTypes.find((record) => record.isActive)?.id || '',
      orgUnitId: current.orgUnitId || orgUnits[0]?.id || '',
      budgetImpacting: current.budgetImpacting,
      requestorRole: current.requestorRole,
    }));
  }, [editor?.type, fundingTypes, orgUnits, requestTypes]);

  const visibleRequestTypes = useMemo(() => requestTypes.filter((record) => {
    if (statusFilter === 'active' && !record.isActive) {
      return false;
    }

    if (statusFilter === 'archived' && record.isActive) {
      return false;
    }

    if (statusFilter === 'draft') {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    return `${record.name} ${record.code} ${record.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [requestTypes, search, statusFilter]);

  const visibleFundingTypes = useMemo(() => fundingTypes.filter((record) => {
    if (statusFilter === 'active' && !record.isActive) {
      return false;
    }

    if (statusFilter === 'archived' && record.isActive) {
      return false;
    }

    if (statusFilter === 'draft') {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    return `${record.name} ${record.code} ${record.category ?? ''} ${record.durationType ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [fundingTypes, search, statusFilter]);

  const visibleRuleSets = useMemo(() => ruleSets.filter((record) => {
    if (statusFilter === 'active' && record.status !== 'Active') {
      return false;
    }

    if (statusFilter === 'archived' && record.status !== 'Archived') {
      return false;
    }

    if (statusFilter === 'draft' && record.status !== 'Draft') {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    return `${record.name} ${record.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [ruleSets, search, statusFilter]);

  const requestTypeValidation = useMemo(
    () => validateDynamicFieldSchema(requestTypeForm.fieldSchema),
    [requestTypeForm.fieldSchema],
  );
  const requestTypeSaveDisabled = saving || !requestTypeForm.code.trim() || !requestTypeForm.name.trim() || requestTypeValidation.hasErrors;
  const ruleSetValidationError = useMemo(() => validateRuleSetForm(ruleSetForm), [ruleSetForm]);
  const ruleSetSaveDisabled = saving || Boolean(ruleSetValidationError);

  const openRequestTypeEditor = (record?: RequestTypeRecord) => {
    setError(null);
    setSimulationResult(null);
    setEditor({ type: 'request-type', id: record?.id ?? null });
    setRequestTypeForm(record ? {
      code: record.code,
      name: record.name,
      description: record.description ?? '',
      fieldSchema: record.fieldSchema.map((field) => normalizeDynamicField(field)),
      isActive: record.isActive,
    } : emptyRequestType);
    setRequestTypeJsonOpen(false);
    setRequestTypeJsonDraft(JSON.stringify(record?.fieldSchema ?? [], null, 2));
  };

  const openFundingTypeEditor = (record?: FundingTypeRecord) => {
    setError(null);
    setSimulationResult(null);
    setEditor({ type: 'funding-type', id: record?.id ?? null });
    setFundingTypeForm(record ? {
      code: record.code,
      name: record.name,
      category: record.category ?? '',
      description: record.description ?? '',
      durationType: record.durationType ?? '',
      isPermanent: record.isPermanent,
      isActive: record.isActive,
    } : emptyFundingType);
  };

  const openRuleSetEditor = (record?: ApprovalRuleSetRecord) => {
    setError(null);
    setSimulationResult(null);
    setEditor({ type: 'rule-set', id: record?.id ?? null });
    setRuleSetForm(record ? hydrateRuleSetForm(record) : emptyRuleSet);
    setRuleSetJsonOpen(false);
    setRuleSetJsonDraft(JSON.stringify(record?.rules ?? emptyRuleSet.rules, null, 2));
    setSimulationForm({
      requestTypeId: requestTypes.find((requestType) => requestType.isActive)?.id ?? '',
      budgetImpacting: false,
      fundingTypeId: fundingTypes.find((fundingType) => fundingType.isActive)?.id ?? '',
      orgUnitId: orgUnits[0]?.id ?? '',
      requestorRole: '',
    });
  };

  const closeEditor = () => {
    setEditor(null);
    setRequestTypeForm(emptyRequestType);
    setFundingTypeForm(emptyFundingType);
    setRuleSetForm(emptyRuleSet);
    setSimulationForm(emptySimulationForm);
    setSimulationResult(null);
    setRequestTypeJsonOpen(false);
    setRuleSetJsonOpen(false);
  };

  const updateRequestTypeField = (index: number, updater: (field: DynamicFieldDefinition) => DynamicFieldDefinition) => {
    setRequestTypeForm((current) => {
      const nextFields = [...current.fieldSchema];
      nextFields[index] = updater(nextFields[index]);
      return { ...current, fieldSchema: nextFields };
    });
  };

  const addRequestTypeField = () => {
    setRequestTypeForm((current) => ({
      ...current,
      fieldSchema: [...current.fieldSchema, createEmptyDynamicField(current.fieldSchema.length)],
    }));
  };

  const duplicateRequestTypeField = (index: number) => {
    setRequestTypeForm((current) => {
      const nextFields = [...current.fieldSchema];
      const sourceField = normalizeDynamicField(nextFields[index]);
      const duplicateField = {
        ...sourceField,
        key: `${sourceField.key}_copy`,
      };
      nextFields.splice(index + 1, 0, duplicateField);
      return { ...current, fieldSchema: nextFields };
    });
  };

  const moveRequestTypeField = (index: number, direction: -1 | 1) => {
    setRequestTypeForm((current) => ({
      ...current,
      fieldSchema: moveItem(current.fieldSchema, index, direction),
    }));
  };

  const removeRequestTypeField = (index: number) => {
    setRequestTypeForm((current) => ({
      ...current,
      fieldSchema: current.fieldSchema.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const toggleRequestTypeJson = () => {
    setRequestTypeJsonOpen((current) => {
      if (!current) {
        setRequestTypeJsonDraft(JSON.stringify(requestTypeForm.fieldSchema, null, 2));
      }

      return !current;
    });
  };

  const applyRequestTypeJson = () => {
    try {
      const nextSchema = parseDynamicFieldArrayJson(requestTypeJsonDraft);
      const validation = validateDynamicFieldSchema(nextSchema);
      if (validation.hasErrors) {
        throw new Error('Fix the schema JSON before applying it.');
      }

      setRequestTypeForm((current) => ({ ...current, fieldSchema: nextSchema }));
      setRequestTypeJsonOpen(false);
    } catch (jsonError) {
      setError(jsonError instanceof Error ? jsonError.message : 'Unable to apply the field schema JSON.');
    }
  };

  const saveRequestType = async () => {
    if (requestTypeSaveDisabled) {
      setError('Resolve the request type validation issues before saving.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        code: requestTypeForm.code.trim(),
        name: requestTypeForm.name.trim(),
        description: requestTypeForm.description.trim() || null,
        fieldSchema: requestTypeForm.fieldSchema.map((field) => normalizeDynamicField(field)),
        isActive: requestTypeForm.isActive,
      };

      const nextRequestTypes = editor?.id
        ? await updateRequestType(editor.id, payload)
        : await createRequestType(payload);

      setRequestTypes(nextRequestTypes);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the request type.');
    } finally {
      setSaving(false);
    }
  };

  const saveFundingType = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        code: fundingTypeForm.code.trim(),
        name: fundingTypeForm.name.trim(),
        category: fundingTypeForm.category.trim() || null,
        description: fundingTypeForm.description.trim() || null,
        durationType: fundingTypeForm.durationType.trim() || null,
        isPermanent: fundingTypeForm.isPermanent,
        isActive: fundingTypeForm.isActive,
      };

      const nextFundingTypes = editor?.id
        ? await updateFundingType(editor.id, payload)
        : await createFundingType(payload);

      setFundingTypes(nextFundingTypes);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the funding type.');
    } finally {
      setSaving(false);
    }
  };

  const setRuleAtIndex = (ruleIndex: number, updater: (rule: RuleBuilderState) => RuleBuilderState) => {
    setRuleSetForm((current) => {
      const nextRules = [...current.rules];
      nextRules[ruleIndex] = normalizeRule(updater(nextRules[ruleIndex]), ruleIndex);
      return { ...current, rules: nextRules };
    });
  };

  const addRule = () => {
    setRuleSetForm((current) => ({
      ...current,
      rules: [...current.rules, createEmptyRule(current.rules.length)],
    }));
  };

  const duplicateRule = (ruleIndex: number) => {
    setRuleSetForm((current) => {
      const nextRules = [...current.rules];
      const duplicatedRule = normalizeRule({
        ...nextRules[ruleIndex],
        id: undefined,
        steps: nextRules[ruleIndex].steps.map((step, stepIndex) => normalizeRuleStep({ ...step, id: undefined }, stepIndex)),
      }, ruleIndex + 1);
      nextRules.splice(ruleIndex + 1, 0, duplicatedRule);
      return { ...current, rules: nextRules.map((rule, index) => normalizeRule(rule, index)) };
    });
  };

  const moveRule = (ruleIndex: number, direction: -1 | 1) => {
    setRuleSetForm((current) => ({
      ...current,
      rules: moveItem(current.rules, ruleIndex, direction).map((rule, index) => normalizeRule(rule, index)),
    }));
  };

  const removeRule = (ruleIndex: number) => {
    setRuleSetForm((current) => ({
      ...current,
      rules: current.rules.filter((_, index) => index !== ruleIndex).map((rule, index) => normalizeRule(rule, index)),
    }));
  };

  const addRuleStep = (ruleIndex: number) => {
    setRuleAtIndex(ruleIndex, (rule) => ({
      ...rule,
      steps: [...rule.steps, createEmptyRuleStep(rule.steps.length + 1)],
    }));
  };

  const duplicateRuleStep = (ruleIndex: number, stepIndex: number) => {
    setRuleAtIndex(ruleIndex, (rule) => {
      const nextSteps = [...rule.steps];
      const duplicatedStep = normalizeRuleStep({ ...nextSteps[stepIndex], id: undefined }, stepIndex + 1);
      nextSteps.splice(stepIndex + 1, 0, duplicatedStep);
      return {
        ...rule,
        steps: nextSteps.map((step, index) => normalizeRuleStep(step, index)),
      };
    });
  };

  const moveRuleStep = (ruleIndex: number, stepIndex: number, direction: -1 | 1) => {
    setRuleAtIndex(ruleIndex, (rule) => ({
      ...rule,
      steps: moveItem(rule.steps, stepIndex, direction).map((step, index) => normalizeRuleStep(step, index)),
    }));
  };

  const removeRuleStep = (ruleIndex: number, stepIndex: number) => {
    setRuleAtIndex(ruleIndex, (rule) => ({
      ...rule,
      steps: rule.steps.filter((_, index) => index !== stepIndex).map((step, index) => normalizeRuleStep(step, index)),
    }));
  };

  const toggleRuleSetJson = () => {
    setRuleSetJsonOpen((current) => {
      if (!current) {
        setRuleSetJsonDraft(JSON.stringify(ruleSetForm.rules, null, 2));
      }

      return !current;
    });
  };

  const applyRuleSetJson = () => {
    try {
      const nextRules = parseRulesJson(ruleSetJsonDraft);
      setRuleSetForm((current) => ({ ...current, rules: nextRules }));
      setRuleSetJsonOpen(false);
    } catch (jsonError) {
      setError(jsonError instanceof Error ? jsonError.message : 'Unable to apply the rules JSON.');
    }
  };

  const saveRuleSet = async () => {
    const payload = buildRuleSetPayload(ruleSetForm);
    const validationError = validateRuleSetForm(ruleSetForm);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nextRuleSets = editor?.id
        ? await updateApprovalRuleSet(editor.id, payload)
        : await createApprovalRuleSet(payload);

      setRuleSets(nextRuleSets);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the approval rule set.');
    } finally {
      setSaving(false);
    }
  };

  const publishRuleSetRecord = async (id: string) => {
    setSaving(true);
    setError(null);

    try {
      const nextRuleSets = await publishApprovalRuleSet(id);
      setRuleSets(nextRuleSets);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to publish the approval rule set.');
    } finally {
      setSaving(false);
    }
  };

  const runRuleSimulation = async () => {
    if (editor?.type !== 'rule-set' || !editor.id) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await simulateApprovalRuleSet(editor.id, {
        requestTypeId: simulationForm.requestTypeId,
        budgetImpacting: simulationForm.budgetImpacting,
        fundingTypeId: simulationForm.fundingTypeId,
        orgUnitId: simulationForm.orgUnitId,
        requestorRole: simulationForm.requestorRole.trim() || null,
      });

      setSimulationResult(result);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'Unable to simulate the approval route.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section-stack">
      {error ? (
        <div className="settings-banner settings-banner-error">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card settings-section-card">
        <div className="settings-section-toolbar">
          <div>
            <h2 className="card-title">Recruitment Configuration</h2>
            <p className="card-subtitle">Use structured builders for intake fields and routing rules instead of editing JSON in a textbox.</p>
          </div>
        </div>

        <div className="settings-inline-stats">
          <span className="settings-stat-chip">{requestTypes.length} request types</span>
          <span className="settings-stat-chip">{fundingTypes.length} funding types</span>
          <span className="settings-stat-chip">{ruleSets.length} rule sets</span>
          <span className="settings-stat-chip">{ruleSets.filter((record) => record.status === 'Active').length} active rule sets</span>
        </div>

        <div className="settings-section-tabs" role="tablist" aria-label="Recruitment configuration tabs">
          <button type="button" className={`settings-section-tab ${activeTab === 'request-types' ? 'settings-section-tab-active' : ''}`} onClick={() => setActiveTab('request-types')}>Request Types</button>
          <button type="button" className={`settings-section-tab ${activeTab === 'funding-types' ? 'settings-section-tab-active' : ''}`} onClick={() => setActiveTab('funding-types')}>Funding Types</button>
          <button type="button" className={`settings-section-tab ${activeTab === 'rule-sets' ? 'settings-section-tab-active' : ''}`} onClick={() => setActiveTab('rule-sets')}>Approval Rule Sets</button>
        </div>

        <div className="settings-filter-bar">
          <div className="settings-filter-bar-main">
            <label className="settings-search-field">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter records in the active tab" />
            </label>
          </div>
          <div className="settings-filter-bar-controls">
            <label className="settings-toolbar-field settings-toolbar-field-inline">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'archived' | 'draft')}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>
          <div className="settings-filter-bar-actions">
            {activeTab === 'request-types' ? <button type="button" className="button" onClick={() => openRequestTypeEditor()}><Plus size={16} />Add request type</button> : null}
            {activeTab === 'funding-types' ? <button type="button" className="button" onClick={() => openFundingTypeEditor()}><Plus size={16} />Add funding type</button> : null}
            {activeTab === 'rule-sets' ? <button type="button" className="button" onClick={() => openRuleSetEditor()}><Plus size={16} />Add rule set</button> : null}
          </div>
        </div>

        {loading ? (
          <div className="settings-state">
            <LoaderCircle className="settings-spin" size={18} />
            <span>Loading recruitment configuration...</span>
          </div>
        ) : null}

        {!loading && activeTab === 'request-types' ? (
          <div className="settings-record-list">
            <div className="settings-record-head settings-record-grid-recruitment-types">
              <span>Request type</span>
              <span>Fields</span>
              <span>Status</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>
            {visibleRequestTypes.length > 0 ? visibleRequestTypes.map((record) => (
              <div key={record.id} className="settings-record-cluster">
                <article className="settings-record-row settings-record-grid-recruitment-types">
                  <div>
                    <strong>{record.name}</strong>
                    <p>{record.code}</p>
                  </div>
                  <span>{record.fieldSchema.length} fields</span>
                  <span className={`badge ${record.isActive ? 'badge-success' : 'badge-warning'}`}>{record.isActive ? 'Active' : 'Archived'}</span>
                  <span>{formatDateTime(record.updatedAt)}</span>
                  <div className="settings-record-actions">
                    <button type="button" className="button button-outline" onClick={() => openRequestTypeEditor(record)}>Edit</button>
                  </div>
                </article>
                <div className="settings-record-detail">
                  <strong className="settings-route-list">Preview fields</strong>
                  <div className="settings-builder-pill-row">
                    {record.fieldSchema.length > 0 ? record.fieldSchema.map((field) => (
                      <span key={field.key} className="settings-builder-pill">
                        {field.label} - {field.type}
                      </span>
                    )) : <span className="settings-record-muted">No custom fields configured.</span>}
                  </div>
                </div>
              </div>
            )) : (
              <div className="settings-empty-state">
                <strong>No matching request types</strong>
                <p>Try a different filter or add a new request type.</p>
              </div>
            )}
          </div>
        ) : null}

        {!loading && activeTab === 'funding-types' ? (
          <div className="settings-record-list">
            <div className="settings-record-head settings-record-grid-recruitment-funding">
              <span>Funding type</span>
              <span>Category</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {visibleFundingTypes.length > 0 ? visibleFundingTypes.map((record) => (
              <article key={record.id} className="settings-record-row settings-record-grid-recruitment-funding">
                <div>
                  <strong>{record.name}</strong>
                  <p>{record.code}</p>
                </div>
                <span>{record.category ?? 'Not set'}</span>
                <span>{record.durationType ?? 'Not set'}{record.isPermanent ? ' - Permanent' : ''}</span>
                <span className={`badge ${record.isActive ? 'badge-success' : 'badge-warning'}`}>{record.isActive ? 'Active' : 'Archived'}</span>
                <div className="settings-record-actions">
                  <button type="button" className="button button-outline" onClick={() => openFundingTypeEditor(record)}>Edit</button>
                </div>
              </article>
            )) : (
              <div className="settings-empty-state">
                <strong>No matching funding types</strong>
                <p>Try a different filter or add a new funding type.</p>
              </div>
            )}
          </div>
        ) : null}

        {!loading && activeTab === 'rule-sets' ? (
          <div className="settings-record-list">
            <div className="settings-record-head settings-record-grid-recruitment-rules">
              <span>Rule set</span>
              <span>Version</span>
              <span>Rules</span>
              <span>Status</span>
              <span>Published</span>
              <span>Actions</span>
            </div>
            {visibleRuleSets.length > 0 ? visibleRuleSets.map((record) => (
              <div key={record.id} className="settings-record-cluster">
                <article className="settings-record-row settings-record-grid-recruitment-rules">
                  <div>
                    <strong>{record.name}</strong>
                    <p>{record.description ?? 'No description configured.'}</p>
                  </div>
                  <span>{record.version}</span>
                  <span>{record.rules.length}</span>
                  <span className={`badge ${record.status === 'Active' ? 'badge-success' : record.status === 'Archived' ? 'badge-warning' : 'badge-primary'}`}>{record.status}</span>
                  <span>{formatDateTime(record.publishedAt)}</span>
                  <div className="settings-record-actions">
                    <button type="button" className="button button-outline" onClick={() => openRuleSetEditor(record)}>Edit</button>
                    {record.status !== 'Active' ? <button type="button" className="button" onClick={() => { void publishRuleSetRecord(record.id); }} disabled={saving}>Publish</button> : null}
                  </div>
                </article>
                <div className="settings-record-detail">
                  <div className="settings-builder-pill-row">
                    {record.rules.map((rule) => (
                      <span key={rule.id} className="settings-builder-pill">
                        {rule.name} - {rule.steps.length} steps
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )) : (
              <div className="settings-empty-state">
                <strong>No matching rule sets</strong>
                <p>Try a different filter or add a new approval rule set.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {editor?.type === 'request-type' ? (
        <Drawer
          title={editor.id ? 'Edit request type' : 'Create request type'}
          subtitle="Define the intake model visually, preview the resulting form, and keep JSON as a secondary escape hatch."
          onClose={closeEditor}
          className="settings-drawer settings-drawer-wide"
          bodyClassName="settings-drawer-body"
          size="xl"
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveRequestType(); }} disabled={requestTypeSaveDisabled}>Save request type</button>
            </>
          )}
        >
          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Basic details</h3>
                <p className="card-subtitle">Core labels and status for this request type.</p>
              </div>
            </div>
            <div className="settings-builder-grid">
              <DrawerField label="Code">
                <input value={requestTypeForm.code} onChange={(event) => setRequestTypeForm((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editor.id)} />
              </DrawerField>
              <DrawerField label="Name">
                <input value={requestTypeForm.name} onChange={(event) => setRequestTypeForm((current) => ({ ...current, name: event.target.value }))} />
              </DrawerField>
              <DrawerField label="Status">
                <select value={requestTypeForm.isActive ? 'active' : 'archived'} onChange={(event) => setRequestTypeForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </DrawerField>
              <DrawerField label="Description" fullWidth>
                <textarea rows={3} value={requestTypeForm.description} onChange={(event) => setRequestTypeForm((current) => ({ ...current, description: event.target.value }))} />
              </DrawerField>
            </div>
          </div>

          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Field builder</h3>
                <p className="card-subtitle">Define the dynamic fields the recruitment intake form should render.</p>
              </div>
              <div className="settings-builder-actions">
                <button type="button" className="button button-outline" onClick={toggleRequestTypeJson}>
                  <FileJson size={16} />
                  {requestTypeJsonOpen ? 'Hide JSON' : 'Advanced JSON'}
                </button>
                <button type="button" className="button" onClick={addRequestTypeField}>
                  <Plus size={16} />
                  Add field
                </button>
              </div>
            </div>

            <div className="settings-builder-list">
              {requestTypeForm.fieldSchema.length > 0 ? requestTypeForm.fieldSchema.map((field, index) => {
                const errors = requestTypeValidation.fieldErrors[index];
                const keyWasDerived = !field.key || field.key === slugifyDynamicFieldKey(field.label) || /^field_\d+$/.test(field.key);

                return (
                  <article key={`${field.key}-${index}`} className="settings-builder-card">
                    <div className="settings-builder-card-header">
                      <div>
                        <strong>{field.label || `Field ${index + 1}`}</strong>
                        <span className="settings-record-muted">{field.type}</span>
                      </div>
                      <div className="settings-builder-actions">
                        <button type="button" className="settings-icon-button" onClick={() => moveRequestTypeField(index, -1)} aria-label="Move field up"><ArrowUp size={16} /></button>
                        <button type="button" className="settings-icon-button" onClick={() => moveRequestTypeField(index, 1)} aria-label="Move field down"><ArrowDown size={16} /></button>
                        <button type="button" className="settings-icon-button" onClick={() => duplicateRequestTypeField(index)} aria-label="Duplicate field"><Copy size={16} /></button>
                        <button type="button" className="settings-icon-button" onClick={() => removeRequestTypeField(index)} aria-label="Remove field"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="settings-builder-grid">
                      <DrawerField label="Label">
                        <input
                          value={field.label}
                          onChange={(event) => updateRequestTypeField(index, (currentField) => {
                            const nextLabel = event.target.value;
                            return normalizeDynamicField({
                              ...currentField,
                              label: nextLabel,
                              key: keyWasDerived ? slugifyDynamicFieldKey(nextLabel) : currentField.key,
                            });
                          })}
                          placeholder="Business case owner"
                        />
                        {errors.label ? <span className="settings-builder-error">{errors.label}</span> : null}
                      </DrawerField>
                      <DrawerField label="Key">
                        <input
                          value={field.key}
                          onChange={(event) => updateRequestTypeField(index, (currentField) => normalizeDynamicField({ ...currentField, key: event.target.value }))}
                          placeholder="business_case_owner"
                        />
                        {errors.key ? <span className="settings-builder-error">{errors.key}</span> : null}
                      </DrawerField>
                      <DrawerField label="Field type">
                        <select
                          value={field.type}
                          onChange={(event) => updateRequestTypeField(index, (currentField) => normalizeDynamicField({
                            ...currentField,
                            type: event.target.value as DynamicFieldDefinition['type'],
                            options: event.target.value === 'select' ? (currentField.options ?? ['']) : undefined,
                          }))}
                        >
                          {dynamicFieldTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </DrawerField>
                      <DrawerField label="Required">
                        <label className="settings-toggle-inline">
                          <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateRequestTypeField(index, (currentField) => ({ ...currentField, required: event.target.checked }))} />
                          Required for submission
                        </label>
                      </DrawerField>
                      {field.type === 'select' ? (
                        <DrawerField label="Options" fullWidth>
                          <textarea
                            rows={4}
                            value={(field.options ?? []).join('\n')}
                            onChange={(event) => updateRequestTypeField(index, (currentField) => normalizeDynamicField({
                              ...currentField,
                              options: event.target.value.split('\n'),
                            }))}
                            placeholder={'Approved\nDeferred\nRejected'}
                          />
                          <span className="settings-record-muted">One option per line.</span>
                          {errors.options ? <span className="settings-builder-error">{errors.options}</span> : null}
                        </DrawerField>
                      ) : null}
                    </div>
                  </article>
                );
              }) : (
                <div className="settings-empty-state">
                  <strong>No fields configured</strong>
                  <p>Add dynamic fields to replace the old schema JSON workflow.</p>
                </div>
              )}
            </div>

            {requestTypeJsonOpen ? (
              <div className="settings-json-panel">
                <div className="settings-section-toolbar settings-section-toolbar-compact">
                  <div>
                    <h4 className="card-title">Advanced JSON</h4>
                    <p className="card-subtitle">Import or edit the field schema directly when the visual builder is not enough.</p>
                  </div>
                  <div className="settings-builder-actions">
                    <button type="button" className="button button-outline" onClick={() => setRequestTypeJsonDraft(JSON.stringify(requestTypeForm.fieldSchema, null, 2))}>Reset from builder</button>
                    <button type="button" className="button" onClick={applyRequestTypeJson}>Apply JSON</button>
                  </div>
                </div>
                <textarea rows={12} value={requestTypeJsonDraft} onChange={(event) => setRequestTypeJsonDraft(event.target.value)} />
              </div>
            ) : null}
          </div>

          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Live preview</h3>
                <p className="card-subtitle">This mirrors how the recruitment intake form will render these fields.</p>
              </div>
            </div>
            <RequestTypePreview fields={requestTypeForm.fieldSchema} />
          </div>
        </Drawer>
      ) : null}

      {editor?.type === 'funding-type' ? (
        <Drawer
          title={editor.id ? 'Edit funding type' : 'Create funding type'}
          subtitle="Configure the funding categories used by requests and approved positions."
          onClose={closeEditor}
          className="settings-drawer"
          bodyClassName="settings-drawer-body"
          size="lg"
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveFundingType(); }} disabled={saving}>Save funding type</button>
            </>
          )}
        >
          <DrawerField label="Code"><input value={fundingTypeForm.code} onChange={(event) => setFundingTypeForm((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editor.id)} /></DrawerField>
          <DrawerField label="Name"><input value={fundingTypeForm.name} onChange={(event) => setFundingTypeForm((current) => ({ ...current, name: event.target.value }))} /></DrawerField>
          <DrawerField label="Category"><input value={fundingTypeForm.category} onChange={(event) => setFundingTypeForm((current) => ({ ...current, category: event.target.value }))} /></DrawerField>
          <DrawerField label="Duration"><input value={fundingTypeForm.durationType} onChange={(event) => setFundingTypeForm((current) => ({ ...current, durationType: event.target.value }))} /></DrawerField>
          <DrawerField label="Description" fullWidth><textarea rows={3} value={fundingTypeForm.description} onChange={(event) => setFundingTypeForm((current) => ({ ...current, description: event.target.value }))} /></DrawerField>
          <DrawerField label="Permanent"><label className="settings-toggle-inline"><input type="checkbox" checked={fundingTypeForm.isPermanent} onChange={(event) => setFundingTypeForm((current) => ({ ...current, isPermanent: event.target.checked }))} />Permanent funding</label></DrawerField>
          <DrawerField label="Status"><select value={fundingTypeForm.isActive ? 'active' : 'archived'} onChange={(event) => setFundingTypeForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}><option value="active">Active</option><option value="archived">Archived</option></select></DrawerField>
        </Drawer>
      ) : null}

      {editor?.type === 'rule-set' ? (
        <Drawer
          title={editor.id ? 'Edit approval rule set' : 'Create approval rule set'}
          subtitle="Build routing rules visually and keep advanced JSON as a secondary option."
          onClose={closeEditor}
          className="settings-drawer settings-drawer-wide"
          bodyClassName="settings-drawer-body"
          size="xl"
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveRuleSet(); }} disabled={ruleSetSaveDisabled}>Save rule set</button>
            </>
          )}
        >
          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Rule set metadata</h3>
                <p className="card-subtitle">Versioning, publication status, scope, and effective dates.</p>
              </div>
            </div>
            <div className="settings-builder-grid">
              <DrawerField label="Name"><input value={ruleSetForm.name} onChange={(event) => setRuleSetForm((current) => ({ ...current, name: event.target.value }))} /></DrawerField>
              <DrawerField label="Version"><input type="number" min="1" max="999" value={ruleSetForm.version} onChange={(event) => setRuleSetForm((current) => ({ ...current, version: event.target.value }))} /></DrawerField>
              <DrawerField label="Status">
                <select value={ruleSetForm.status} onChange={(event) => setRuleSetForm((current) => ({ ...current, status: event.target.value as RuleSetFormState['status'] }))}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </select>
              </DrawerField>
              <DrawerField label="Scope org unit">
                <select value={ruleSetForm.scopeOrgUnitId} onChange={(event) => setRuleSetForm((current) => ({ ...current, scopeOrgUnitId: event.target.value }))}>
                  <option value="">All org units</option>
                  {orgUnits.map((orgUnit) => <option key={orgUnit.id} value={orgUnit.id}>{orgUnit.name}</option>)}
                </select>
              </DrawerField>
              <DrawerField label="Effective start"><input type="date" value={ruleSetForm.effectiveStartDate} onChange={(event) => setRuleSetForm((current) => ({ ...current, effectiveStartDate: event.target.value }))} /></DrawerField>
              <DrawerField label="Effective end"><input type="date" value={ruleSetForm.effectiveEndDate} onChange={(event) => setRuleSetForm((current) => ({ ...current, effectiveEndDate: event.target.value }))} /></DrawerField>
              <DrawerField label="Description" fullWidth><textarea rows={3} value={ruleSetForm.description} onChange={(event) => setRuleSetForm((current) => ({ ...current, description: event.target.value }))} /></DrawerField>
            </div>
          </div>

          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Rule builder</h3>
                <p className="card-subtitle">Compose conditional routing rules and ordered approval steps without editing raw JSON directly.</p>
              </div>
              <div className="settings-builder-actions">
                <button type="button" className="button button-outline" onClick={toggleRuleSetJson}>
                  <FileJson size={16} />
                  {ruleSetJsonOpen ? 'Hide JSON' : 'Advanced JSON'}
                </button>
                <button type="button" className="button" onClick={addRule}>
                  <Plus size={16} />
                  Add rule
                </button>
              </div>
            </div>

            <div className="settings-builder-list">
              {ruleSetForm.rules.map((rule, ruleIndex) => (
                <article key={`${rule.name}-${ruleIndex}`} className="settings-builder-card">
                  <div className="settings-builder-card-header">
                    <div>
                      <strong>{rule.name || `Rule ${ruleIndex + 1}`}</strong>
                      <span className="settings-record-muted">{rule.steps.length} steps{rule.conditions && Object.keys(rule.conditions).length > 0 ? ' - advanced conditions' : ''}</span>
                    </div>
                    <div className="settings-builder-actions">
                      <button type="button" className="settings-icon-button" onClick={() => moveRule(ruleIndex, -1)} aria-label="Move rule up"><ArrowUp size={16} /></button>
                      <button type="button" className="settings-icon-button" onClick={() => moveRule(ruleIndex, 1)} aria-label="Move rule down"><ArrowDown size={16} /></button>
                      <button type="button" className="settings-icon-button" onClick={() => duplicateRule(ruleIndex)} aria-label="Duplicate rule"><Copy size={16} /></button>
                      <button type="button" className="settings-icon-button" onClick={() => removeRule(ruleIndex)} aria-label="Remove rule"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  <div className="settings-builder-grid">
                    <DrawerField label="Rule name"><input value={rule.name} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, name: event.target.value }))} /></DrawerField>
                    <DrawerField label="Priority"><input type="number" min="1" max="999" value={rule.priority} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, priority: Number(event.target.value || '1') }))} /></DrawerField>
                    <DrawerField label="Request type">
                      <select value={rule.requestTypeId ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, requestTypeId: event.target.value || null }))}>
                        <option value="">Any request type</option>
                        {requestTypes.map((requestType) => <option key={requestType.id} value={requestType.id}>{requestType.name}</option>)}
                      </select>
                    </DrawerField>
                    <DrawerField label="Funding type">
                      <select value={rule.fundingTypeId ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, fundingTypeId: event.target.value || null }))}>
                        <option value="">Any funding type</option>
                        {fundingTypes.map((fundingType) => <option key={fundingType.id} value={fundingType.id}>{fundingType.name}</option>)}
                      </select>
                    </DrawerField>
                    <DrawerField label="Budget impact">
                      <select
                        value={rule.budgetImpacting === null ? 'any' : String(rule.budgetImpacting)}
                        onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({
                          ...currentRule,
                          budgetImpacting: event.target.value === 'any' ? null : event.target.value === 'true',
                        }))}
                      >
                        <option value="any">Any</option>
                        <option value="true">Budget impacting</option>
                        <option value="false">Not budget impacting</option>
                      </select>
                    </DrawerField>
                    <DrawerField label="Requestor role"><input value={rule.requestorRole ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, requestorRole: event.target.value || null }))} placeholder="HR.Manager" /></DrawerField>
                    <DrawerField label="Org unit">
                      <select value={rule.orgUnitId ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, orgUnitId: event.target.value || null }))}>
                        <option value="">Any org unit</option>
                        {orgUnits.map((orgUnit) => <option key={orgUnit.id} value={orgUnit.id}>{orgUnit.name}</option>)}
                      </select>
                    </DrawerField>
                    <DrawerField label="Active">
                      <label className="settings-toggle-inline">
                        <input type="checkbox" checked={rule.isActive} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, isActive: event.target.checked }))} />
                        Rule can match
                      </label>
                    </DrawerField>
                    <DrawerField label="Fallback">
                      <label className="settings-toggle-inline">
                        <input type="checkbox" checked={rule.isFallback} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, isFallback: event.target.checked }))} />
                        Use when no higher-priority rule matches
                      </label>
                    </DrawerField>
                  </div>

                  <div className="settings-builder-subsection">
                    <div className="settings-section-toolbar settings-section-toolbar-compact">
                      <div>
                        <h4 className="card-title">Approval steps</h4>
                        <p className="card-subtitle">Define the ordered approvals that should be created when this rule matches.</p>
                      </div>
                      <button type="button" className="button button-outline" onClick={() => addRuleStep(ruleIndex)}>
                        <Plus size={16} />
                        Add step
                      </button>
                    </div>

                    <div className="settings-builder-list">
                      {rule.steps.map((step, stepIndex) => (
                        <div key={`${step.label}-${stepIndex}`} className="settings-builder-step-card">
                          <div className="settings-builder-card-header">
                            <div>
                              <strong>{step.label || `Step ${stepIndex + 1}`}</strong>
                              <span className="settings-record-muted">{step.assigneeSource}</span>
                            </div>
                            <div className="settings-builder-actions">
                              <button type="button" className="settings-icon-button" onClick={() => moveRuleStep(ruleIndex, stepIndex, -1)} aria-label="Move step up"><ArrowUp size={16} /></button>
                              <button type="button" className="settings-icon-button" onClick={() => moveRuleStep(ruleIndex, stepIndex, 1)} aria-label="Move step down"><ArrowDown size={16} /></button>
                              <button type="button" className="settings-icon-button" onClick={() => duplicateRuleStep(ruleIndex, stepIndex)} aria-label="Duplicate step"><Copy size={16} /></button>
                              <button type="button" className="settings-icon-button" onClick={() => removeRuleStep(ruleIndex, stepIndex)} aria-label="Remove step"><Trash2 size={16} /></button>
                            </div>
                          </div>

                          <div className="settings-builder-grid">
                            <DrawerField label="Step label"><input value={step.label} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, label: event.target.value }, index) : currentStep) }))} /></DrawerField>
                            <DrawerField label="Assignee source">
                              <select
                                value={step.assigneeSource}
                                onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({
                                  ...currentRule,
                                  steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({
                                    ...currentStep,
                                    assigneeSource: event.target.value as RuleBuilderState['steps'][number]['assigneeSource'],
                                    assigneeValue: event.target.value === 'Queue' ? 'HR_OPERATIONS' : null,
                                  }, index) : currentStep),
                                }))}
                              >
                                <option value="RequestorManager">Requestor manager</option>
                                <option value="PositionIncumbent">Position incumbent</option>
                                <option value="Queue">Queue</option>
                                <option value="SpecificAccount">Specific account</option>
                              </select>
                            </DrawerField>
                            {step.assigneeSource === 'Queue' ? (
                              <DrawerField label="Queue target">
                                <select value={step.assigneeValue ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, assigneeValue: event.target.value }, index) : currentStep) }))}>
                                  <option value="">Select queue</option>
                                  {queueOptions.map((queue) => <option key={queue.value} value={queue.value}>{queue.label}</option>)}
                                </select>
                              </DrawerField>
                            ) : null}
                            {step.assigneeSource === 'SpecificAccount' ? (
                              <DrawerField label="Account ID">
                                <input value={step.assigneeValue ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, assigneeValue: event.target.value }, index) : currentStep) }))} placeholder="Account UUID" />
                              </DrawerField>
                            ) : null}
                            <DrawerField label="Fallback queue">
                              <select value={step.fallbackQueueKey ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, fallbackQueueKey: event.target.value || null }, index) : currentStep) }))}>
                                <option value="">None</option>
                                {queueOptions.map((queue) => <option key={queue.value} value={queue.value}>{queue.label}</option>)}
                              </select>
                            </DrawerField>
                            <DrawerField label="Due days"><input type="number" min="0" max="365" value={step.dueDays ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, dueDays: event.target.value ? Number(event.target.value) : null }, index) : currentStep) }))} /></DrawerField>
                            <DrawerField label="Escalation days"><input type="number" min="1" max="365" value={step.escalationDays ?? ''} onChange={(event) => setRuleAtIndex(ruleIndex, (currentRule) => ({ ...currentRule, steps: currentRule.steps.map((currentStep, index) => index === stepIndex ? normalizeRuleStep({ ...currentStep, escalationDays: event.target.value ? Number(event.target.value) : null }, index) : currentStep) }))} /></DrawerField>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {ruleSetJsonOpen ? (
              <div className="settings-json-panel">
                <div className="settings-section-toolbar settings-section-toolbar-compact">
                  <div>
                    <h4 className="card-title">Advanced JSON</h4>
                    <p className="card-subtitle">Edit the `rules` array directly when you need a lower-level escape hatch.</p>
                  </div>
                  <div className="settings-builder-actions">
                    <button type="button" className="button button-outline" onClick={() => setRuleSetJsonDraft(JSON.stringify(ruleSetForm.rules, null, 2))}>Reset from builder</button>
                    <button type="button" className="button" onClick={applyRuleSetJson}>Apply JSON</button>
                  </div>
                </div>
                <textarea rows={16} value={ruleSetJsonDraft} onChange={(event) => setRuleSetJsonDraft(event.target.value)} />
              </div>
            ) : null}
          </div>

          <div className="settings-builder-section settings-drawer-field-full">
            <div className="settings-section-toolbar settings-section-toolbar-compact">
              <div>
                <h3 className="card-title">Simulation</h3>
                <p className="card-subtitle">Validate the currently saved rule set against a representative request.</p>
              </div>
            </div>

            {editor.id ? (
              <div className="settings-builder-grid">
                <DrawerField label="Request type">
                  <select value={simulationForm.requestTypeId} onChange={(event) => setSimulationForm((current) => ({ ...current, requestTypeId: event.target.value }))}>
                    <option value="">Select request type</option>
                    {requestTypes.filter((record) => record.isActive).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                  </select>
                </DrawerField>
                <DrawerField label="Funding type">
                  <select value={simulationForm.fundingTypeId} onChange={(event) => setSimulationForm((current) => ({ ...current, fundingTypeId: event.target.value }))}>
                    <option value="">Select funding type</option>
                    {fundingTypes.filter((record) => record.isActive).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                  </select>
                </DrawerField>
                <DrawerField label="Org unit">
                  <select value={simulationForm.orgUnitId} onChange={(event) => setSimulationForm((current) => ({ ...current, orgUnitId: event.target.value }))}>
                    <option value="">Select org unit</option>
                    {orgUnits.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                  </select>
                </DrawerField>
                <DrawerField label="Requestor role">
                  <input value={simulationForm.requestorRole} onChange={(event) => setSimulationForm((current) => ({ ...current, requestorRole: event.target.value }))} placeholder="Optional role" />
                </DrawerField>
                <DrawerField label="Budget impacting">
                  <label className="settings-toggle-inline">
                    <input type="checkbox" checked={simulationForm.budgetImpacting} onChange={(event) => setSimulationForm((current) => ({ ...current, budgetImpacting: event.target.checked }))} />
                    Budget impacting request
                  </label>
                </DrawerField>
                <div className="settings-builder-actions settings-drawer-field-full">
                  <button type="button" className="button" onClick={() => { void runRuleSimulation(); }} disabled={saving || !simulationForm.requestTypeId || !simulationForm.fundingTypeId || !simulationForm.orgUnitId}>Run simulation</button>
                </div>
                {simulationResult ? (
                  <div className="settings-simulation-result settings-drawer-field-full">
                    <strong>{simulationResult.matched ? simulationResult.rule?.name ?? 'Fallback rule matched' : 'No rule matched'}</strong>
                    <p>{simulationResult.steps.length} approval steps would be created by {simulationResult.ruleSetName}.</p>
                    <div className="settings-builder-pill-row">
                      {simulationResult.steps.map((step) => (
                        <span key={step.id} className="settings-builder-pill">
                          {step.stepOrder}. {step.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="settings-empty-state">
                <strong>Save the rule set first</strong>
                <p>Simulation is available once the rule set exists on the server.</p>
              </div>
            )}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
