import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPen, LoaderCircle, Plus, RefreshCcw, Send, ShieldAlert, Target } from 'lucide-react';
import { listEmployees, type Employee } from '@/pages/employees/employees.api';
import { listOrgUnits, type OrgUnitRecord } from '@/pages/organization/organization.api';
import {
  listTeamSkills,
  markTeamSkillNotValidated,
  validateTeamSkill,
  type TeamSkillGroupRecord,
} from '@/pages/skills/skills.api';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import {
  createPerformanceCycle,
  createPerformanceGoal,
  finalizePerformanceReview,
  getPerformanceReview,
  getPerformanceSummary,
  listPerformanceCycles,
  listPerformanceGoals,
  listPerformanceReviews,
  publishPerformanceCycle,
  submitManagerReview,
  updatePerformanceCycle,
  updatePerformanceGoal,
  type PerformanceCycleRecord,
  type PerformanceGoalRecord,
  type PerformanceReviewRecord,
  type PerformanceSummary,
} from './performance.api';
import './PerformancePage.css';

type PerformanceTab = 'cycles' | 'reviews' | 'goals' | 'skills';

interface CycleFormState {
  name: string;
  startDate: string;
  endDate: string;
  selfReviewDueDate: string;
  managerReviewDueDate: string;
  releaseDate: string;
  orgUnitId: string;
}

interface GoalFormState {
  employeeId: string;
  title: string;
  description: string;
  status: 'Active' | 'Completed' | 'Closed';
  targetDate: string;
  createdInCycleId: string;
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

function formatDate(value: string | null) {
  if (!value) {
    return 'TBD';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function emptyCycleForm(): CycleFormState {
  return {
    name: '',
    startDate: '',
    endDate: '',
    selfReviewDueDate: '',
    managerReviewDueDate: '',
    releaseDate: '',
    orgUnitId: '',
  };
}

function emptyGoalForm(): GoalFormState {
  return {
    employeeId: '',
    title: '',
    description: '',
    status: 'Active',
    targetDate: '',
    createdInCycleId: '',
  };
}

function validateCycleForm(form: CycleFormState) {
  if (form.name.trim().length < 3) {
    return 'Cycle name must be at least 3 characters.';
  }

  if (!form.startDate || !form.endDate || !form.selfReviewDueDate || !form.managerReviewDueDate || !form.releaseDate) {
    return 'Complete all cycle dates before saving.';
  }

  if (new Date(form.startDate) > new Date(form.endDate)) {
    return 'The cycle end date must be on or after the start date.';
  }

  return null;
}

function validateGoalForm(form: GoalFormState) {
  if (!form.employeeId) {
    return 'Select an employee before saving the goal.';
  }

  if (form.title.trim().length < 3) {
    return 'Goal title must be at least 3 characters.';
  }

  return null;
}

export function PerformancePage() {
  const { session, refreshInboxSummary } = useAppSession();
  const currentEmployeeId = session?.account?.employeeId ?? null;
  const defaultManagementTab: PerformanceTab = session?.access?.isHrAdmin ? 'cycles' : 'reviews';
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [cycles, setCycles] = useState<PerformanceCycleRecord[]>([]);
  const [reviews, setReviews] = useState<PerformanceReviewRecord[]>([]);
  const [goals, setGoals] = useState<PerformanceGoalRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [teamSkills, setTeamSkills] = useState<TeamSkillGroupRecord[]>([]);
  const [tab, setTab] = useState<PerformanceTab>(defaultManagementTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<PerformanceReviewRecord | null>(null);
  const [managerSummary, setManagerSummary] = useState('');
  const [managerResponses, setManagerResponses] = useState<Record<string, string>>({});
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<PerformanceCycleRecord | null>(null);
  const [editingGoal, setEditingGoal] = useState<PerformanceGoalRecord | null>(null);
  const [cycleForm, setCycleForm] = useState<CycleFormState>(emptyCycleForm);
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm);
  const [skillNotes, setSkillNotes] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSummary, nextCycles, nextReviews, nextGoals, employeeResult, nextOrgUnits, nextTeamSkills] = await Promise.all([
        getPerformanceSummary(),
        listPerformanceCycles(),
        listPerformanceReviews(),
        listPerformanceGoals(),
        listEmployees({ limit: 100 }),
        listOrgUnits(false),
        listTeamSkills(),
      ]);

      setSummary(nextSummary);
      setCycles(nextCycles);
      setReviews(nextReviews);
      setGoals(nextGoals);
      setEmployees(employeeResult.data);
      setOrgUnits(nextOrgUnits);
      setTeamSkills(nextTeamSkills);
      if (!nextSummary.access.isHrAdmin && tab === 'cycles') {
        setTab('reviews');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load performance workspace.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableTabs = useMemo(() => {
    if (summary?.access.isHrAdmin) {
      return ['cycles', 'reviews', 'goals', 'skills'] as PerformanceTab[];
    }

    return ['reviews', 'goals', 'skills'] as PerformanceTab[];
  }, [summary?.access.isHrAdmin]);

  const manageableEmployees = useMemo(() => {
    if (summary?.access.isHrAdmin) {
      return employees.filter((employee) => employee.status !== 'Terminated');
    }

    return employees.filter((employee) => employee.managerId === currentEmployeeId && employee.status !== 'Terminated');
  }, [currentEmployeeId, employees, summary?.access.isHrAdmin]);

  const visibleReviews = useMemo(() => {
    if (summary?.access.isHrAdmin) {
      return reviews;
    }

    return reviews.filter((review) => review.manager?.id === currentEmployeeId);
  }, [currentEmployeeId, reviews, summary?.access.isHrAdmin]);

  const visibleGoals = useMemo(() => {
    if (summary?.access.isHrAdmin) {
      return goals;
    }

    return goals.filter((goal) => goal.manager?.id === currentEmployeeId);
  }, [currentEmployeeId, goals, summary?.access.isHrAdmin]);

  const openCreateCycleModal = () => {
    setEditingCycle(null);
    setCycleForm(emptyCycleForm());
    setCycleModalOpen(true);
  };

  const openEditCycleModal = (cycle: PerformanceCycleRecord) => {
    setEditingCycle(cycle);
    setCycleForm({
      name: cycle.name,
      startDate: toDateInput(cycle.startDate),
      endDate: toDateInput(cycle.endDate),
      selfReviewDueDate: toDateInput(cycle.selfReviewDueDate),
      managerReviewDueDate: toDateInput(cycle.managerReviewDueDate),
      releaseDate: toDateInput(cycle.releaseDate),
      orgUnitId: cycle.orgUnit?.id ?? '',
    });
    setCycleModalOpen(true);
  };

  const openCreateGoalModal = () => {
    setEditingGoal(null);
    setGoalForm(emptyGoalForm());
    setGoalModalOpen(true);
  };

  const openEditGoalModal = (goal: PerformanceGoalRecord) => {
    setEditingGoal(goal);
    setGoalForm({
      employeeId: goal.employee?.id ?? '',
      title: goal.title,
      description: goal.description ?? '',
      status: goal.status,
      targetDate: toDateInput(goal.targetDate),
      createdInCycleId: goal.createdInCycle?.id ?? '',
    });
    setGoalModalOpen(true);
  };

  const openReviewModal = async (reviewId: string) => {
    setSaving(true);
    setError(null);

    try {
      const review = await getPerformanceReview(reviewId);
      setSelectedReview(review);
      setManagerSummary(review.managerSummary ?? '');
      setManagerResponses(
        Object.fromEntries(
          review.sections.map((section) => [section.sectionKey, section.managerResponse ?? '']),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the review details.');
    } finally {
      setSaving(false);
    }
  };

  const handleCycleSubmit = async () => {
    const validationMessage = validateCycleForm(cycleForm);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...cycleForm,
        orgUnitId: cycleForm.orgUnitId || null,
      };

      if (editingCycle) {
        await updatePerformanceCycle(editingCycle.id, payload);
      } else {
        await createPerformanceCycle(payload);
      }

      setCycleModalOpen(false);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the cycle.');
    } finally {
      setSaving(false);
    }
  };

  const handleGoalSubmit = async () => {
    const validationMessage = validateGoalForm(goalForm);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...goalForm,
        description: goalForm.description || null,
        targetDate: goalForm.targetDate || null,
        createdInCycleId: goalForm.createdInCycleId || null,
      };

      if (editingGoal) {
        await updatePerformanceGoal(editingGoal.id, payload);
      } else {
        await createPerformanceGoal(payload);
      }

      setGoalModalOpen(false);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the goal.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishCycle = async (cycleId: string) => {
    setSaving(true);
    setError(null);

    try {
      await publishPerformanceCycle(cycleId);
      await Promise.all([loadData(), refreshInboxSummary()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to publish the cycle.');
    } finally {
      setSaving(false);
    }
  };

  const handleManagerReviewSubmit = async (finalize = false) => {
    if (!selectedReview) {
      return;
    }

    if (finalize && selectedReview.sections.some((section) => !(managerResponses[section.sectionKey] ?? '').trim())) {
      setError('Complete all manager review sections before finalizing.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await submitManagerReview(selectedReview.id, {
        sections: selectedReview.sections.map((section) => ({
          sectionKey: section.sectionKey,
          response: managerResponses[section.sectionKey] ?? '',
        })),
        managerSummary,
      });

      if (finalize) {
        await finalizePerformanceReview(selectedReview.id);
      }

      const refreshedReview = await getPerformanceReview(selectedReview.id);
      setSelectedReview(refreshedReview);
      setManagerSummary(refreshedReview.managerSummary ?? '');
      setManagerResponses(
        Object.fromEntries(
          refreshedReview.sections.map((section) => [section.sectionKey, section.managerResponse ?? '']),
        ),
      );
      await Promise.all([loadData(), refreshInboxSummary()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the review.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkillValidation = async (employeeSkillId: string, validationStatus: 'Validated' | 'NotValidated') => {
    setSaving(true);
    setError(null);

    try {
      const note = skillNotes[employeeSkillId] ?? null;
      const updatedSkill = validationStatus === 'Validated'
        ? await validateTeamSkill(employeeSkillId, note)
        : await markTeamSkillNotValidated(employeeSkillId, note);

      setTeamSkills((current) => current.map((group) => ({
        ...group,
        skills: group.skills.map((skill) => skill.id === updatedSkill.id ? updatedSkill : skill),
      })));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update skill validation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="performance-page">
      <div className="card performance-hero">
        <div className="page-header performance-header">
          <div>
            <span className="performance-eyebrow">Management</span>
            <h1 className="page-title">Planning for Success</h1>
            <p className="page-subtitle">Cycle planning, narrative reviews, and individual goals in one focused management workspace.</p>
          </div>
          <div className="performance-header-actions">
            <button type="button" className="button button-outline" onClick={() => { void loadData(); }}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            {summary?.access.isHrAdmin ? (
              <button type="button" className="button" onClick={openCreateCycleModal}>
                <Plus size={16} />
                New Cycle
              </button>
            ) : null}
            <button type="button" className="button" onClick={openCreateGoalModal}>
              <Target size={16} />
              New Goal
            </button>
          </div>
        </div>

        {error ? (
          <div className="performance-banner performance-banner-error">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {summary ? (
          <div className="performance-summary-grid">
            <SummaryCard label="Active cycles" value={summary.management.activeCycleCount} detail={summary.management.activeCycleName ?? 'No published cycle'} />
            <SummaryCard label="Overdue reviews" value={summary.management.overdueReviews} detail="Self or manager reviews past due" />
            <SummaryCard label="Pending acknowledgments" value={summary.management.pendingAcknowledgments} detail="Released reviews still awaiting employee acknowledgment" />
            <SummaryCard label="Goal completion" value={`${summary.management.goalCompletionRate}%`} detail="Completed and closed goals across current scope" />
          </div>
        ) : null}
      </div>

      <div className="card performance-start-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Start Here</h3>
            <p className="card-subtitle">
              {summary?.access.isHrAdmin
                ? 'Use cycles for HR-owned planning, reviews for active manager work, and skills for validation follow-up.'
                : 'Use reviews for current manager work, goals for individual development, and skills for team validation follow-up.'}
            </p>
          </div>
        </div>
        <div className="performance-start-grid">
          {(summary?.access.isHrAdmin ? [
            ['cycles', 'Review cycles', 'Open, publish, and monitor cycle health.'],
            ['reviews', 'Team reviews', 'Complete and release manager feedback.'],
            ['skills', 'Team skills', 'Validate self-identified skills for direct reports.'],
          ] : [
            ['reviews', 'Current reviews', 'Finish manager feedback and release final reviews.'],
            ['goals', 'Individual goals', 'Adjust goals and watch progress notes.'],
            ['skills', 'Team skills', 'Validate skill claims and add manager notes.'],
          ]).map(([value, label, copy]) => (
            <button
              key={value}
              type="button"
              className="performance-start-link"
              onClick={() => setTab(value as PerformanceTab)}
            >
              <strong>{label}</strong>
              <span>{copy}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="performance-tab-list">
          {availableTabs.map((item) => (
            <button
              key={item}
              type="button"
              className={`performance-tab ${tab === item ? 'performance-tab-active' : ''}`}
              onClick={() => setTab(item)}
            >
              {item === 'cycles' ? 'Cycles' : item === 'reviews' ? 'Reviews' : item === 'goals' ? 'Goals' : 'Skills'}
            </button>
          ))}
        </div>

        {loading && !summary ? (
          <div className="performance-state">
            <LoaderCircle className="performance-spin" size={18} />
            <span>Loading performance workspace...</span>
          </div>
        ) : null}

        {!loading && tab === 'cycles' ? (
          <div className="performance-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Review cycles</h3>
                <p className="card-subtitle">HR-owned cycles define the review window, due dates, and included population.</p>
              </div>
            </div>
            <div className="performance-card-list">
              {cycles.map((cycle) => (
                <article key={cycle.id} className="performance-card">
                  <div className="performance-card-header">
                    <div>
                      <h4>{cycle.name}</h4>
                      <p>{cycle.orgUnit ? `${cycle.orgUnit.code} | ${cycle.orgUnit.name}` : 'Company-wide population'}</p>
                    </div>
                    <span className={`badge ${cycle.status === 'Published' ? 'badge-primary' : 'badge-warning'}`}>{cycle.status}</span>
                  </div>
                  <div className="performance-card-grid">
                    <span><strong>Window:</strong> {formatDate(cycle.startDate)} to {formatDate(cycle.endDate)}</span>
                    <span><strong>Self due:</strong> {formatDate(cycle.selfReviewDueDate)}</span>
                    <span><strong>Manager due:</strong> {formatDate(cycle.managerReviewDueDate)}</span>
                    <span><strong>Release:</strong> {formatDate(cycle.releaseDate)}</span>
                    <span><strong>Reviews:</strong> {cycle.reviewCount}</span>
                    <span><strong>Finalized:</strong> {cycle.finalizedReviews}</span>
                  </div>
                  <div className="performance-card-actions">
                    {cycle.status === 'Draft' ? (
                      <>
                        <button type="button" className="button button-outline" onClick={() => openEditCycleModal(cycle)}>
                          <ClipboardPen size={16} />
                          Edit
                        </button>
                        <button type="button" className="button" onClick={() => { void handlePublishCycle(cycle.id); }} disabled={saving}>
                          <Send size={16} />
                          Publish
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && tab === 'reviews' ? (
          <div className="performance-section">
            <div className="performance-main-panel">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Team reviews</h3>
                  <p className="card-subtitle">Narrative feedback only. Open a review to complete manager responses and release the final conversation.</p>
                </div>
              </div>
              <div className="performance-table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Cycle</th>
                      <th>Status</th>
                      <th>Self progress</th>
                      <th>Manager progress</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReviews.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="performance-empty-cell">No team reviews are currently in scope.</td>
                      </tr>
                    ) : visibleReviews.map((review) => (
                      <tr key={review.id}>
                        <td>{review.employee?.fullName ?? 'Unknown employee'}</td>
                        <td>{review.cycle?.name ?? 'Cycle'}</td>
                        <td>{review.status}</td>
                        <td>{review.sectionCompletion.employeeCompleted}/{review.sectionCompletion.total}</td>
                        <td>{review.sectionCompletion.managerCompleted}/{review.sectionCompletion.total}</td>
                        <td>
                          <button type="button" className="button button-outline" onClick={() => { void openReviewModal(review.id); }}>
                            Open review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && tab === 'goals' ? (
          <div className="performance-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Individual goals</h3>
                <p className="card-subtitle">Manager-owned individual goals with recent employee progress updates.</p>
              </div>
            </div>
            <div className="performance-card-list">
              {visibleGoals.length === 0 ? (
                <div className="performance-empty-panel">No goals are currently assigned in this scope.</div>
              ) : visibleGoals.map((goal) => (
                <article key={goal.id} className="performance-card">
                  <div className="performance-card-header">
                    <div>
                      <h4>{goal.title}</h4>
                      <p>{goal.employee?.fullName ?? 'Unknown employee'} | {goal.employee?.department ?? 'Unknown department'}</p>
                    </div>
                    <span className={`badge ${goal.status === 'Active' ? 'badge-primary' : 'badge-warning'}`}>{goal.status}</span>
                  </div>
                  <p className="performance-card-copy">{goal.description ?? 'No goal description provided.'}</p>
                  <div className="performance-card-grid">
                    <span><strong>Target:</strong> {formatDate(goal.targetDate)}</span>
                    <span><strong>Cycle:</strong> {goal.createdInCycle?.name ?? 'Ad hoc goal'}</span>
                    <span><strong>Latest update:</strong> {goal.updates[0]?.progressNote ?? 'No progress updates yet.'}</span>
                  </div>
                  <div className="performance-card-actions">
                    {goal.permissions.canEdit ? (
                      <button type="button" className="button button-outline" onClick={() => openEditGoalModal(goal)}>
                        <ClipboardPen size={16} />
                        Edit goal
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && tab === 'skills' ? (
          <div className="performance-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Team skills</h3>
                <p className="card-subtitle">Review self-identified skills for direct reports, validate them, or mark them as not validated. Validation remains internal and is not shown back to employees on their profile.</p>
              </div>
            </div>
            <div className="performance-card-list">
              {teamSkills.length === 0 ? (
                <div className="performance-empty-panel">No team skills are currently available in this scope.</div>
              ) : teamSkills.map((group) => (
                <article key={group.employee.id} className="performance-card">
                  <div className="performance-card-header">
                    <div>
                      <h4>{group.employee.fullName}</h4>
                      <p>{group.employee.department} | {group.employee.jobTitle}</p>
                    </div>
                    <span className="badge badge-primary">{group.skills.length} skills</span>
                  </div>
                  {group.skills.length === 0 ? (
                    <div className="performance-empty-panel">No self-identified skills have been added yet.</div>
                  ) : (
                    <div className="performance-skill-list">
                      {group.skills.map((skill) => (
                        <div key={skill.id} className="performance-skill-row">
                          <div className="performance-skill-copy">
                            <strong>{skill.skillTag.name}</strong>
                            <span>{skill.skillTag.category?.name ?? 'Skill'} | {skill.selfReportedLevel ?? 'Level not supplied'} | {skill.confidence ? `${skill.confidence}/5 confidence` : 'Confidence not supplied'}</span>
                            <span>Validation: {skill.validationStatus}</span>
                          </div>
                          <div className="performance-skill-actions">
                            <textarea
                              rows={2}
                              className="performance-skill-note"
                              value={skillNotes[skill.id] ?? skill.managerNote ?? ''}
                              onChange={(event) => setSkillNotes((current) => ({ ...current, [skill.id]: event.target.value }))}
                              placeholder="Optional manager note"
                            />
                            <div className="performance-card-actions">
                              <button type="button" className="button button-outline" onClick={() => { void handleSkillValidation(skill.id, 'Validated'); }} disabled={saving}>
                                Validate
                              </button>
                              <button type="button" className="button button-outline" onClick={() => { void handleSkillValidation(skill.id, 'NotValidated'); }} disabled={saving}>
                                Not validated
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {cycleModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card performance-modal" role="dialog" aria-modal="true" aria-labelledby="performance-cycle-title">
            <div className="modal-header">
              <div>
                <h2 id="performance-cycle-title" className="card-title">{editingCycle ? 'Edit cycle' : 'Create cycle'}</h2>
                <p className="card-subtitle">Define the review window, due dates, and optional org-unit population.</p>
              </div>
            </div>
            <div className="performance-form-grid">
              <label className="performance-field">
                <span>Name</span>
                <input value={cycleForm.name} onChange={(event) => setCycleForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Population</span>
                <select value={cycleForm.orgUnitId} onChange={(event) => setCycleForm((current) => ({ ...current, orgUnitId: event.target.value }))}>
                  <option value="">Company-wide</option>
                  {orgUnits.map((orgUnit) => (
                    <option key={orgUnit.id} value={orgUnit.id}>{orgUnit.code} | {orgUnit.name}</option>
                  ))}
                </select>
              </label>
              <label className="performance-field">
                <span>Start date</span>
                <input type="date" value={cycleForm.startDate} onChange={(event) => setCycleForm((current) => ({ ...current, startDate: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>End date</span>
                <input type="date" value={cycleForm.endDate} onChange={(event) => setCycleForm((current) => ({ ...current, endDate: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Self-review due</span>
                <input type="date" value={cycleForm.selfReviewDueDate} onChange={(event) => setCycleForm((current) => ({ ...current, selfReviewDueDate: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Manager review due</span>
                <input type="date" value={cycleForm.managerReviewDueDate} onChange={(event) => setCycleForm((current) => ({ ...current, managerReviewDueDate: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Release date</span>
                <input type="date" value={cycleForm.releaseDate} onChange={(event) => setCycleForm((current) => ({ ...current, releaseDate: event.target.value }))} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setCycleModalOpen(false)}>Cancel</button>
              <button type="button" className="button" onClick={() => { void handleCycleSubmit(); }} disabled={saving}>Save cycle</button>
            </div>
          </div>
        </div>
      ) : null}

      {goalModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card performance-modal" role="dialog" aria-modal="true" aria-labelledby="performance-goal-title">
            <div className="modal-header">
              <div>
                <h2 id="performance-goal-title" className="card-title">{editingGoal ? 'Edit goal' : 'Create goal'}</h2>
                <p className="card-subtitle">Assign an individual goal with a due date and optional cycle context.</p>
              </div>
            </div>
            <div className="performance-form-grid">
              <label className="performance-field">
                <span>Employee</span>
                <select value={goalForm.employeeId} onChange={(event) => setGoalForm((current) => ({ ...current, employeeId: event.target.value }))} disabled={Boolean(editingGoal)}>
                  <option value="">Select employee</option>
                  {manageableEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.employeeNumber} | {employee.firstName} {employee.lastName}</option>
                  ))}
                </select>
              </label>
              <label className="performance-field">
                <span>Status</span>
                <select value={goalForm.status} onChange={(event) => setGoalForm((current) => ({ ...current, status: event.target.value as GoalFormState['status'] }))}>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Closed">Closed</option>
                </select>
              </label>
              <label className="performance-field performance-field-full">
                <span>Goal title</span>
                <input value={goalForm.title} onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="performance-field performance-field-full">
                <span>Description</span>
                <textarea rows={4} value={goalForm.description} onChange={(event) => setGoalForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Target date</span>
                <input type="date" value={goalForm.targetDate} onChange={(event) => setGoalForm((current) => ({ ...current, targetDate: event.target.value }))} />
              </label>
              <label className="performance-field">
                <span>Cycle</span>
                <select value={goalForm.createdInCycleId} onChange={(event) => setGoalForm((current) => ({ ...current, createdInCycleId: event.target.value }))}>
                  <option value="">No cycle</option>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setGoalModalOpen(false)}>Cancel</button>
              <button type="button" className="button" onClick={() => { void handleGoalSubmit(); }} disabled={saving}>Save goal</button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedReview ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card performance-modal performance-review-modal" role="dialog" aria-modal="true" aria-labelledby="performance-review-title">
            <div className="modal-header performance-review-modal-header">
              <div>
                <h2 id="performance-review-title" className="card-title">{selectedReview.employee?.fullName ?? 'Review'}</h2>
                <p className="card-subtitle">{selectedReview.cycle?.name ?? 'Cycle'} | {selectedReview.status}</p>
              </div>
            </div>

            <div className="performance-review-modal-body">
              {selectedReview.sections.map((section) => (
                <div key={section.id} className="performance-review-section">
                  <h4>{section.sectionTitle}</h4>
                  <p className="performance-review-label">Employee</p>
                  <div className="performance-review-response">{section.employeeResponse || 'No employee response yet.'}</div>
                  <label className="performance-field">
                    <span>Manager response</span>
                    <textarea
                      rows={4}
                      value={managerResponses[section.sectionKey] ?? ''}
                      onChange={(event) => setManagerResponses((current) => ({ ...current, [section.sectionKey]: event.target.value }))}
                      disabled={!selectedReview.permissions.canManagerReview && !selectedReview.permissions.canFinalize}
                    />
                  </label>
                </div>
              ))}

              <label className="performance-field">
                <span>Final manager summary</span>
                <textarea
                  rows={4}
                  value={managerSummary}
                  onChange={(event) => setManagerSummary(event.target.value)}
                  disabled={!selectedReview.permissions.canManagerReview && !selectedReview.permissions.canFinalize}
                />
              </label>
            </div>

            <div className="modal-actions performance-review-modal-actions">
              <button type="button" className="button button-outline" onClick={() => setSelectedReview(null)}>Close</button>
              {selectedReview.permissions.canManagerReview ? (
                <button type="button" className="button button-outline" onClick={() => { void handleManagerReviewSubmit(false); }} disabled={saving}>
                  <ClipboardPen size={16} />
                  Save draft
                </button>
              ) : null}
              {selectedReview.permissions.canFinalize ? (
                <button type="button" className="button" onClick={() => { void handleManagerReviewSubmit(true); }} disabled={saving}>
                  <CheckCircle2 size={16} />
                  Finalize
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="performance-summary-card">
      <span className="performance-summary-label">{label}</span>
      <strong className="performance-summary-value">{value}</strong>
      <span className="performance-summary-detail">{detail}</span>
    </div>
  );
}
