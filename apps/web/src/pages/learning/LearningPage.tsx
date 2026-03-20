import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bot, LoaderCircle, Plus, RefreshCcw, ShieldAlert } from 'lucide-react';
import { listEmployees, type Employee } from '@/pages/employees/employees.api';
import { listActiveSkillTaxonomy, type SkillCategoryRecord } from '@/pages/my-profile/my-profile.api';
import { listClassifications, listOrgUnits, listPositions, type ClassificationRecord, type OrgUnitRecord, type PositionRecord } from '@/pages/organization/organization.api';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import {
  cancelLearningAssignment,
  createLearningAssignment,
  createLearningPath,
  createLearningRule,
  getLearningSummary,
  listLearningAssignments,
  listLearningCatalog,
  listLearningPaths,
  listLearningProviders,
  listLearningRules,
  syncLearningProvider,
  updateLearningAssignment,
  updateLearningPath,
  updateLearningRule,
  type LearningAssignmentPayload,
  type LearningRulePayload,
  type LearningContentRecord,
  type LearningAssignmentRecord,
  type LearningPathRecord,
  type LearningProviderRecord,
  type LearningRuleRecord,
  type LearningSummary,
  updateLearningContentSkills,
} from './learning.api';
import './LearningPage.css';

type LearningTab = 'overview' | 'catalog' | 'assignments' | 'paths' | 'providers';
type AudienceType = 'Employee' | 'Org Unit' | 'Position' | 'Classification' | 'Manager';

interface AssignmentFormState {
  assignmentType: 'Content' | 'Path';
  contentId: string;
  pathId: string;
  audienceType: AudienceType;
  audienceId: string;
  requirementType: 'Required' | 'Recommended';
  dueDate: string;
  renewalDays: string;
  mandatory: boolean;
  notes: string;
}

interface PathFormState {
  code: string;
  name: string;
  description: string;
  status: 'Active' | 'Inactive';
  itemContentIds: string[];
}

interface RuleFormState {
  assignmentType: 'Content' | 'Path';
  contentId: string;
  pathId: string;
  audienceType: AudienceType;
  audienceId: string;
  requirementType: 'Required' | 'Recommended';
  defaultDueDays: string;
  renewalDays: string;
  mandatory: boolean;
  isActive: boolean;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value)) : 'TBD';
}

function formatDuration(minutes: number | null) {
  if (!minutes) {
    return 'Self-paced';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function emptyAssignmentForm() {
  return { assignmentType: 'Content', contentId: '', pathId: '', audienceType: 'Employee', audienceId: '', requirementType: 'Required', dueDate: '', renewalDays: '', mandatory: false, notes: '' } satisfies AssignmentFormState;
}

function emptyPathForm() {
  return { code: '', name: '', description: '', status: 'Active', itemContentIds: [] } satisfies PathFormState;
}

function emptyRuleForm() {
  return { assignmentType: 'Content', contentId: '', pathId: '', audienceType: 'Org Unit', audienceId: '', requirementType: 'Required', defaultDueDays: '', renewalDays: '', mandatory: false, isActive: true } satisfies RuleFormState;
}

export function LearningPage() {
  const { session } = useAppSession();
  const currentEmployeeId = session?.account?.employeeId ?? null;
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [catalog, setCatalog] = useState<LearningContentRecord[]>([]);
  const [assignments, setAssignments] = useState<LearningAssignmentRecord[]>([]);
  const [paths, setPaths] = useState<LearningPathRecord[]>([]);
  const [rules, setRules] = useState<LearningRuleRecord[]>([]);
  const [providers, setProviders] = useState<LearningProviderRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRecord[]>([]);
  const [skillTaxonomy, setSkillTaxonomy] = useState<SkillCategoryRecord[]>([]);
  const [tab, setTab] = useState<LearningTab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentEditor, setAssignmentEditor] = useState<LearningAssignmentRecord | null>(null);
  const [pathEditor, setPathEditor] = useState<LearningPathRecord | null>(null);
  const [ruleEditor, setRuleEditor] = useState<LearningRuleRecord | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm);
  const [pathForm, setPathForm] = useState<PathFormState>(emptyPathForm);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);
  const [contentSkillEditor, setContentSkillEditor] = useState<LearningContentRecord | null>(null);
  const [contentSkillSelections, setContentSkillSelections] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSummary = await getLearningSummary();
      const [nextCatalog, nextAssignments, nextPaths, employeeResult, nextSkillTaxonomy] = await Promise.all([
        listLearningCatalog(),
        listLearningAssignments(),
        listLearningPaths(),
        listEmployees({ limit: 100 }),
        listActiveSkillTaxonomy(),
      ]);

      setSummary(nextSummary);
      setCatalog(nextCatalog);
      setAssignments(nextAssignments);
      setPaths(nextPaths);
      setEmployees(employeeResult.data);
      setSkillTaxonomy(nextSkillTaxonomy);

      if (nextSummary.access.isHrAdmin) {
        const [nextRules, nextProviders, nextOrgUnits, nextPositions, nextClassifications] = await Promise.all([
          listLearningRules(),
          listLearningProviders(),
          listOrgUnits(false),
          listPositions(false),
          listClassifications(false),
        ]);

        setRules(nextRules);
        setProviders(nextProviders);
        setOrgUnits(nextOrgUnits);
        setPositions(nextPositions);
        setClassifications(nextClassifications);
      } else {
        setRules([]);
        setProviders([]);
        setOrgUnits([]);
        setPositions([]);
        setClassifications([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the learning workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isHrAdmin = summary?.access.isHrAdmin ?? false;
  const activeCatalog = useMemo(() => catalog.filter((item) => item.contentStatus === 'Active'), [catalog]);
  const manageableEmployees = useMemo(() => (isHrAdmin ? employees : employees.filter((employee) => employee.managerId === currentEmployeeId)).filter((employee) => employee.status !== 'Terminated'), [currentEmployeeId, employees, isHrAdmin]);
  const managerAudience = useMemo(() => employees.filter((employee) => employees.some((candidate) => candidate.managerId === employee.id && candidate.status !== 'Terminated')), [employees]);
  const availableTabs = isHrAdmin ? (['overview', 'catalog', 'assignments', 'paths', 'providers'] as LearningTab[]) : (['overview', 'catalog', 'assignments', 'paths'] as LearningTab[]);
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

  const saveContentSkills = async () => {
    if (!contentSkillEditor) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updatedContent = await updateLearningContentSkills(contentSkillEditor.id, contentSkillSelections);
      setCatalog((current) => current.map((item) => item.id === updatedContent.id ? updatedContent : item));
      setContentSkillEditor(null);
      setContentSkillSelections([]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update the content skills.');
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async () => {
    setSaving(true);
    setError(null);

    try {
      if (assignmentEditor) {
        await updateLearningAssignment(assignmentEditor.id, {
          requirementType: assignmentForm.requirementType,
          dueDate: assignmentForm.dueDate || null,
          renewalDays: assignmentForm.renewalDays ? Number(assignmentForm.renewalDays) : null,
          mandatory: assignmentForm.mandatory,
          notes: assignmentForm.notes.trim() || null,
        });
      } else {
        const payload: LearningAssignmentPayload = {
          assignmentType: assignmentForm.assignmentType,
          contentId: assignmentForm.assignmentType === 'Content' ? assignmentForm.contentId : null,
          pathId: assignmentForm.assignmentType === 'Path' ? assignmentForm.pathId : null,
          employeeId: assignmentForm.audienceType === 'Employee' ? assignmentForm.audienceId : null,
          orgUnitId: assignmentForm.audienceType === 'Org Unit' ? assignmentForm.audienceId : null,
          positionId: assignmentForm.audienceType === 'Position' ? assignmentForm.audienceId : null,
          classificationId: assignmentForm.audienceType === 'Classification' ? assignmentForm.audienceId : null,
          requirementType: assignmentForm.requirementType,
          dueDate: assignmentForm.dueDate || null,
          renewalDays: assignmentForm.renewalDays ? Number(assignmentForm.renewalDays) : null,
          mandatory: assignmentForm.mandatory,
          notes: assignmentForm.notes.trim() || null,
        };

        await createLearningAssignment(payload);
      }

      setAssignmentEditor(null);
      setAssignmentForm(emptyAssignmentForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the learning assignment.');
    } finally {
      setSaving(false);
    }
  };

  const savePath = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        code: pathForm.code.trim(),
        name: pathForm.name.trim(),
        description: pathForm.description.trim() || null,
        status: pathForm.status,
        itemContentIds: pathForm.itemContentIds,
      };

      if (pathEditor) {
        await updateLearningPath(pathEditor.id, payload);
      } else {
        await createLearningPath(payload);
      }

      setPathEditor(null);
      setPathForm(emptyPathForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the learning path.');
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async () => {
    setSaving(true);
    setError(null);

    try {
      if (ruleEditor) {
        await updateLearningRule(ruleEditor.id, {
          requirementType: ruleForm.requirementType,
          defaultDueDays: ruleForm.defaultDueDays ? Number(ruleForm.defaultDueDays) : null,
          renewalDays: ruleForm.renewalDays ? Number(ruleForm.renewalDays) : null,
          mandatory: ruleForm.mandatory,
          isActive: ruleForm.isActive,
        });
      } else {
        const payload: LearningRulePayload = {
          assignmentType: ruleForm.assignmentType,
          contentId: ruleForm.assignmentType === 'Content' ? ruleForm.contentId : null,
          pathId: ruleForm.assignmentType === 'Path' ? ruleForm.pathId : null,
          orgUnitId: ruleForm.audienceType === 'Org Unit' ? ruleForm.audienceId : null,
          positionId: ruleForm.audienceType === 'Position' ? ruleForm.audienceId : null,
          classificationId: ruleForm.audienceType === 'Classification' ? ruleForm.audienceId : null,
          managerEmployeeId: ruleForm.audienceType === 'Manager' ? ruleForm.audienceId : null,
          requirementType: ruleForm.requirementType,
          defaultDueDays: ruleForm.defaultDueDays ? Number(ruleForm.defaultDueDays) : null,
          renewalDays: ruleForm.renewalDays ? Number(ruleForm.renewalDays) : null,
          mandatory: ruleForm.mandatory,
          isActive: ruleForm.isActive,
        };

        await createLearningRule(payload);
      }

      setRuleEditor(null);
      setRuleForm(emptyRuleForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the automation rule.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="learning-admin-page">
        <div className="card learning-admin-state">
          <LoaderCircle className="learning-admin-spin" size={18} />
          <span>Loading learning workspace...</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="learning-admin-page">
        <div className="card learning-admin-state">
          <ShieldAlert size={18} />
          <span>{error ?? 'Unable to load the learning workspace.'}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="learning-admin-page">
      <div className="card learning-admin-hero">
        <div className="page-header learning-admin-header">
          <div>
            <span className="learning-admin-eyebrow">Management</span>
            <h1 className="page-title">Learning</h1>
            <p className="page-subtitle">Provider-backed learning operations with assignment controls, curated paths, automation rules, and compliance visibility.</p>
          </div>
          <div className="learning-admin-header-actions">
            <button type="button" className="button button-outline" onClick={() => { void loadData(); }}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <button type="button" className="button" onClick={() => { setAssignmentEditor(null); setAssignmentForm(emptyAssignmentForm()); }}>
              <Plus size={16} />
              New assignment
            </button>
          </div>
        </div>
        {error ? <div className="learning-admin-banner learning-admin-banner-error"><ShieldAlert size={16} /><span>{error}</span></div> : null}
        <div className="learning-admin-summary-grid">
          <MetricCard label="Active assignments" value={summary.management.activeAssignments} detail="Manual and automated learning currently in scope" />
          <MetricCard label="Compliance rate" value={`${summary.management.complianceRate}%`} detail="Required learning completed across the current scope" />
          <MetricCard label="Overdue learners" value={summary.management.overdueLearners} detail="Learners past due and still open" />
          <MetricCard label="Renewals" value={summary.management.certificateRenewals} detail="Certificates renewing in the next 30 days" />
        </div>
      </div>

      <div className="card">
        <div className="learning-admin-tab-list">
          {availableTabs.map((item) => (
            <button key={item} type="button" className={`learning-admin-tab ${tab === item ? 'learning-admin-tab-active' : ''}`} onClick={() => setTab(item)}>
              {item === 'overview' ? 'Overview' : item === 'catalog' ? 'Catalog' : item === 'assignments' ? 'Assignments' : item === 'paths' ? 'Paths' : 'Providers'}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <div className="learning-admin-overview-grid">
            <Panel title="Compliance pressure" subtitle="Assignments driving the most due and overdue activity.">
              {assignments.slice(0, 6).map((assignment) => (
                <ListRow key={assignment.id} title={assignment.content?.title ?? assignment.path?.name ?? 'Learning item'} meta={`${assignment.audience.label} | ${assignment.counts.assigned} assigned | ${assignment.counts.overdue} overdue`} badge={assignment.status} />
              ))}
              {assignments.length === 0 ? <EmptyInline message="No assignments are currently in scope." /> : null}
            </Panel>

            <Panel
              title="Automation rules"
              subtitle="HR-owned auto-enrollment by org structure, role, or manager."
              action={isHrAdmin ? <button type="button" className="button button-outline" onClick={() => { setRuleEditor(null); setRuleForm(emptyRuleForm()); }}><Bot size={16} />New rule</button> : undefined}
            >
              {!isHrAdmin ? <EmptyInline message="Automation rules are administered by HR." /> : null}
              {isHrAdmin && rules.map((rule) => (
                <div key={rule.id} className="learning-admin-row-shell">
                  <ListRow title={rule.content?.title ?? rule.path?.name ?? 'Learning item'} meta={`${rule.audience} | ${rule.recordCount} records`} badge={rule.isActive ? 'Active' : 'Paused'} />
                  <button
                    type="button"
                    className="button button-outline button-small"
                    onClick={() => {
                      setRuleEditor(rule);
                      setRuleForm({
                        assignmentType: rule.assignmentType as 'Content' | 'Path',
                        contentId: rule.content?.id ?? '',
                        pathId: rule.path?.id ?? '',
                        audienceType: 'Org Unit',
                        audienceId: '',
                        requirementType: rule.requirementType as 'Required' | 'Recommended',
                        defaultDueDays: rule.defaultDueDays ? String(rule.defaultDueDays) : '',
                        renewalDays: rule.renewalDays ? String(rule.renewalDays) : '',
                        mandatory: rule.mandatory,
                        isActive: rule.isActive,
                      });
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {isHrAdmin && rules.length === 0 ? <EmptyInline message="No automation rules have been configured yet." /> : null}
            </Panel>
          </div>
        ) : null}

        {tab === 'catalog' ? (
          <div className="learning-admin-card-grid">
            {catalog.map((item) => (
              <article key={item.id} className="learning-admin-card">
                <div className="learning-admin-card-header">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.provider.displayName} | {item.modality} | {formatDuration(item.durationMinutes)}</p>
                  </div>
                  <span className={`badge ${item.contentStatus === 'Active' ? 'badge-success' : 'badge-warning'}`}>{item.contentStatus}</span>
                </div>
                {item.description ? <p className="learning-admin-copy">{item.description}</p> : null}
                {item.skills.length > 0 ? (
                  <div className="learning-admin-pill-list">
                    {item.skills.map((skill) => (
                      <span key={skill.id} className="learning-admin-skill-pill">{skill.category?.name ?? 'Skill'} | {skill.name}</span>
                    ))}
                  </div>
                ) : null}
                <div className="learning-admin-meta-grid">
                  <span><strong>Assignments:</strong> {item.assignmentCount}</span>
                  <span><strong>Paths:</strong> {item.pathCount}</span>
                  <span><strong>Certificate:</strong> {item.certificateEligible ? 'Yes' : 'No'}</span>
                  <span><strong>Last sync:</strong> {formatDate(item.lastSyncedAt)}</span>
                </div>
                {isHrAdmin ? (
                  <div className="learning-admin-actions">
                    <button type="button" className="button button-outline" onClick={() => { setContentSkillEditor(item); setContentSkillSelections(item.skills.map((skill) => skill.id)); }}>
                      Tag skills
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'assignments' ? (
          <div className="learning-admin-layout">
            <Panel title={assignmentEditor ? 'Edit assignment' : 'Create assignment'} subtitle={assignmentEditor ? 'Update due dates, requirement type, and guidance.' : 'Assign a course or path to an employee or structural audience.'}>
              <div className="learning-admin-form-grid">
                {!assignmentEditor ? (
                  <>
                    <Field label="Type"><select value={assignmentForm.assignmentType} onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentType: event.target.value as 'Content' | 'Path', contentId: '', pathId: '' }))}><option value="Content">Course</option><option value="Path">Path</option></select></Field>
                    <Field label={assignmentForm.assignmentType === 'Content' ? 'Course' : 'Path'}><select value={assignmentForm.assignmentType === 'Content' ? assignmentForm.contentId : assignmentForm.pathId} onChange={(event) => setAssignmentForm((current) => current.assignmentType === 'Content' ? { ...current, contentId: event.target.value } : { ...current, pathId: event.target.value })}><option value="">Select item</option>{(assignmentForm.assignmentType === 'Content' ? activeCatalog : paths).map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select></Field>
                    <Field label="Audience type"><select value={assignmentForm.audienceType} onChange={(event) => setAssignmentForm((current) => ({ ...current, audienceType: event.target.value as AudienceType, audienceId: '' }))} disabled={!isHrAdmin}><option value="Employee">Employee</option>{isHrAdmin ? <option value="Org Unit">Org Unit</option> : null}{isHrAdmin ? <option value="Position">Position</option> : null}{isHrAdmin ? <option value="Classification">Classification</option> : null}</select></Field>
                    <Field label="Audience"><select value={assignmentForm.audienceId} onChange={(event) => setAssignmentForm((current) => ({ ...current, audienceId: event.target.value }))}><option value="">Select audience</option>{assignmentForm.audienceType === 'Employee' ? manageableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} | {employee.firstName} {employee.lastName}</option>) : null}{assignmentForm.audienceType === 'Org Unit' ? orgUnits.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>) : null}{assignmentForm.audienceType === 'Position' ? positions.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.positionCode} | {item.title}</option>) : null}{assignmentForm.audienceType === 'Classification' ? classifications.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.code} | {item.title}</option>) : null}</select></Field>
                  </>
                ) : <div className="learning-admin-static"><strong>{assignmentEditor.content?.title ?? assignmentEditor.path?.name}</strong><span>{assignmentEditor.audience.label}</span></div>}
                <Field label="Requirement"><select value={assignmentForm.requirementType} onChange={(event) => setAssignmentForm((current) => ({ ...current, requirementType: event.target.value as 'Required' | 'Recommended' }))}><option value="Required">Required</option><option value="Recommended">Recommended</option></select></Field>
                <Field label="Due date"><input type="date" value={assignmentForm.dueDate} onChange={(event) => setAssignmentForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                <Field label="Renewal days"><input type="number" min="30" max="1095" value={assignmentForm.renewalDays} onChange={(event) => setAssignmentForm((current) => ({ ...current, renewalDays: event.target.value }))} /></Field>
                <Field label="Mandatory"><select value={assignmentForm.mandatory ? 'yes' : 'no'} onChange={(event) => setAssignmentForm((current) => ({ ...current, mandatory: event.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes</option></select></Field>
                <Field label="Notes" fullWidth><textarea rows={4} value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
              </div>
              <div className="learning-admin-actions"><button type="button" className="button button-outline" onClick={() => { setAssignmentEditor(null); setAssignmentForm(emptyAssignmentForm()); }}>Clear</button><button type="button" className="button" onClick={() => { void saveAssignment(); }} disabled={saving}>Save assignment</button></div>
            </Panel>

            <Panel title="Assignments" subtitle="Counts, due pressure, and cancellation controls.">
              {assignments.map((assignment) => (
                <article key={assignment.id} className="learning-admin-card">
                  <div className="learning-admin-card-header"><div><h3>{assignment.content?.title ?? assignment.path?.name ?? 'Learning item'}</h3><p>{assignment.audience.label} | {assignment.requirementType}</p></div><span className={`badge ${assignment.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{assignment.status}</span></div>
                  {assignment.notes ? <p className="learning-admin-copy">{assignment.notes}</p> : null}
                  <div className="learning-admin-meta-grid"><span><strong>Assigned:</strong> {assignment.counts.assigned}</span><span><strong>Completed:</strong> {assignment.counts.completed}</span><span><strong>Overdue:</strong> {assignment.counts.overdue}</span><span><strong>Renewals:</strong> {assignment.counts.certificateAlerts}</span><span><strong>Due:</strong> {formatDate(assignment.dueDate)}</span><span><strong>Renewal:</strong> {assignment.renewalDays ?? 'None'}</span></div>
                  <div className="learning-admin-actions">
                    {assignment.permissions.canEdit ? <button type="button" className="button button-outline" onClick={() => { setAssignmentEditor(assignment); setAssignmentForm({ assignmentType: assignment.assignmentType as 'Content' | 'Path', contentId: assignment.content?.id ?? '', pathId: assignment.path?.id ?? '', audienceType: 'Employee', audienceId: assignment.audience.id, requirementType: assignment.requirementType as 'Required' | 'Recommended', dueDate: assignment.dueDate?.slice(0, 10) ?? '', renewalDays: assignment.renewalDays ? String(assignment.renewalDays) : '', mandatory: assignment.mandatory, notes: assignment.notes ?? '' }); }}>Edit</button> : null}
                    {assignment.permissions.canCancel && assignment.status === 'Active' ? <button type="button" className="button button-outline" onClick={() => { void cancelLearningAssignment(assignment.id).then(loadData).catch((cancelError: unknown) => setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel the learning assignment.')); }}>Cancel</button> : null}
                  </div>
                </article>
              ))}
              {assignments.length === 0 ? <EmptyInline message="No learning assignments are currently in scope." /> : null}
            </Panel>
          </div>
        ) : null}

        {tab === 'paths' ? (
          <div className="learning-admin-layout">
            <Panel title={pathEditor ? 'Edit path' : 'Create path'} subtitle="Curate reusable sequences of provider-backed learning.">
              {isHrAdmin ? (
                <>
                  <div className="learning-admin-form-grid">
                    <Field label="Code"><input value={pathForm.code} onChange={(event) => setPathForm((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(pathEditor)} /></Field>
                    <Field label="Status"><select value={pathForm.status} onChange={(event) => setPathForm((current) => ({ ...current, status: event.target.value as 'Active' | 'Inactive' }))}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>
                    <Field label="Name" fullWidth><input value={pathForm.name} onChange={(event) => setPathForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                    <Field label="Description" fullWidth><textarea rows={3} value={pathForm.description} onChange={(event) => setPathForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                    <Field label="Path items" fullWidth><div className="learning-admin-checkbox-grid">{activeCatalog.map((item) => <label key={item.id} className="learning-admin-checkbox"><input type="checkbox" checked={pathForm.itemContentIds.includes(item.id)} onChange={(event) => setPathForm((current) => ({ ...current, itemContentIds: event.target.checked ? [...current.itemContentIds, item.id] : current.itemContentIds.filter((candidate) => candidate !== item.id) }))} /><span>{item.title}</span></label>)}</div></Field>
                  </div>
                  <div className="learning-admin-actions"><button type="button" className="button button-outline" onClick={() => { setPathEditor(null); setPathForm(emptyPathForm()); }}>Clear</button><button type="button" className="button" onClick={() => { void savePath(); }} disabled={saving}>Save path</button></div>
                </>
              ) : <EmptyInline message="Path authoring is administered by HR." />}
            </Panel>
            <Panel title="Learning paths" subtitle="Reusable role-based pathways and sequence details.">
              {paths.map((path) => (
                <article key={path.id} className="learning-admin-card">
                  <div className="learning-admin-card-header"><div><h3>{path.name}</h3><p>{path.code} | {path.itemCount} items | {path.assignmentCount} assignments</p></div><span className={`badge ${path.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{path.status}</span></div>
                  {path.description ? <p className="learning-admin-copy">{path.description}</p> : null}
                  <div className="learning-admin-list">{path.items.map((item) => <ListRow key={item.id} title={item.content.title} meta={`${item.content.providerName} | ${item.content.modality}`} badge={String(item.sortOrder + 1)} />)}</div>
                  {isHrAdmin ? <div className="learning-admin-actions"><button type="button" className="button button-outline" onClick={() => { setPathEditor(path); setPathForm({ code: path.code, name: path.name, description: path.description ?? '', status: path.status as 'Active' | 'Inactive', itemContentIds: path.items.map((item) => item.content.id) }); }}>Edit</button></div> : null}
                </article>
              ))}
              {paths.length === 0 ? <EmptyInline message="No learning paths are configured yet." /> : null}
            </Panel>
          </div>
        ) : null}

        {tab === 'providers' ? (
          <div className="learning-admin-card-grid">
            {providers.map((provider) => (
              <article key={provider.id} className="learning-admin-card">
                <div className="learning-admin-card-header"><div><h3>{provider.displayName}</h3><p>{provider.providerType} | {provider.syncMode}</p></div><span className={`badge ${provider.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{provider.status}</span></div>
                <div className="learning-admin-meta-grid"><span><strong>Catalog items:</strong> {provider.contentCount}</span><span><strong>Sync runs:</strong> {provider.syncRunCount}</span><span><strong>Last sync:</strong> {formatDate(provider.lastSyncCompletedAt)}</span><span><strong>Status:</strong> {provider.lastSyncStatus ?? 'Not started'}</span></div>
                {provider.lastSyncMessage ? <p className="learning-admin-copy">{provider.lastSyncMessage}</p> : null}
                <div className="learning-admin-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setSyncingProviderId(provider.id);
                      void syncLearningProvider(provider.id)
                        .then(loadData)
                        .catch((syncError: unknown) => setError(syncError instanceof Error ? syncError.message : 'Unable to sync the learning provider.'))
                        .finally(() => setSyncingProviderId(null));
                    }}
                    disabled={syncingProviderId === provider.id}
                  >
                    {syncingProviderId === provider.id ? <LoaderCircle className="learning-admin-spin" size={16} /> : <RefreshCcw size={16} />}
                    Sync catalog
                  </button>
                </div>
              </article>
            ))}
            {providers.length === 0 ? <EmptyInline message="No providers have been configured yet." /> : null}
          </div>
        ) : null}
      </div>

      {isHrAdmin && tab === 'overview' ? (
        <div className="card learning-admin-rule-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{ruleEditor ? 'Edit automation rule' : 'Create automation rule'}</h3>
              <p className="card-subtitle">Auto-enroll by org unit, position, classification, or manager scope.</p>
            </div>
          </div>
          <div className="learning-admin-form-grid">
            {!ruleEditor ? (
              <>
                <Field label="Type"><select value={ruleForm.assignmentType} onChange={(event) => setRuleForm((current) => ({ ...current, assignmentType: event.target.value as 'Content' | 'Path', contentId: '', pathId: '' }))}><option value="Content">Course</option><option value="Path">Path</option></select></Field>
                <Field label={ruleForm.assignmentType === 'Content' ? 'Course' : 'Path'}><select value={ruleForm.assignmentType === 'Content' ? ruleForm.contentId : ruleForm.pathId} onChange={(event) => setRuleForm((current) => current.assignmentType === 'Content' ? { ...current, contentId: event.target.value } : { ...current, pathId: event.target.value })}><option value="">Select item</option>{(ruleForm.assignmentType === 'Content' ? activeCatalog : paths).map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select></Field>
                <Field label="Audience type"><select value={ruleForm.audienceType} onChange={(event) => setRuleForm((current) => ({ ...current, audienceType: event.target.value as AudienceType, audienceId: '' }))}><option value="Org Unit">Org Unit</option><option value="Position">Position</option><option value="Classification">Classification</option><option value="Manager">Manager</option></select></Field>
                <Field label="Audience"><select value={ruleForm.audienceId} onChange={(event) => setRuleForm((current) => ({ ...current, audienceId: event.target.value }))}><option value="">Select audience</option>{ruleForm.audienceType === 'Org Unit' ? orgUnits.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>) : null}{ruleForm.audienceType === 'Position' ? positions.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.positionCode} | {item.title}</option>) : null}{ruleForm.audienceType === 'Classification' ? classifications.filter((item) => item.recordStatus === 'Active').map((item) => <option key={item.id} value={item.id}>{item.code} | {item.title}</option>) : null}{ruleForm.audienceType === 'Manager' ? managerAudience.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} | {employee.firstName} {employee.lastName}</option>) : null}</select></Field>
              </>
            ) : <div className="learning-admin-static"><strong>{ruleEditor.content?.title ?? ruleEditor.path?.name}</strong><span>{ruleEditor.audience}</span></div>}
            <Field label="Requirement"><select value={ruleForm.requirementType} onChange={(event) => setRuleForm((current) => ({ ...current, requirementType: event.target.value as 'Required' | 'Recommended' }))}><option value="Required">Required</option><option value="Recommended">Recommended</option></select></Field>
            <Field label="Default due days"><input type="number" min="0" max="365" value={ruleForm.defaultDueDays} onChange={(event) => setRuleForm((current) => ({ ...current, defaultDueDays: event.target.value }))} /></Field>
            <Field label="Renewal days"><input type="number" min="30" max="1095" value={ruleForm.renewalDays} onChange={(event) => setRuleForm((current) => ({ ...current, renewalDays: event.target.value }))} /></Field>
            <Field label="Mandatory"><select value={ruleForm.mandatory ? 'yes' : 'no'} onChange={(event) => setRuleForm((current) => ({ ...current, mandatory: event.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes</option></select></Field>
            <Field label="Status"><select value={ruleForm.isActive ? 'active' : 'paused'} onChange={(event) => setRuleForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}><option value="active">Active</option><option value="paused">Paused</option></select></Field>
          </div>
          <div className="learning-admin-actions"><button type="button" className="button button-outline" onClick={() => { setRuleEditor(null); setRuleForm(emptyRuleForm()); }}>Clear</button><button type="button" className="button" onClick={() => { void saveRule(); }} disabled={saving}>Save rule</button></div>
        </div>
      ) : null}

      {contentSkillEditor ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card learning-admin-modal" role="dialog" aria-modal="true" aria-labelledby="learning-content-skills-title">
            <div className="modal-header">
              <div>
                <h2 id="learning-content-skills-title" className="card-title">Tag learning content to skills</h2>
                <p className="card-subtitle">{contentSkillEditor.title}</p>
              </div>
            </div>
            <div className="learning-admin-checkbox-grid">
              {skillTaxonomy.map((category) => (
                <div key={category.id} className="learning-admin-skill-group">
                  <strong>{category.name}</strong>
                  <div className="learning-admin-checkbox-grid">
                    {category.tags.map((tag) => (
                      <label key={tag.id} className="learning-admin-checkbox">
                        <input
                          type="checkbox"
                          checked={contentSkillSelections.includes(tag.id)}
                          onChange={(event) => setContentSkillSelections((current) => (
                            event.target.checked
                              ? [...current, tag.id]
                              : current.filter((candidate) => candidate !== tag.id)
                          ))}
                        />
                        <span>{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => { setContentSkillEditor(null); setContentSkillSelections([]); }}>Cancel</button>
              <button type="button" className="button" onClick={() => { void saveContentSkills(); }} disabled={saving}>Save skills</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="learning-admin-metric"><span className="learning-admin-metric-label">{label}</span><strong className="learning-admin-metric-value">{value}</strong><span className="learning-admin-metric-detail">{detail}</span></div>;
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return <section className="learning-admin-panel"><div className="card-header"><div><h3 className="card-title">{title}</h3><p className="card-subtitle">{subtitle}</p></div>{action}</div>{children}</section>;
}

function Field({ label, children, fullWidth = false }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return <label className={`learning-admin-field ${fullWidth ? 'learning-admin-field-full' : ''}`}><span>{label}</span>{children}</label>;
}

function ListRow({ title, meta, badge }: { title: string; meta: string; badge: string }) {
  return <div className="learning-admin-list-row"><div><div className="learning-admin-list-title">{title}</div><div className="learning-admin-list-meta">{meta}</div></div><span className="badge badge-warning">{badge}</span></div>;
}

function EmptyInline({ message }: { message: string }) {
  return <div className="learning-admin-empty">{message}</div>;
}
