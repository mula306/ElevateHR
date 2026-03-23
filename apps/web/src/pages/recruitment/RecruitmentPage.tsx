import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, PlayCircle, Plus, RefreshCcw, Search, ShieldAlert } from 'lucide-react';
import {
  approveJobRequest,
  createHiringRecord,
  createJobRequest,
  getRecruitmentSummary,
  listApprovalRuleSets,
  listFundingTypes,
  listJobRequests,
  listRequestTypes,
  rejectJobRequest,
  simulateApprovalRuleSet,
  submitJobRequest,
  updateJobRequest,
  type ApprovalRuleSetRecord,
  type FundingTypeRecord,
  type JobRequestPayload,
  type JobRequestRecord,
  type JobRequestStatus,
  type RequestTypeRecord,
} from './recruitment.api';
import {
  listClassifications,
  listLevels,
  listOrgUnits,
  listPositions,
  type ClassificationRecord,
  type LevelRecord,
  type OrgUnitRecord,
  type PositionRecord,
} from '@/pages/organization/organization.api';
import { Banner, CrudToolbar, PageHero } from '@/shared/ui/primitives';
import { validateDynamicFieldValue } from './dynamic-fields';
import './RecruitmentPage.css';

type RecruitmentTab = 'requests' | 'approvals' | 'hiring' | 'configuration';

interface RequestFormState {
  requestTypeId: string;
  fundingTypeId: string;
  orgUnitId: string;
  classificationId: string;
  levelId: string;
  reportsToPositionId: string;
  targetPositionId: string;
  title: string;
  headcount: string;
  fte: string;
  weeklyHours: string;
  justification: string;
  businessCase: string;
  budgetImpacting: boolean;
  fieldValues: Record<string, string>;
}

const tabs: Array<{ id: RecruitmentTab; label: string }> = [
  { id: 'requests', label: 'Requests' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'configuration', label: 'Configuration' },
];

const emptyForm: RequestFormState = {
  requestTypeId: '',
  fundingTypeId: '',
  orgUnitId: '',
  classificationId: '',
  levelId: '',
  reportsToPositionId: '',
  targetPositionId: '',
  title: '',
  headcount: '1',
  fte: '1',
  weeklyHours: '40',
  justification: '',
  businessCase: '',
  budgetImpacting: false,
  fieldValues: {},
};

function formatShortDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function getStatusBadge(status: string) {
  if (status === 'Approved' || status === 'Closed') return 'badge-success';
  if (status === 'Rejected' || status === 'Cancelled') return 'badge-danger';
  if (status === 'Needs Rework') return 'badge-warning';
  return 'badge-primary';
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="recruitment-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="card recruitment-summary-card">
      <span className="recruitment-summary-label">{label}</span>
      <strong className="recruitment-summary-value">{value.toLocaleString()}</strong>
      <span className="recruitment-summary-detail">{detail}</span>
    </article>
  );
}

export function RecruitmentPage() {
  const [tab, setTab] = useState<RecruitmentTab>('requests');
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getRecruitmentSummary>> | null>(null);
  const [requests, setRequests] = useState<JobRequestRecord[]>([]);
  const [requestTypes, setRequestTypes] = useState<RequestTypeRecord[]>([]);
  const [fundingTypes, setFundingTypes] = useState<FundingTypeRecord[]>([]);
  const [ruleSets, setRuleSets] = useState<ApprovalRuleSetRecord[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRecord[]>([]);
  const [levels, setLevels] = useState<LevelRecord[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [form, setForm] = useState<RequestFormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobRequestStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<Awaited<ReturnType<typeof simulateApprovalRuleSet>> | null>(null);
  const [simulationRuleSetId, setSimulationRuleSetId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSummary, nextRequests, nextRequestTypes, nextFundingTypes, nextRuleSets, nextOrgUnits, nextClassifications, nextLevels, nextPositions] = await Promise.all([
        getRecruitmentSummary(),
        listJobRequests({}),
        listRequestTypes(),
        listFundingTypes(),
        listApprovalRuleSets(),
        listOrgUnits(false),
        listClassifications(false),
        listLevels(false),
        listPositions(false),
      ]);

      setSummary(nextSummary);
      setRequests(nextRequests);
      setRequestTypes(nextRequestTypes.filter((record) => record.isActive));
      setFundingTypes(nextFundingTypes.filter((record) => record.isActive));
      setRuleSets(nextRuleSets);
      setOrgUnits(nextOrgUnits.filter((record) => record.recordStatus === 'Active'));
      setClassifications(nextClassifications.filter((record) => record.recordStatus === 'Active'));
      setLevels(nextLevels.filter((record) => record.recordStatus === 'Active'));
      setPositions(nextPositions.filter((record) => record.recordStatus === 'Active'));
      setSelectedRequestId((current) => current ?? nextRequests[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load recruitment workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRequestType = useMemo(
    () => requestTypes.find((record) => record.id === form.requestTypeId) ?? null,
    [form.requestTypeId, requestTypes],
  );

  const visibleLevels = useMemo(
    () => levels.filter((record) => !form.classificationId || record.classificationId === form.classificationId),
    [form.classificationId, levels],
  );

  const visibleRequests = useMemo(() => requests.filter((request) => {
    if (statusFilter && request.status !== statusFilter) return false;
    if (!search.trim()) return true;
    return `${request.requestNumber} ${request.title} ${request.requestor?.fullName ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [requests, search, statusFilter]);

  const selectedRequest = useMemo(
    () => visibleRequests.find((request) => request.id === selectedRequestId) ?? visibleRequests[0] ?? null,
    [selectedRequestId, visibleRequests],
  );

  const openCreate = () => {
    setEditingRequestId(null);
    setForm(emptyForm);
  };

  const openEdit = (request: JobRequestRecord) => {
    setEditingRequestId(request.id);
    setForm({
      requestTypeId: request.requestType?.id ?? '',
      fundingTypeId: request.fundingType?.id ?? '',
      orgUnitId: request.orgUnit?.id ?? '',
      classificationId: request.classification?.id ?? '',
      levelId: request.level?.id ?? '',
      reportsToPositionId: request.reportsToPosition?.id ?? '',
      targetPositionId: request.targetPosition?.id ?? '',
      title: request.title,
      headcount: String(request.headcount),
      fte: String(request.fte),
      weeklyHours: String(request.weeklyHours),
      justification: request.justification ?? '',
      businessCase: request.businessCase ?? '',
      budgetImpacting: request.budgetImpacting,
      fieldValues: Object.fromEntries(request.fieldValues.map((field) => [field.fieldKey, field.value ?? ''])),
    });
  };

  const saveRequest = async () => {
    const dynamicFieldError = (selectedRequestType?.fieldSchema ?? [])
      .map((field) => validateDynamicFieldValue(field, form.fieldValues[field.key] ?? ''))
      .find(Boolean);

    if (dynamicFieldError) {
      setError(dynamicFieldError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: JobRequestPayload = {
        requestTypeId: form.requestTypeId,
        fundingTypeId: form.fundingTypeId,
        orgUnitId: form.orgUnitId,
        classificationId: form.classificationId,
        levelId: form.levelId,
        reportsToPositionId: form.reportsToPositionId || null,
        targetPositionId: form.targetPositionId || null,
        title: form.title.trim(),
        headcount: Number(form.headcount || '1'),
        fte: Number(form.fte || '1'),
        weeklyHours: Number(form.weeklyHours || '40'),
        justification: form.justification.trim() || null,
        businessCase: form.businessCase.trim() || null,
        budgetImpacting: form.budgetImpacting,
        fieldValues: (selectedRequestType?.fieldSchema ?? []).map((field) => ({
          fieldKey: field.key,
          fieldLabel: field.label,
          valueType: field.type,
          value: form.fieldValues[field.key] ?? '',
        })),
      };

      const saved = editingRequestId
        ? await updateJobRequest(editingRequestId, payload)
        : await createJobRequest(payload);

      setSelectedRequestId(saved.id);
      openCreate();
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the request.');
    } finally {
      setSaving(false);
    }
  };

  const submitSelected = async () => {
    if (!selectedRequest) return;
    setSaving(true);
    setError(null);
    try {
      await submitJobRequest(selectedRequest.id);
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit the request.');
    } finally {
      setSaving(false);
    }
  };

  const approveSelected = async () => {
    if (!selectedRequest) return;
    setSaving(true);
    setError(null);
    try {
      await approveJobRequest(selectedRequest.id);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to approve the request.');
    } finally {
      setSaving(false);
    }
  };

  const rejectSelected = async () => {
    if (!selectedRequest) return;
    setSaving(true);
    setError(null);
    try {
      await rejectJobRequest(selectedRequest.id);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to reject the request.');
    } finally {
      setSaving(false);
    }
  };

  const captureHiring = async () => {
    if (!selectedRequest) return;
    setSaving(true);
    setError(null);
    try {
      await createHiringRecord(selectedRequest.id, {
        selectedEmployeeId: selectedRequest.hiringRecord?.selectedEmployee?.id ?? null,
        candidateName: selectedRequest.hiringRecord?.candidateName ?? selectedRequest.requestor?.fullName ?? '',
        competitionNumber: selectedRequest.hiringRecord?.competitionNumber ?? `${selectedRequest.requestNumber}-COMP`,
        compensationAmount: selectedRequest.level?.rangeMin ?? 0,
        payFrequency: 'Biweekly',
        hireDate: new Date().toISOString().slice(0, 10),
        notes: 'Captured from recruitment workspace.',
      });
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to capture hiring.');
    } finally {
      setSaving(false);
    }
  };

  const runSimulation = async () => {
    if (!simulationRuleSetId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await simulateApprovalRuleSet(simulationRuleSetId, {
        requestTypeId: form.requestTypeId,
        budgetImpacting: form.budgetImpacting,
        fundingTypeId: form.fundingTypeId,
        orgUnitId: form.orgUnitId,
        requestorRole: null,
      });
      setSimulationResult(result);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'Unable to simulate the route.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="recruitment-page">
        <div className="card recruitment-state">
          <LoaderCircle className="recruitment-spin" size={18} />
          <span>Loading recruitment workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <section className="recruitment-page">
      <PageHero
        eyebrow="Management"
        title="Recruitment"
        subtitle="Request intake, governed approvals, approved position changes, and hiring close-out."
        actions={(
          <>
            <button type="button" className="button button-outline" onClick={() => { void loadData(); }}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <button type="button" className="button" onClick={openCreate}>
              <Plus size={16} />
              New request
            </button>
          </>
        )}
        className="recruitment-hero"
      >
        {error ? <Banner tone="error" icon={<ShieldAlert size={16} />} className="recruitment-banner">{error}</Banner> : null}
        <div className="recruitment-summary-grid">
          <SummaryCard label="Requests" value={summary?.totalRequests ?? 0} detail="Visible request volume" />
          <SummaryCard label="In review" value={summary?.submitted ?? 0} detail="Submitted and in-flight approvals" />
          <SummaryCard label="Needs rework" value={summary?.needsRework ?? 0} detail="Returned or rejected requests" />
          <SummaryCard label="Approved" value={summary?.approved ?? 0} detail="Ready for hiring close-out" />
        </div>
      </PageHero>

      <div className="card recruitment-tabs">
        {tabs.map((item) => <button key={item.id} type="button" className={`recruitment-tab ${tab === item.id ? 'recruitment-tab-active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      <div className="recruitment-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{editingRequestId ? 'Edit request' : 'Request intake'}</h3>
              <p className="card-subtitle">Unified intake with dynamic request fields.</p>
            </div>
          </div>
          <div className="recruitment-form-grid">
            <label className="recruitment-field"><span>Request type</span><select value={form.requestTypeId} onChange={(event) => setForm((current) => ({ ...current, requestTypeId: event.target.value, fieldValues: {} }))}><option value="">Select</option>{requestTypes.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
            <label className="recruitment-field"><span>Funding type</span><select value={form.fundingTypeId} onChange={(event) => setForm((current) => ({ ...current, fundingTypeId: event.target.value }))}><option value="">Select</option>{fundingTypes.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
            <label className="recruitment-field"><span>Org unit</span><select value={form.orgUnitId} onChange={(event) => setForm((current) => ({ ...current, orgUnitId: event.target.value }))}><option value="">Select</option>{orgUnits.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
            <label className="recruitment-field"><span>Classification</span><select value={form.classificationId} onChange={(event) => setForm((current) => ({ ...current, classificationId: event.target.value, levelId: '' }))}><option value="">Select</option>{classifications.map((record) => <option key={record.id} value={record.id}>{record.code} | {record.title}</option>)}</select></label>
            <label className="recruitment-field"><span>Level</span><select value={form.levelId} onChange={(event) => setForm((current) => ({ ...current, levelId: event.target.value }))}><option value="">Select</option>{visibleLevels.map((record) => <option key={record.id} value={record.id}>{record.levelCode}</option>)}</select></label>
            <label className="recruitment-field"><span>Reports to</span><select value={form.reportsToPositionId} onChange={(event) => setForm((current) => ({ ...current, reportsToPositionId: event.target.value }))}><option value="">None</option>{positions.map((record) => <option key={record.id} value={record.id}>{record.positionCode} | {record.title}</option>)}</select></label>
            <label className="recruitment-field"><span>Target position</span><select value={form.targetPositionId} onChange={(event) => setForm((current) => ({ ...current, targetPositionId: event.target.value }))}><option value="">Net new</option>{positions.map((record) => <option key={record.id} value={record.id}>{record.positionCode} | {record.title}</option>)}</select></label>
            <label className="recruitment-field"><span>Title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="recruitment-field"><span>Headcount</span><input type="number" min="1" max="100" value={form.headcount} onChange={(event) => setForm((current) => ({ ...current, headcount: event.target.value }))} /></label>
            <label className="recruitment-field"><span>FTE</span><input type="number" min="0.1" step="0.1" value={form.fte} onChange={(event) => setForm((current) => ({ ...current, fte: event.target.value }))} /></label>
            <label className="recruitment-field"><span>Weekly hours</span><input type="number" min="1" max="168" value={form.weeklyHours} onChange={(event) => setForm((current) => ({ ...current, weeklyHours: event.target.value }))} /></label>
            <label className="recruitment-checkbox recruitment-field-wide"><input type="checkbox" checked={form.budgetImpacting} onChange={(event) => setForm((current) => ({ ...current, budgetImpacting: event.target.checked }))} /><span>Budget impacting</span></label>
            <label className="recruitment-field recruitment-field-wide"><span>Justification</span><textarea rows={3} value={form.justification} onChange={(event) => setForm((current) => ({ ...current, justification: event.target.value }))} /></label>
            <label className="recruitment-field recruitment-field-wide"><span>Business case</span><textarea rows={4} value={form.businessCase} onChange={(event) => setForm((current) => ({ ...current, businessCase: event.target.value }))} /></label>
            {(selectedRequestType?.fieldSchema ?? []).map((field) => {
              const fieldValue = form.fieldValues[field.key] ?? '';
              const fieldClassName = `recruitment-field ${field.type === 'textarea' ? 'recruitment-field-wide' : ''}`;
              const label = `${field.label}${field.required ? ' *' : ''}`;

              return (
                <label key={field.key} className={fieldClassName}>
                  <span>{label}</span>
                  {field.type === 'textarea' ? (
                    <textarea rows={3} value={fieldValue} onChange={(event) => setForm((current) => ({ ...current, fieldValues: { ...current.fieldValues, [field.key]: event.target.value } }))} />
                  ) : null}
                  {field.type === 'select' ? (
                    <select value={fieldValue} onChange={(event) => setForm((current) => ({ ...current, fieldValues: { ...current.fieldValues, [field.key]: event.target.value } }))}>
                      <option value="">Select</option>
                      {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : null}
                  {field.type === 'date' ? (
                    <input type="date" value={fieldValue} onChange={(event) => setForm((current) => ({ ...current, fieldValues: { ...current.fieldValues, [field.key]: event.target.value } }))} />
                  ) : null}
                  {field.type === 'number' ? (
                    <input type="number" value={fieldValue} onChange={(event) => setForm((current) => ({ ...current, fieldValues: { ...current.fieldValues, [field.key]: event.target.value } }))} />
                  ) : null}
                  {field.type === 'text' ? (
                    <input type="text" value={fieldValue} onChange={(event) => setForm((current) => ({ ...current, fieldValues: { ...current.fieldValues, [field.key]: event.target.value } }))} />
                  ) : null}
                </label>
              );
            })}
            <div className="recruitment-action-row recruitment-field-wide">
              <button type="button" className="button button-outline" onClick={openCreate}>Clear</button>
              <button type="button" className="button" onClick={() => { void saveRequest(); }} disabled={saving}>Save request</button>
              {tab === 'configuration' ? <button type="button" className="button button-outline" onClick={() => { void runSimulation(); }} disabled={saving || !simulationRuleSetId}>Simulate current form</button> : null}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{tab === 'configuration' ? 'Routing visibility' : 'Request queue'}</h3>
              <p className="card-subtitle">{tab === 'configuration' ? 'Operational visibility into rule sets and route simulation.' : 'Select a request to review lifecycle state and actions.'}</p>
            </div>
          </div>

          {tab !== 'configuration' ? (
            <>
              <CrudToolbar
                className="recruitment-filter-bar"
                controls={<label className="recruitment-field"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as JobRequestStatus | '')}><option value="">All</option>{['Draft', 'In Review', 'Rejected', 'Approved', 'Closed', 'Cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}
                search={<label className="recruitment-field recruitment-field-search"><span>Search</span><div className="recruitment-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Request number or title" /></div></label>}
              />
              <div className="recruitment-request-list">
                {visibleRequests.map((request) => (
                  <button key={request.id} type="button" className={`recruitment-request-card ${selectedRequest?.id === request.id ? 'recruitment-request-card-active' : ''}`} onClick={() => setSelectedRequestId(request.id)}>
                    <div className="recruitment-request-card-header"><strong>{request.requestNumber}</strong><span className={`badge ${getStatusBadge(request.status)}`}>{request.status}</span></div>
                    <p>{request.title}</p>
                    <span>{request.requestType?.name ?? 'Unconfigured type'} | {formatShortDate(request.submittedAt ?? request.createdAt)}</span>
                  </button>
                ))}
              </div>

              {selectedRequest ? (
                <div className="recruitment-detail-grid">
                  <DetailField label="Requestor" value={selectedRequest.requestor?.fullName ?? 'Not set'} />
                  <DetailField label="Org unit" value={selectedRequest.orgUnit?.name ?? 'Not set'} />
                  <DetailField label="Funding" value={selectedRequest.fundingType?.name ?? 'Not set'} />
                  <DetailField label="Linked position" value={selectedRequest.linkedPosition ? `${selectedRequest.linkedPosition.positionCode} | ${selectedRequest.linkedPosition.title}` : 'Not yet created'} />
                  <div className="recruitment-action-row recruitment-field-wide">
                    {['Draft', 'Rejected', 'Needs Rework'].includes(selectedRequest.status) ? <button type="button" className="button button-outline" onClick={() => openEdit(selectedRequest)}>Load for edit</button> : null}
                    {['Draft', 'Rejected', 'Needs Rework'].includes(selectedRequest.status) ? <button type="button" className="button" onClick={() => { void submitSelected(); }} disabled={saving}><PlayCircle size={16} />Submit</button> : null}
                    {selectedRequest.approvalSteps.some((step) => step.status === 'Pending') ? <button type="button" className="button" onClick={() => { void approveSelected(); }} disabled={saving}>Approve</button> : null}
                    {selectedRequest.approvalSteps.some((step) => step.status === 'Pending') ? <button type="button" className="button button-outline" onClick={() => { void rejectSelected(); }} disabled={saving}>Reject</button> : null}
                    {tab === 'hiring' && ['Approved', 'Closed'].includes(selectedRequest.status) && !selectedRequest.hiringRecord ? <button type="button" className="button" onClick={() => { void captureHiring(); }} disabled={saving}>Capture hire</button> : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="recruitment-configuration-stack">
              <label className="recruitment-field"><span>Rule set</span><select value={simulationRuleSetId} onChange={(event) => setSimulationRuleSetId(event.target.value)}><option value="">Select a rule set</option>{ruleSets.map((ruleSet) => <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>)}</select></label>
              <div className="recruitment-rule-list">
                {ruleSets.map((ruleSet) => <article key={ruleSet.id} className="recruitment-rule-card"><div className="recruitment-request-card-header"><strong>{ruleSet.name}</strong><span className={`badge ${getStatusBadge(ruleSet.status)}`}>{ruleSet.status}</span></div><p>{ruleSet.description || 'No description configured.'}</p><span>{ruleSet.rules.length} rules | version {ruleSet.version}</span></article>)}
              </div>
              {simulationResult ? <div className="recruitment-simulation-result"><strong>{simulationResult.matched ? simulationResult.rule?.name : 'No rule matched'}</strong><span>{simulationResult.steps.length} steps would be created.</span></div> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
