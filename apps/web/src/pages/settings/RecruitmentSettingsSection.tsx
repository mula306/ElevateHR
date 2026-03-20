import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import {
  createApprovalRuleSet,
  createFundingType,
  createRequestType,
  listApprovalRuleSets,
  listFundingTypes,
  listRequestTypes,
  publishApprovalRuleSet,
  updateApprovalRuleSet,
  updateFundingType,
  updateRequestType,
} from './settings.api';
import type {
  ApprovalRuleSetPayload,
  ApprovalRuleSetRecord,
  FundingTypeRecord,
  RequestTypeRecord,
} from '@/pages/recruitment/recruitment.api';

type RecruitmentConfigTab = 'request-types' | 'funding-types' | 'rule-sets';
type EditorState =
  | null
  | { type: 'request-type'; id: string | null }
  | { type: 'funding-type'; id: string | null }
  | { type: 'rule-set'; id: string | null };

type RuleSetFormState = {
  name: string;
  description: string;
  status: 'Draft' | 'Active' | 'Archived';
  version: string;
  rulesJson: string;
};

const emptyRequestType = {
  code: '',
  name: '',
  description: '',
  fieldSchema: '[]',
  isActive: true,
};

const emptyFundingType = {
  code: '',
  name: '',
  category: '',
  description: '',
  durationType: '',
  isPermanent: false,
  isActive: true,
};

const emptyRuleSet: RuleSetFormState = {
  name: '',
  description: '',
  status: 'Draft',
  version: '1',
  rulesJson: '[]',
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

export function RecruitmentSettingsSection() {
  const [activeTab, setActiveTab] = useState<RecruitmentConfigTab>('request-types');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived' | 'draft'>('all');
  const [requestTypes, setRequestTypes] = useState<RequestTypeRecord[]>([]);
  const [fundingTypes, setFundingTypes] = useState<FundingTypeRecord[]>([]);
  const [ruleSets, setRuleSets] = useState<ApprovalRuleSetRecord[]>([]);
  const [requestTypeForm, setRequestTypeForm] = useState(emptyRequestType);
  const [fundingTypeForm, setFundingTypeForm] = useState(emptyFundingType);
  const [ruleSetForm, setRuleSetForm] = useState<RuleSetFormState>(emptyRuleSet);
  const [editor, setEditor] = useState<EditorState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRecruitmentSettings() {
    setLoading(true);
    setError(null);

    try {
      const [nextRequestTypes, nextFundingTypes, nextRuleSets] = await Promise.all([
        listRequestTypes(),
        listFundingTypes(),
        listApprovalRuleSets(),
      ]);

      setRequestTypes(nextRequestTypes);
      setFundingTypes(nextFundingTypes);
      setRuleSets(nextRuleSets);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load recruitment configuration.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecruitmentSettings();
  }, []);

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

  const openRequestTypeEditor = (record?: RequestTypeRecord) => {
    setError(null);
    setEditor({ type: 'request-type', id: record?.id ?? null });
    setRequestTypeForm(record ? {
      code: record.code,
      name: record.name,
      description: record.description ?? '',
      fieldSchema: JSON.stringify(record.fieldSchema, null, 2),
      isActive: record.isActive,
    } : emptyRequestType);
  };

  const openFundingTypeEditor = (record?: FundingTypeRecord) => {
    setError(null);
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
    setEditor({ type: 'rule-set', id: record?.id ?? null });
    setRuleSetForm(record ? {
      name: record.name,
      description: record.description ?? '',
      status: record.status,
      version: String(record.version),
      rulesJson: JSON.stringify(record.rules, null, 2),
    } : emptyRuleSet);
  };

  const closeEditor = () => {
    setEditor(null);
    setRequestTypeForm(emptyRequestType);
    setFundingTypeForm(emptyFundingType);
    setRuleSetForm(emptyRuleSet);
  };

  const saveRequestType = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        code: requestTypeForm.code.trim(),
        name: requestTypeForm.name.trim(),
        description: requestTypeForm.description.trim() || null,
        fieldSchema: requestTypeForm.fieldSchema.trim() || '[]',
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

  const saveRuleSet = async () => {
    setSaving(true);
    setError(null);

    try {
      const parsedRules = JSON.parse(ruleSetForm.rulesJson) as ApprovalRuleSetPayload['rules'];
      const payload: ApprovalRuleSetPayload = {
        name: ruleSetForm.name.trim(),
        description: ruleSetForm.description.trim() || null,
        status: ruleSetForm.status,
        version: Number(ruleSetForm.version || '1'),
        scopeOrgUnitId: null,
        effectiveStartDate: null,
        effectiveEndDate: null,
        rules: parsedRules,
      };

      const nextRuleSets = editor?.id
        ? await updateApprovalRuleSet(editor.id, payload)
        : await createApprovalRuleSet(payload);

      setRuleSets(nextRuleSets);
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the approval rule set. Check the JSON before saving.');
    } finally {
      setSaving(false);
    }
  };

  const publishRuleSet = async (id: string) => {
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
            <p className="card-subtitle">Break request types, funding types, and routing rules into separate working surfaces instead of one stacked configuration block.</p>
          </div>
          <button type="button" className="button button-outline" onClick={() => { void loadRecruitmentSettings(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
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

        <div className="settings-toolbar-grid">
          <label className="settings-toolbar-field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter records in the active tab" />
          </label>
          <label className="settings-toolbar-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'archived' | 'draft')}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <div className="settings-toolbar-actions settings-toolbar-actions-end">
            {activeTab === 'request-types' ? <button type="button" className="button" onClick={() => openRequestTypeEditor()}>Add request type</button> : null}
            {activeTab === 'funding-types' ? <button type="button" className="button" onClick={() => openFundingTypeEditor()}>Add funding type</button> : null}
            {activeTab === 'rule-sets' ? <button type="button" className="button" onClick={() => openRuleSetEditor()}>Add rule set</button> : null}
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
              <article key={record.id} className="settings-record-row settings-record-grid-recruitment-types">
                <div>
                  <strong>{record.name}</strong>
                  <p>{record.code}</p>
                </div>
                <span>{record.fieldSchema.length} fields</span>
                <span className={`badge ${record.isActive ? 'badge-success' : 'badge-warning'}`}>{record.isActive ? 'Active' : 'Archived'}</span>
                <span>{formatDateTime(record.updatedAt)}</span>
                <div className="settings-record-actions">
                  <button type="button" className="button button-outline button-small" onClick={() => openRequestTypeEditor(record)}>Edit</button>
                </div>
              </article>
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
                <span>{record.durationType ?? 'Not set'}{record.isPermanent ? ' | Permanent' : ''}</span>
                <span className={`badge ${record.isActive ? 'badge-success' : 'badge-warning'}`}>{record.isActive ? 'Active' : 'Archived'}</span>
                <div className="settings-record-actions">
                  <button type="button" className="button button-outline button-small" onClick={() => openFundingTypeEditor(record)}>Edit</button>
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
              <article key={record.id} className="settings-record-row settings-record-grid-recruitment-rules">
                <div>
                  <strong>{record.name}</strong>
                  <p>{record.description ?? 'No description configured.'}</p>
                </div>
                <span>{record.version}</span>
                <span>{record.rules.length}</span>
                <span className={`badge ${record.status === 'Active' ? 'badge-success' : record.status === 'Archived' ? 'badge-warning' : 'badge-primary'}`}>{record.status}</span>
                <span>{formatDateTime(record.publishedAt)}</span>
                <div className="settings-record-actions">
                  <button type="button" className="button button-outline button-small" onClick={() => openRuleSetEditor(record)}>Edit</button>
                  {record.status !== 'Active' ? <button type="button" className="button button-small" onClick={() => { void publishRuleSet(record.id); }} disabled={saving}>Publish</button> : null}
                </div>
              </article>
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
          subtitle="Define the intake type and its dynamic field schema."
          onClose={closeEditor}
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveRequestType(); }} disabled={saving}>Save request type</button>
            </>
          )}
        >
          <DrawerField label="Code"><input value={requestTypeForm.code} onChange={(event) => setRequestTypeForm((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editor.id)} /></DrawerField>
          <DrawerField label="Name"><input value={requestTypeForm.name} onChange={(event) => setRequestTypeForm((current) => ({ ...current, name: event.target.value }))} /></DrawerField>
          <DrawerField label="Status">
            <select value={requestTypeForm.isActive ? 'active' : 'archived'} onChange={(event) => setRequestTypeForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </DrawerField>
          <DrawerField label="Description" fullWidth><textarea rows={3} value={requestTypeForm.description} onChange={(event) => setRequestTypeForm((current) => ({ ...current, description: event.target.value }))} /></DrawerField>
          <DrawerField label="Field schema JSON" fullWidth><textarea rows={10} value={requestTypeForm.fieldSchema} onChange={(event) => setRequestTypeForm((current) => ({ ...current, fieldSchema: event.target.value }))} /></DrawerField>
        </Drawer>
      ) : null}

      {editor?.type === 'funding-type' ? (
        <Drawer
          title={editor.id ? 'Edit funding type' : 'Create funding type'}
          subtitle="Configure the funding categories used by requests and approved positions."
          onClose={closeEditor}
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
          title={editor.id ? 'Edit rule set' : 'Create rule set'}
          subtitle="Keep JSON-based routing contained inside a dedicated editor drawer."
          onClose={closeEditor}
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveRuleSet(); }} disabled={saving}>Save rule set</button>
            </>
          )}
        >
          <DrawerField label="Name"><input value={ruleSetForm.name} onChange={(event) => setRuleSetForm((current) => ({ ...current, name: event.target.value }))} /></DrawerField>
          <DrawerField label="Version"><input type="number" min="1" max="999" value={ruleSetForm.version} onChange={(event) => setRuleSetForm((current) => ({ ...current, version: event.target.value }))} /></DrawerField>
          <DrawerField label="Status"><select value={ruleSetForm.status} onChange={(event) => setRuleSetForm((current) => ({ ...current, status: event.target.value as 'Draft' | 'Active' | 'Archived' }))}><option value="Draft">Draft</option><option value="Active">Active</option><option value="Archived">Archived</option></select></DrawerField>
          <DrawerField label="Description" fullWidth><textarea rows={3} value={ruleSetForm.description} onChange={(event) => setRuleSetForm((current) => ({ ...current, description: event.target.value }))} /></DrawerField>
          <DrawerField label="Rules JSON" fullWidth><textarea rows={14} value={ruleSetForm.rulesJson} onChange={(event) => setRuleSetForm((current) => ({ ...current, rulesJson: event.target.value }))} /></DrawerField>
        </Drawer>
      ) : null}
    </div>
  );
}

function Drawer({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="settings-overlay settings-overlay-drawer" role="presentation">
      <div className="settings-drawer" role="dialog" aria-modal="true">
        <div className="settings-drawer-header">
          <div><h2 className="card-title">{title}</h2><p className="card-subtitle">{subtitle}</p></div>
          <button type="button" className="button button-outline button-small" onClick={onClose}>Close</button>
        </div>
        <div className="settings-drawer-body">{children}</div>
        <div className="settings-drawer-footer">{footer}</div>
      </div>
    </div>
  );
}

function DrawerField({ label, children, fullWidth = false }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return <label className={`settings-drawer-field ${fullWidth ? 'settings-drawer-field-full' : ''}`}><span>{label}</span>{children}</label>;
}
