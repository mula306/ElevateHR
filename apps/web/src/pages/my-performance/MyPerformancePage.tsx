import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCcw, ShieldAlert, Target } from 'lucide-react';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import {
  acknowledgePerformanceReview,
  createPerformanceGoalUpdate,
  getPerformanceReview,
  getPerformanceSummary,
  listPerformanceGoals,
  listPerformanceReviews,
  submitSelfReview,
  type PerformanceGoalRecord,
  type PerformanceReviewRecord,
  type PerformanceSummary,
} from '@/pages/performance/performance.api';
import './MyPerformancePage.css';

type MyPerformanceTab = 'goals' | 'reviews' | 'history';

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

function validateGoalUpdate(goalUpdateNote: string) {
  if (goalUpdateNote.trim().length < 3) {
    return 'Progress note must be at least 3 characters.';
  }

  return null;
}

function validateGoalProgress(goalProgress: string) {
  if (!goalProgress.trim()) {
    return null;
  }

  const numericValue = Number(goalProgress);

  if (Number.isNaN(numericValue)) {
    return 'Percent complete must be a valid number.';
  }

  if (numericValue < 0 || numericValue > 100) {
    return 'Percent complete must be between 0 and 100.';
  }

  return null;
}

function normalizeGoalProgress(goalProgress: string) {
  if (!goalProgress.trim()) {
    return null;
  }

  const numericValue = Number(goalProgress);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

export function MyPerformancePage() {
  const { session, refreshInboxSummary } = useAppSession();
  const currentEmployeeId = session?.account?.employeeId ?? null;
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [goals, setGoals] = useState<PerformanceGoalRecord[]>([]);
  const [reviews, setReviews] = useState<PerformanceReviewRecord[]>([]);
  const [tab, setTab] = useState<MyPerformanceTab>('goals');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<PerformanceReviewRecord | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<PerformanceGoalRecord | null>(null);
  const [selfResponses, setSelfResponses] = useState<Record<string, string>>({});
  const [goalUpdateNote, setGoalUpdateNote] = useState('');
  const [goalProgress, setGoalProgress] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSummary, nextGoals, nextReviews] = await Promise.all([
        getPerformanceSummary(),
        currentEmployeeId ? listPerformanceGoals({ employeeId: currentEmployeeId }) : Promise.resolve([]),
        listPerformanceReviews(),
      ]);

      setSummary(nextSummary);
      setGoals(nextGoals.filter((goal) => goal.employee?.id === currentEmployeeId));
      setReviews(nextReviews.filter((review) => review.employee?.id === currentEmployeeId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load my performance.');
    } finally {
      setLoading(false);
    }
  }, [currentEmployeeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentGoals = useMemo(
    () => goals.filter((goal) => goal.status === 'Active'),
    [goals],
  );
  const currentReviews = useMemo(
    () => reviews.filter((review) => review.status !== 'Acknowledged'),
    [reviews],
  );
  const historyGoals = useMemo(
    () => goals.filter((goal) => goal.status !== 'Active'),
    [goals],
  );
  const historyReviews = useMemo(
    () => reviews.filter((review) => review.status === 'Acknowledged'),
    [reviews],
  );

  const openReviewModal = async (reviewId: string) => {
    setSaving(true);
    setError(null);

    try {
      const review = await getPerformanceReview(reviewId);
      setSelectedReview(review);
      setSelfResponses(
        Object.fromEntries(
          review.sections.map((section) => [section.sectionKey, section.employeeResponse ?? '']),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the review.');
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async () => {
    if (!selectedReview) {
      return;
    }

    if (selectedReview.sections.some((section) => !(selfResponses[section.sectionKey] ?? '').trim())) {
      setError('Complete all self-review sections before submitting.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await submitSelfReview(selectedReview.id, {
        sections: selectedReview.sections.map((section) => ({
          sectionKey: section.sectionKey,
          response: selfResponses[section.sectionKey] ?? '',
        })),
      });

      const refreshedReview = await getPerformanceReview(selectedReview.id);
      setSelectedReview(refreshedReview);
      await Promise.all([loadData(), refreshInboxSummary()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to submit the self-review.');
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeReview = async (reviewId: string) => {
    setSaving(true);
    setError(null);

    try {
      await acknowledgePerformanceReview(reviewId);
      setSelectedReview(null);
      await Promise.all([loadData(), refreshInboxSummary()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to acknowledge the review.');
    } finally {
      setSaving(false);
    }
  };

  const submitGoalUpdate = async () => {
    if (!selectedGoal) {
      return;
    }

    const validationMessage = validateGoalUpdate(goalUpdateNote);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    const progressValidationMessage = validateGoalProgress(goalProgress);
    if (progressValidationMessage) {
      setError(progressValidationMessage);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createPerformanceGoalUpdate(selectedGoal.id, {
        progressNote: goalUpdateNote,
        percentComplete: normalizeGoalProgress(goalProgress),
      });

      setSelectedGoal(null);
      setGoalUpdateNote('');
      setGoalProgress('');
      await Promise.all([loadData(), refreshInboxSummary()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add the goal update.');
    } finally {
      setSaving(false);
    }
  };

  if (!currentEmployeeId && !loading) {
    return (
      <section className="my-performance-page">
        <div className="card my-performance-hero">
          <div className="page-header">
            <div>
              <span className="my-performance-eyebrow">My Work</span>
              <h1 className="page-title">My Planning for Success</h1>
              <p className="page-subtitle">Link this account to an employee profile before using goals, self-review, and review acknowledgment.</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="my-performance-page">
      <div className="card my-performance-hero">
        <div className="page-header my-performance-header">
          <div>
            <span className="my-performance-eyebrow">My Work</span>
            <h1 className="page-title">My Planning for Success</h1>
            <p className="page-subtitle">Track your goals, complete narrative self-reviews, and acknowledge finalized feedback from one clean self-service workspace.</p>
          </div>
          <button type="button" className="button button-outline" onClick={() => { void loadData(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="my-performance-banner">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {summary ? (
          <div className="my-performance-summary-grid">
            <SummaryCard label="Active goals" value={summary.self.activeGoals} detail="Current individual goals" />
            <SummaryCard label="Self-review due" value={summary.self.selfReviewDue} detail="Reviews awaiting your narrative" />
            <SummaryCard label="Acknowledgments due" value={summary.self.acknowledgmentsDue} detail="Finalized reviews waiting for acknowledgment" />
            <SummaryCard label="Completed goals" value={summary.self.completedGoals} detail="Closed work from prior cycles" />
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="my-performance-tab-list">
          {([
            ['goals', 'My Goals'],
            ['reviews', 'My Reviews'],
            ['history', 'History'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`my-performance-tab ${tab === value ? 'my-performance-tab-active' : ''}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="my-performance-state">
            <LoaderCircle className="my-performance-spin" size={18} />
            <span>Loading my performance...</span>
          </div>
        ) : null}

        {!loading && tab === 'goals' ? (
          <div className="my-performance-card-list">
            {currentGoals.length === 0 ? (
              <div className="my-performance-empty">No active goals are currently assigned to you.</div>
            ) : currentGoals.map((goal) => (
              <article key={goal.id} className="my-performance-card">
                <div className="my-performance-card-header">
                  <div>
                    <h3>{goal.title}</h3>
                    <p>{goal.manager?.fullName ?? 'No manager assigned'} | Due {formatDate(goal.targetDate)}</p>
                  </div>
                  <span className="badge badge-primary">{goal.status}</span>
                </div>
                <p className="my-performance-copy">{goal.description ?? 'No goal description provided.'}</p>
                <div className="my-performance-updates">
                  <strong>Recent updates</strong>
                  {goal.updates.length === 0 ? (
                    <span>No updates yet.</span>
                  ) : goal.updates.map((update) => (
                    <div key={update.id} className="my-performance-update-row">
                      <span>{update.progressNote}</span>
                      <span>{update.percentComplete ?? 'N/A'}%</span>
                    </div>
                  ))}
                </div>
                {goal.permissions.canAddUpdate ? (
                  <div className="my-performance-card-actions">
                    <button type="button" className="button button-outline" onClick={() => setSelectedGoal(goal)}>
                      <Target size={16} />
                      Add progress update
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {!loading && tab === 'reviews' ? (
          <div className="my-performance-card-list">
            {currentReviews.length === 0 ? (
              <div className="my-performance-empty">No active reviews are currently assigned to you.</div>
            ) : currentReviews.map((review) => (
              <article key={review.id} className="my-performance-card">
                <div className="my-performance-card-header">
                  <div>
                    <h3>{review.cycle?.name ?? 'Performance review'}</h3>
                    <p>{review.status} | Self due {formatDate(review.cycle?.selfReviewDueDate ?? null)}</p>
                  </div>
                  <span className={`badge ${review.status === 'Finalized' ? 'badge-warning' : 'badge-primary'}`}>{review.status}</span>
                </div>
                <div className="my-performance-meta-grid">
                  <span><strong>Manager:</strong> {review.manager?.fullName ?? 'Not assigned'}</span>
                  <span><strong>Released:</strong> {formatDate(review.releasedAt)}</span>
                </div>
                <div className="my-performance-card-actions">
                  <button type="button" className="button button-outline" onClick={() => { void openReviewModal(review.id); }}>
                    Open review
                  </button>
                  {review.permissions.canAcknowledge ? (
                    <button type="button" className="button" onClick={() => { void acknowledgeReview(review.id); }} disabled={saving}>
                      <CheckCircle2 size={16} />
                      Acknowledge
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && tab === 'history' ? (
          <div className="my-performance-history-grid">
            <div className="my-performance-history-block">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Goal history</h3>
                  <p className="card-subtitle">Completed and closed individual goals.</p>
                </div>
              </div>
              <div className="my-performance-history-list">
                {historyGoals.length === 0 ? (
                  <div className="my-performance-empty">No goal history yet.</div>
                ) : historyGoals.map((goal) => (
                  <div key={goal.id} className="my-performance-history-row">
                    <span>{goal.title}</span>
                    <span>{goal.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="my-performance-history-block">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Review history</h3>
                  <p className="card-subtitle">Released reviews you have already acknowledged.</p>
                </div>
              </div>
              <div className="my-performance-history-list">
                {historyReviews.length === 0 ? (
                  <div className="my-performance-empty">No review history yet.</div>
                ) : historyReviews.map((review) => (
                  <div key={review.id} className="my-performance-history-row">
                    <span>{review.cycle?.name ?? 'Review'}</span>
                    <span>{formatDate(review.acknowledgedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selectedReview ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card my-performance-modal" role="dialog" aria-modal="true" aria-labelledby="my-review-title">
            <div className="modal-header">
              <div>
                <h2 id="my-review-title" className="card-title">{selectedReview.cycle?.name ?? 'Review'}</h2>
                <p className="card-subtitle">{selectedReview.status}</p>
              </div>
            </div>
            <div className="my-performance-review-list">
              {selectedReview.sections.map((section) => (
                <div key={section.id} className="my-performance-review-section">
                  <h3>{section.sectionTitle}</h3>
                  {selectedReview.permissions.canSelfReview ? (
                    <label className="my-performance-field">
                      <span>Your response</span>
                      <textarea
                        rows={4}
                        value={selfResponses[section.sectionKey] ?? ''}
                        onChange={(event) => setSelfResponses((current) => ({ ...current, [section.sectionKey]: event.target.value }))}
                      />
                    </label>
                  ) : (
                    <>
                      <div className="my-performance-readonly-block">{section.employeeResponse || 'No self-review response recorded.'}</div>
                      <div className="my-performance-manager-block">{section.managerResponse || 'Manager feedback not released yet.'}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {selectedReview.managerSummary ? (
              <div className="my-performance-summary-block">
                <strong>Manager summary</strong>
                <p>{selectedReview.managerSummary}</p>
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setSelectedReview(null)}>Close</button>
              {selectedReview.permissions.canSelfReview ? (
                <button type="button" className="button" onClick={() => { void submitReview(); }} disabled={saving}>Submit self-review</button>
              ) : null}
              {selectedReview.permissions.canAcknowledge ? (
                <button type="button" className="button" onClick={() => { void acknowledgeReview(selectedReview.id); }} disabled={saving}>Acknowledge</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selectedGoal ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card my-performance-modal" role="dialog" aria-modal="true" aria-labelledby="my-goal-update-title">
            <div className="modal-header">
              <div>
                <h2 id="my-goal-update-title" className="card-title">Goal progress update</h2>
                <p className="card-subtitle">{selectedGoal.title}</p>
              </div>
            </div>
            <div className="my-performance-form-grid">
              <label className="my-performance-field">
                <span>Progress note</span>
                <textarea rows={5} value={goalUpdateNote} onChange={(event) => setGoalUpdateNote(event.target.value)} />
              </label>
              <label className="my-performance-field">
                <span>Percent complete</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={goalProgress}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === '') {
                      setGoalProgress('');
                      return;
                    }

                    const numericValue = Number(nextValue);
                    if (!Number.isNaN(numericValue) && numericValue >= 0 && numericValue <= 100) {
                      setGoalProgress(nextValue);
                    }
                  }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setSelectedGoal(null)}>Cancel</button>
              <button type="button" className="button" onClick={() => { void submitGoalUpdate(); }} disabled={saving}>Save update</button>
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
    <div className="my-performance-summary-card">
      <span className="my-performance-summary-label">{label}</span>
      <strong className="my-performance-summary-value">{value}</strong>
      <span className="my-performance-summary-detail">{detail}</span>
    </div>
  );
}
