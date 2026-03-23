import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { listEmployees, type Employee } from '@/pages/employees/employees.api';
import { listClassifications, listOrgUnits, listPositions, type ClassificationRecord, type OrgUnitRecord, type PositionRecord } from '@/pages/organization/organization.api';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { Banner, Modal, PageHero } from '@/shared/ui/primitives';
import {
  approveManagementTimeCard,
  createLaborGroup,
  createManagementSchedule,
  createRuleProfile,
  createShiftTemplate,
  getManagementSummary,
  getManagementTimeCardDetail,
  listLaborGroups,
  listManagementExceptions,
  listManagementSchedules,
  listManagementTimeCards,
  listRuleProfiles,
  listShiftTemplates,
  publishManagementSchedule,
  rejectManagementTimeCard,
  updateLaborGroup,
  updateManagementSchedule,
  updateRuleProfile,
  updateShiftTemplate,
  type LaborGroupPayload,
  type LaborGroupRecord,
  type ManagementSummary,
  type RuleProfilePayload,
  type RuleProfileRecord,
  type SchedulePayload,
  type ScheduleShiftPayload,
  type ShiftTemplatePayload,
  type ShiftTemplateRecord,
  type TimeAttendanceException,
  type TimeCardRecord,
  type WorkScheduleRecord,
} from '@/pages/time-attendance/time-attendance.api';
import './WorkforceTimePage.css';

type WorkforceTab = 'schedule' | 'approvals' | 'exceptions' | 'rules' | 'coverage';

interface ScheduleFormState {
  orgUnitId: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
  shifts: ScheduleShiftPayload[];
}

function createEmptyShift(): ScheduleShiftPayload {
  const today = new Date().toISOString().slice(0, 10);
  return {
    employeeId: null,
    shiftTemplateId: null,
    shiftDate: today,
    startDateTime: `${today}T08:00`,
    endDateTime: `${today}T16:00`,
    breakMinutes: 30,
    status: 'Scheduled',
    notes: null,
  };
}

function createEmptyScheduleForm(): ScheduleFormState {
  return {
    orgUnitId: '',
    periodStart: '',
    periodEnd: '',
    notes: '',
    shifts: [createEmptyShift()],
  };
}

function formatShortDate(value: string | null) {
  if (!value) {
    return 'TBD';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function WorkforceTimePage() {
  const { session, refreshInboxSummary } = useAppSession();
  const [tab, setTab] = useState<WorkforceTab>('approvals');
  const [summary, setSummary] = useState<ManagementSummary | null>(null);
  const [schedules, setSchedules] = useState<WorkScheduleRecord[]>([]);
  const [timeCards, setTimeCards] = useState<TimeCardRecord[]>([]);
  const [exceptions, setExceptions] = useState<TimeAttendanceException[]>([]);
  const [laborGroups, setLaborGroups] = useState<LaborGroupRecord[]>([]);
  const [ruleProfiles, setRuleProfiles] = useState<RuleProfileRecord[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplateRecord[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<WorkScheduleRecord | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(createEmptyScheduleForm);
  const [decisionModal, setDecisionModal] = useState<{ action: 'approve' | 'reject'; timeCard: TimeCardRecord | null; comments: string } | null>(null);
  const [selectedTimeCard, setSelectedTimeCard] = useState<TimeCardRecord | null>(null);
  const [laborGroupDraft, setLaborGroupDraft] = useState<LaborGroupPayload>({ code: '', name: '', status: 'Active', agreementReference: '', description: '' });
  const [ruleProfileDraft, setRuleProfileDraft] = useState<RuleProfilePayload>({ code: '', name: '', status: 'Active', dailyOvertimeThreshold: 8, weeklyOvertimeThreshold: 40, minimumRestHours: 8, scheduledDailyHoursTarget: 8 });
  const [shiftTemplateDraft, setShiftTemplateDraft] = useState<ShiftTemplatePayload>({ orgUnitId: '', workRuleProfileId: null, code: '', name: '', startTime: '08:00', endTime: '16:00', unpaidBreakMinutes: 30, paidBreakMinutes: 0, status: 'Active' });
  const [editingLaborGroupId, setEditingLaborGroupId] = useState<string | null>(null);
  const [editingRuleProfileId, setEditingRuleProfileId] = useState<string | null>(null);
  const [editingShiftTemplateId, setEditingShiftTemplateId] = useState<string | null>(null);

  const isHrAdmin = session?.access?.isHrAdmin ?? false;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSummary, nextSchedules, nextTimeCards, nextExceptions, nextOrgUnits, nextEmployees, nextPositions, nextClassifications, nextLaborGroups, nextRuleProfiles, nextShiftTemplates] = await Promise.all([
        getManagementSummary(),
        listManagementSchedules(),
        listManagementTimeCards(),
        listManagementExceptions(),
        listOrgUnits(false),
        listEmployees({ limit: 100 }),
        listPositions(false),
        listClassifications(false),
        listLaborGroups(),
        listRuleProfiles(),
        listShiftTemplates(),
      ]);

      setSummary(nextSummary);
      setSchedules(nextSchedules);
      setTimeCards(nextTimeCards);
      setExceptions(nextExceptions);
      setOrgUnits(nextOrgUnits);
      setEmployees(nextEmployees.data);
      setPositions(nextPositions);
      setClassifications(nextClassifications);
      setLaborGroups(nextLaborGroups);
      setRuleProfiles(nextRuleProfiles);
      setShiftTemplates(nextShiftTemplates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load workforce time.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const manageableEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== 'Terminated'),
    [employees],
  );

  const coverageRows = useMemo(
    () => schedules.map((schedule) => ({
      id: schedule.id,
      orgUnit: schedule.orgUnit?.name ?? 'Unassigned',
      period: `${formatShortDate(schedule.periodStart)} to ${formatShortDate(schedule.periodEnd)}`,
      status: schedule.status,
      shiftCount: schedule.shiftCount,
      uncoveredShiftCount: schedule.uncoveredShiftCount,
    })),
    [schedules],
  );

  const openScheduleModal = (schedule?: WorkScheduleRecord) => {
    if (schedule) {
      setScheduleEditor(schedule);
      setScheduleForm({
        orgUnitId: schedule.orgUnit?.id ?? '',
        periodStart: schedule.periodStart?.slice(0, 10) ?? '',
        periodEnd: schedule.periodEnd?.slice(0, 10) ?? '',
        notes: schedule.notes ?? '',
        shifts: schedule.shifts.map((shift) => ({
          employeeId: shift.employee?.id ?? null,
          shiftTemplateId: shift.shiftTemplate?.id ?? null,
          shiftDate: shift.shiftDate?.slice(0, 10) ?? '',
          startDateTime: shift.startDateTime ? shift.startDateTime.slice(0, 16) : '',
          endDateTime: shift.endDateTime ? shift.endDateTime.slice(0, 16) : '',
          breakMinutes: shift.breakMinutes,
          status: shift.status as ScheduleShiftPayload['status'],
          notes: shift.notes,
        })),
      });
    } else {
      setScheduleEditor(null);
      setScheduleForm(createEmptyScheduleForm());
    }

    setScheduleModalOpen(true);
  };

  const saveSchedule = async () => {
    setSaving(true);
    setError(null);

    try {
      if (!scheduleEditor) {
        await createManagementSchedule(scheduleForm as SchedulePayload);
      } else {
        await updateManagementSchedule(scheduleEditor.id, {
          notes: scheduleForm.notes || null,
          shifts: scheduleForm.shifts,
        });
      }

      setScheduleModalOpen(false);
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const openDecisionModal = async (timeCardId: string, action: 'approve' | 'reject') => {
    setSaving(true);
    setError(null);

    try {
      const detail = await getManagementTimeCardDetail(timeCardId);
      setSelectedTimeCard(detail);
      setDecisionModal({ action, timeCard: detail, comments: '' });
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to load the time card.');
    } finally {
      setSaving(false);
    }
  };

  const submitDecision = async () => {
    if (!decisionModal?.timeCard) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (decisionModal.action === 'approve') {
        await approveManagementTimeCard(decisionModal.timeCard.id, decisionModal.comments);
      } else {
        await rejectManagementTimeCard(decisionModal.timeCard.id, decisionModal.comments);
      }

      setDecisionModal(null);
      setSelectedTimeCard(null);
      await Promise.all([loadWorkspace(), refreshInboxSummary()]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update the time card.');
    } finally {
      setSaving(false);
    }
  };

  const saveLaborGroup = async () => {
    setSaving(true);
    setError(null);

    try {
      if (editingLaborGroupId) {
        await updateLaborGroup(editingLaborGroupId, laborGroupDraft);
      } else {
        await createLaborGroup(laborGroupDraft);
      }

      setEditingLaborGroupId(null);
      setLaborGroupDraft({ code: '', name: '', status: 'Active', agreementReference: '', description: '' });
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the labor group.');
    } finally {
      setSaving(false);
    }
  };

  const saveRuleProfile = async () => {
    setSaving(true);
    setError(null);

    try {
      if (editingRuleProfileId) {
        await updateRuleProfile(editingRuleProfileId, ruleProfileDraft);
      } else {
        await createRuleProfile(ruleProfileDraft);
      }

      setEditingRuleProfileId(null);
      setRuleProfileDraft({ code: '', name: '', status: 'Active', dailyOvertimeThreshold: 8, weeklyOvertimeThreshold: 40, minimumRestHours: 8, scheduledDailyHoursTarget: 8 });
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the rule profile.');
    } finally {
      setSaving(false);
    }
  };

  const saveShiftTemplate = async () => {
    setSaving(true);
    setError(null);

    try {
      if (editingShiftTemplateId) {
        await updateShiftTemplate(editingShiftTemplateId, shiftTemplateDraft);
      } else {
        await createShiftTemplate(shiftTemplateDraft);
      }

      setEditingShiftTemplateId(null);
      setShiftTemplateDraft({ orgUnitId: '', workRuleProfileId: null, code: '', name: '', startTime: '08:00', endTime: '16:00', unpaidBreakMinutes: 30, paidBreakMinutes: 0, status: 'Active' });
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the shift template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workforce-time-page">
      <PageHero
        eyebrow="Management"
        title="Workforce Time"
        subtitle="Schedules, time-card approvals, exceptions, and union-aware rule controls in one operating workspace."
        actions={(
          <div className="workforce-time-header-actions">
            <button type="button" className="button button-outline" onClick={() => { void loadWorkspace(); }}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <button type="button" className="button" onClick={() => openScheduleModal()}>
              <Plus size={16} />
              New schedule
            </button>
          </div>
        )}
        className="workforce-time-hero"
        variant="analytics"
      >

        {error ? (
          <Banner tone="error" icon={<ShieldAlert size={16} />} className="workforce-time-banner">{error}</Banner>
        ) : null}

        <div className="workforce-time-metrics">
          <SummaryCard label="Pending approvals" value={String(summary?.pendingApprovals ?? 0)} icon={<ClipboardCheck size={18} />} />
          <SummaryCard label="Open exceptions" value={String(summary?.openExceptions ?? 0)} icon={<AlertTriangle size={18} />} />
          <SummaryCard label="Overtime hours" value={String(summary?.overtimeHoursCurrentPeriod ?? 0)} icon={<Clock3 size={18} />} />
          <SummaryCard label="Uncovered shifts" value={String(summary?.uncoveredShifts ?? 0)} icon={<Users size={18} />} />
        </div>
      </PageHero>

      <div className="card">
        <div className="workforce-time-tabs">
          {([
            ['schedule', 'Schedule'],
            ['approvals', 'Approvals'],
            ['exceptions', 'Exceptions'],
            ['rules', 'Rules'],
            ['coverage', 'Coverage'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={`workforce-time-tab ${tab === value ? 'workforce-time-tab-active' : ''}`} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="workforce-time-state">
            <LoaderCircle className="workforce-time-spin" size={18} />
            <span>Loading workforce time...</span>
          </div>
        ) : null}

        {!loading && tab === 'schedule' ? (
          <div className="workforce-time-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Schedules</h3>
                <p className="card-subtitle">Create, adjust, and publish org-unit schedules with leave context inline.</p>
              </div>
            </div>
            <div className="workforce-time-card-grid">
              {schedules.map((schedule) => (
                <article key={schedule.id} className="workforce-time-card">
                  <div className="workforce-time-card-header">
                    <div>
                      <h3>{schedule.orgUnit?.name ?? 'Org unit'}</h3>
                      <p>{formatShortDate(schedule.periodStart)} to {formatShortDate(schedule.periodEnd)}</p>
                    </div>
                    <span className={`badge ${schedule.status === 'Published' ? 'badge-success' : 'badge-warning'}`}>{schedule.status}</span>
                  </div>
                  <div className="workforce-time-card-grid-meta">
                    <span><strong>Shifts:</strong> {schedule.shiftCount}</span>
                    <span><strong>Uncovered:</strong> {schedule.uncoveredShiftCount}</span>
                    <span><strong>Published:</strong> {formatShortDate(schedule.publishedAt)}</span>
                  </div>
                  <div className="workforce-time-inline-list">
                    {schedule.shifts.slice(0, 4).map((shift) => (
                      <div key={shift.id} className="workforce-time-inline-row">
                        <span>{formatShortDate(shift.shiftDate)} | {shift.employee?.fullName ?? 'Open shift'}</span>
                        <span>{shift.shiftTemplate?.name ?? 'Custom shift'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="workforce-time-card-actions">
                    <button type="button" className="button button-outline" onClick={() => openScheduleModal(schedule)}>Edit</button>
                    {schedule.status === 'Draft' ? <button type="button" className="button" onClick={() => { void publishManagementSchedule(schedule.id).then(loadWorkspace).catch((publishError: unknown) => setError(publishError instanceof Error ? publishError.message : 'Unable to publish schedule.')); }}>Publish</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && tab === 'approvals' ? (
          <div className="workforce-time-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Time card approvals</h3>
                <p className="card-subtitle">Manager-routed approvals and corrections for the current period.</p>
              </div>
            </div>
            <div className="workforce-time-table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Hours</th>
                    <th>Exceptions</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {timeCards.length === 0 ? (
                    <tr><td colSpan={6} className="workforce-time-empty-cell">No time cards are in management scope.</td></tr>
                  ) : timeCards.map((timeCard) => (
                    <tr key={timeCard.id}>
                      <td>{timeCard.employee?.fullName ?? 'Unknown employee'}</td>
                      <td>{formatShortDate(timeCard.periodStart)} to {formatShortDate(timeCard.periodEnd)}</td>
                      <td>{timeCard.status}</td>
                      <td>{timeCard.totalWorkedHours} worked | {timeCard.overtimeHours} OT</td>
                      <td>{timeCard.exceptionCount}</td>
                      <td>
                        <div className="workforce-time-row-actions">
                          <button type="button" className="button button-outline" onClick={() => { void openDecisionModal(timeCard.id, 'approve'); }} disabled={saving || timeCard.status !== 'Submitted'}>Review</button>
                          {timeCard.status === 'Submitted' ? <button type="button" className="button button-outline" onClick={() => { void openDecisionModal(timeCard.id, 'reject'); }} disabled={saving}>Reject</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === 'exceptions' ? (
          <div className="workforce-time-section workforce-time-card-grid">
            {exceptions.length === 0 ? <div className="workforce-time-state"><span>No scheduling or time-card exceptions are currently open.</span></div> : exceptions.map((item) => (
              <article key={item.id} className="workforce-time-card">
                <div className="workforce-time-card-header">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.employee?.fullName ?? 'No employee'} | {item.orgUnit?.name ?? 'No org unit'}</p>
                  </div>
                  <span className={`badge ${item.severity === 'High' ? 'badge-danger' : 'badge-warning'}`}>{item.severity}</span>
                </div>
                <p className="workforce-time-copy">{item.detail}</p>
                <div className="workforce-time-card-grid-meta">
                  <span><strong>Category:</strong> {item.category}</span>
                  <span><strong>Date:</strong> {formatShortDate(item.date)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && tab === 'rules' ? (
          <div className="workforce-time-section workforce-time-rules-grid">
            <section className="workforce-time-panel">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Labor groups</h3>
                  <p className="card-subtitle">Union and non-union grouping for rule assignment.</p>
                </div>
              </div>
              {isHrAdmin ? (
                <>
                  <div className="workforce-time-form-grid">
                    <Field label="Code"><input value={laborGroupDraft.code} onChange={(event) => setLaborGroupDraft((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editingLaborGroupId)} /></Field>
                    <Field label="Name"><input value={laborGroupDraft.name} onChange={(event) => setLaborGroupDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
                    <Field label="Agreement"><input value={laborGroupDraft.agreementReference ?? ''} onChange={(event) => setLaborGroupDraft((current) => ({ ...current, agreementReference: event.target.value }))} /></Field>
                    <Field label="Status"><select value={laborGroupDraft.status ?? 'Active'} onChange={(event) => setLaborGroupDraft((current) => ({ ...current, status: event.target.value as 'Active' | 'Inactive' }))}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>
                    <Field label="Description" fullWidth><textarea rows={3} value={laborGroupDraft.description ?? ''} onChange={(event) => setLaborGroupDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
                  </div>
                  <div className="workforce-time-panel-actions"><button type="button" className="button button-outline" onClick={() => { setEditingLaborGroupId(null); setLaborGroupDraft({ code: '', name: '', status: 'Active', agreementReference: '', description: '' }); }}>Clear</button><button type="button" className="button" onClick={() => { void saveLaborGroup(); }} disabled={saving}>Save labor group</button></div>
                </>
              ) : <div className="workforce-time-readonly">Rule administration is available to HR administrators.</div>}
              <div className="workforce-time-list">
                {laborGroups.map((item) => (
                  <div key={item.id} className="workforce-time-inline-row">
                    <div><strong>{item.code} | {item.name}</strong><div className="workforce-time-inline-meta">{item.employeeCount} employees | {item.ruleProfileCount} rule profiles</div></div>
                    {isHrAdmin ? <button type="button" className="button button-outline" onClick={() => { setEditingLaborGroupId(item.id); setLaborGroupDraft({ code: item.code, name: item.name, status: item.status as 'Active' | 'Inactive', agreementReference: item.agreementReference, description: item.description }); }}>Edit</button> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="workforce-time-panel">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Rule profiles</h3>
                  <p className="card-subtitle">Overtime, rest, and daily target logic by labor group or structure.</p>
                </div>
              </div>
              {isHrAdmin ? (
                <>
                  <div className="workforce-time-form-grid">
                    <Field label="Code"><input value={ruleProfileDraft.code} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editingRuleProfileId)} /></Field>
                    <Field label="Name"><input value={ruleProfileDraft.name} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
                    <Field label="Labor group"><select value={ruleProfileDraft.laborGroupId ?? ''} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, laborGroupId: event.target.value || null }))}><option value="">None</option>{laborGroups.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>)}</select></Field>
                    <Field label="Org unit"><select value={ruleProfileDraft.orgUnitId ?? ''} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, orgUnitId: event.target.value || null }))}><option value="">None</option>{orgUnits.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>)}</select></Field>
                    <Field label="Position"><select value={ruleProfileDraft.positionId ?? ''} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, positionId: event.target.value || null }))}><option value="">None</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.positionCode} | {item.title}</option>)}</select></Field>
                    <Field label="Classification"><select value={ruleProfileDraft.classificationId ?? ''} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, classificationId: event.target.value || null }))}><option value="">None</option>{classifications.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.title}</option>)}</select></Field>
                    <Field label="Daily OT"><input type="number" min="0" max="24" step="0.25" value={ruleProfileDraft.dailyOvertimeThreshold ?? 8} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, dailyOvertimeThreshold: Number(event.target.value) }))} /></Field>
                    <Field label="Weekly OT"><input type="number" min="0" max="168" step="0.25" value={ruleProfileDraft.weeklyOvertimeThreshold ?? 40} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, weeklyOvertimeThreshold: Number(event.target.value) }))} /></Field>
                    <Field label="Double time"><input type="number" min="0" max="24" step="0.25" value={ruleProfileDraft.doubleTimeThreshold ?? ''} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, doubleTimeThreshold: event.target.value ? Number(event.target.value) : null }))} /></Field>
                    <Field label="Minimum rest"><input type="number" min="0" max="24" step="0.25" value={ruleProfileDraft.minimumRestHours ?? 8} onChange={(event) => setRuleProfileDraft((current) => ({ ...current, minimumRestHours: Number(event.target.value) }))} /></Field>
                  </div>
                  <div className="workforce-time-panel-actions"><button type="button" className="button button-outline" onClick={() => { setEditingRuleProfileId(null); setRuleProfileDraft({ code: '', name: '', status: 'Active', dailyOvertimeThreshold: 8, weeklyOvertimeThreshold: 40, minimumRestHours: 8, scheduledDailyHoursTarget: 8 }); }}>Clear</button><button type="button" className="button" onClick={() => { void saveRuleProfile(); }} disabled={saving}>Save profile</button></div>
                </>
              ) : <div className="workforce-time-readonly">Rule administration is available to HR administrators.</div>}
              <div className="workforce-time-list">
                {ruleProfiles.map((item) => (
                  <div key={item.id} className="workforce-time-inline-row">
                    <div><strong>{item.code} | {item.name}</strong><div className="workforce-time-inline-meta">{item.orgUnit?.name ?? item.laborGroup?.name ?? item.position?.title ?? item.classification?.title ?? 'System default'} | {item.dailyOvertimeThreshold} daily | {item.weeklyOvertimeThreshold} weekly</div></div>
                    {isHrAdmin ? <button type="button" className="button button-outline" onClick={() => { setEditingRuleProfileId(item.id); setRuleProfileDraft({ code: item.code, name: item.name, status: item.status as 'Active' | 'Inactive', laborGroupId: item.laborGroup?.id ?? null, orgUnitId: item.orgUnit?.id ?? null, positionId: item.position?.id ?? null, classificationId: item.classification?.id ?? null, dailyOvertimeThreshold: item.dailyOvertimeThreshold, weeklyOvertimeThreshold: item.weeklyOvertimeThreshold, doubleTimeThreshold: item.doubleTimeThreshold, minimumRestHours: item.minimumRestHours, scheduledDailyHoursTarget: item.scheduledDailyHoursTarget, shiftPremiumRules: item.shiftPremiumRules, holidayTreatment: item.holidayTreatment, leaveTreatment: item.leaveTreatment }); }}>Edit</button> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="workforce-time-panel">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Shift templates</h3>
                  <p className="card-subtitle">Standardized shifts and their linked rule profiles.</p>
                </div>
              </div>
              {isHrAdmin ? (
                <>
                  <div className="workforce-time-form-grid">
                    <Field label="Org unit"><select value={shiftTemplateDraft.orgUnitId} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, orgUnitId: event.target.value }))}><option value="">Select org unit</option>{orgUnits.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>)}</select></Field>
                    <Field label="Rule profile"><select value={shiftTemplateDraft.workRuleProfileId ?? ''} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, workRuleProfileId: event.target.value || null }))}><option value="">None</option>{ruleProfiles.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>)}</select></Field>
                    <Field label="Code"><input value={shiftTemplateDraft.code} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editingShiftTemplateId)} /></Field>
                    <Field label="Name"><input value={shiftTemplateDraft.name} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
                    <Field label="Start"><input type="time" value={shiftTemplateDraft.startTime} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, startTime: event.target.value }))} /></Field>
                    <Field label="End"><input type="time" value={shiftTemplateDraft.endTime} onChange={(event) => setShiftTemplateDraft((current) => ({ ...current, endTime: event.target.value }))} /></Field>
                  </div>
                  <div className="workforce-time-panel-actions"><button type="button" className="button button-outline" onClick={() => { setEditingShiftTemplateId(null); setShiftTemplateDraft({ orgUnitId: '', workRuleProfileId: null, code: '', name: '', startTime: '08:00', endTime: '16:00', unpaidBreakMinutes: 30, paidBreakMinutes: 0, status: 'Active' }); }}>Clear</button><button type="button" className="button" onClick={() => { void saveShiftTemplate(); }} disabled={saving}>Save template</button></div>
                </>
              ) : <div className="workforce-time-readonly">Shift template administration is available to HR administrators.</div>}
              <div className="workforce-time-list">
                {shiftTemplates.map((item) => (
                  <div key={item.id} className="workforce-time-inline-row">
                    <div><strong>{item.code} | {item.name}</strong><div className="workforce-time-inline-meta">{item.orgUnit?.name ?? 'Org unit'} | {item.startTime} to {item.endTime}</div></div>
                    {isHrAdmin ? <button type="button" className="button button-outline" onClick={() => { setEditingShiftTemplateId(item.id); setShiftTemplateDraft({ orgUnitId: item.orgUnit?.id ?? '', workRuleProfileId: item.workRuleProfile?.id ?? null, code: item.code, name: item.name, startTime: item.startTime, endTime: item.endTime, unpaidBreakMinutes: item.unpaidBreakMinutes, paidBreakMinutes: item.paidBreakMinutes, status: item.status as 'Active' | 'Inactive' }); }}>Edit</button> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && tab === 'coverage' ? (
          <div className="workforce-time-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Coverage</h3>
                <p className="card-subtitle">Published schedule coverage and open-shift pressure by org unit.</p>
              </div>
            </div>
            <div className="workforce-time-card-grid">
              {coverageRows.map((row) => (
                <article key={row.id} className="workforce-time-card">
                  <div className="workforce-time-card-header">
                    <div>
                      <h3>{row.orgUnit}</h3>
                      <p>{row.period}</p>
                    </div>
                    <span className={`badge ${row.uncoveredShiftCount > 0 ? 'badge-warning' : 'badge-success'}`}>{row.status}</span>
                  </div>
                  <div className="workforce-time-card-grid-meta">
                    <span><strong>Total shifts:</strong> {row.shiftCount}</span>
                    <span><strong>Uncovered:</strong> {row.uncoveredShiftCount}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {scheduleModalOpen ? (
        <Modal
          title={scheduleEditor ? 'Edit schedule' : 'Create schedule'}
          subtitle="Build an org-unit schedule with employee and shift assignments."
          onClose={() => setScheduleModalOpen(false)}
          className="workforce-time-modal"
          size="lg"
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={() => setScheduleForm((current) => ({ ...current, shifts: [...current.shifts, createEmptyShift()] }))}>Add shift</button>
              <button type="button" className="button button-outline" onClick={() => setScheduleModalOpen(false)}>Close</button>
              <button type="button" className="button" onClick={() => { void saveSchedule(); }} disabled={saving}>Save schedule</button>
            </>
          )}
        >
            <div className="workforce-time-form-grid">
              <Field label="Org unit"><select value={scheduleForm.orgUnitId} onChange={(event) => setScheduleForm((current) => ({ ...current, orgUnitId: event.target.value }))} disabled={Boolean(scheduleEditor)}><option value="">Select org unit</option>{orgUnits.map((item) => <option key={item.id} value={item.id}>{item.code} | {item.name}</option>)}</select></Field>
              <Field label="Period start"><input type="date" value={scheduleForm.periodStart} onChange={(event) => setScheduleForm((current) => ({ ...current, periodStart: event.target.value }))} disabled={Boolean(scheduleEditor)} /></Field>
              <Field label="Period end"><input type="date" value={scheduleForm.periodEnd} onChange={(event) => setScheduleForm((current) => ({ ...current, periodEnd: event.target.value }))} disabled={Boolean(scheduleEditor)} /></Field>
              <Field label="Notes" fullWidth><textarea rows={3} value={scheduleForm.notes} onChange={(event) => setScheduleForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            </div>
            <div className="workforce-time-list">
              {scheduleForm.shifts.map((shift, index) => (
                <div key={`${shift.shiftDate}-${index}`} className="workforce-time-shift-row">
                  <select value={shift.employeeId ?? ''} onChange={(event) => setScheduleForm((current) => ({ ...current, shifts: current.shifts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, employeeId: event.target.value || null } : candidate) }))}>
                    <option value="">Open shift</option>
                    {manageableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} | {employee.firstName} {employee.lastName}</option>)}
                  </select>
                  <select value={shift.shiftTemplateId ?? ''} onChange={(event) => setScheduleForm((current) => ({ ...current, shifts: current.shifts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, shiftTemplateId: event.target.value || null } : candidate) }))}>
                    <option value="">Custom shift</option>
                    {shiftTemplates.map((template) => <option key={template.id} value={template.id}>{template.code} | {template.name}</option>)}
                  </select>
                  <input type="date" value={shift.shiftDate} onChange={(event) => setScheduleForm((current) => ({ ...current, shifts: current.shifts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, shiftDate: event.target.value } : candidate) }))} />
                  <input type="datetime-local" value={shift.startDateTime} onChange={(event) => setScheduleForm((current) => ({ ...current, shifts: current.shifts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, startDateTime: event.target.value } : candidate) }))} />
                  <input type="datetime-local" value={shift.endDateTime} onChange={(event) => setScheduleForm((current) => ({ ...current, shifts: current.shifts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, endDateTime: event.target.value } : candidate) }))} />
                </div>
              ))}
            </div>
        </Modal>
      ) : null}

      {decisionModal && selectedTimeCard ? (
        <Modal
          title={decisionModal.action === 'approve' ? 'Approve time card' : 'Reject time card'}
          subtitle={`${selectedTimeCard.employee?.fullName ?? 'Employee'} | ${formatShortDate(selectedTimeCard.periodStart)} to ${formatShortDate(selectedTimeCard.periodEnd)}`}
          onClose={() => { setDecisionModal(null); setSelectedTimeCard(null); }}
          className="workforce-time-modal"
          size="md"
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={() => { setDecisionModal(null); setSelectedTimeCard(null); }}>Cancel</button>
              <button type="button" className="button" onClick={() => { void submitDecision(); }} disabled={saving}>{decisionModal.action === 'approve' ? 'Approve' : 'Reject'}</button>
            </>
          )}
        >
            <div className="workforce-time-review-grid">
              <SummaryCard label="Worked" value={String(selectedTimeCard.totalWorkedHours)} icon={<Clock3 size={18} />} />
              <SummaryCard label="Overtime" value={String(selectedTimeCard.overtimeHours)} icon={<AlertTriangle size={18} />} />
              <SummaryCard label="Leave" value={String(selectedTimeCard.leaveHours)} icon={<CalendarDays size={18} />} />
              <SummaryCard label="Exceptions" value={String(selectedTimeCard.exceptionCount)} icon={<ShieldAlert size={18} />} />
            </div>
            <label className="workforce-time-field workforce-time-field-full">
              <span>Comments</span>
              <textarea rows={4} value={decisionModal.comments} onChange={(event) => setDecisionModal((current) => current ? { ...current, comments: event.target.value } : null)} />
            </label>
        </Modal>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="workforce-time-summary-card"><div className="workforce-time-summary-head"><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
}

function Field({ label, children, fullWidth = false }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return <label className={`workforce-time-field ${fullWidth ? 'workforce-time-field-full' : ''}`}><span>{label}</span>{children}</label>;
}
