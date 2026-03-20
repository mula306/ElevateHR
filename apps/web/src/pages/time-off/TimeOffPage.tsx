import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import {
  cancelLeaveRequest,
  createLeaveRequest,
  listHolidays,
  listLeaveRequests,
  listLeaveTypes,
  updateLeaveRequest,
  type HolidayRecord,
  type LeaveRequestPayload,
  type LeaveRequestRecord,
  type LeaveTypeRecord,
} from './time-off.api';
import { isFeatureEnabled } from '@/shared/features/feature-registry';
import './TimeOffPage.css';

type LeaveFilterStatus = 'All' | LeaveRequestRecord['status'];

interface LeaveRequestFormValues {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  requestedHours: string;
  notes: string;
}

const statusOptions: LeaveFilterStatus[] = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
const hourFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function createDefaultFormValues(): LeaveRequestFormValues {
  const today = format(new Date(), 'yyyy-MM-dd');

  return {
    leaveTypeId: '',
    startDate: today,
    endDate: today,
    requestedHours: '8',
    notes: '',
  };
}

function formatShortDate(value: string | null) {
  if (!value) {
    return 'TBD';
  }

  return format(new Date(value), 'MMM d, yyyy');
}

function formatHours(value: number) {
  return hourFormatter.format(value);
}

function getStatusBadgeClass(status: LeaveRequestRecord['status']) {
  if (status === 'Approved') {
    return 'badge-success';
  }

  if (status === 'Pending') {
    return 'badge-warning';
  }

  if (status === 'Rejected') {
    return 'badge-danger';
  }

  return 'badge-primary';
}

function toPayload(values: LeaveRequestFormValues): LeaveRequestPayload {
  return {
    leaveTypeId: values.leaveTypeId,
    startDate: values.startDate,
    endDate: values.endDate,
    requestedHours: Number(values.requestedHours),
    notes: values.notes.trim() || null,
  };
}

export function TimeOffPage() {
  const { session } = useAppSession();
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveFilterStatus>('All');
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<LeaveRequestRecord | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<LeaveRequestRecord | null>(null);
  const [cancelComments, setCancelComments] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<LeaveRequestFormValues>({
    defaultValues: createDefaultFormValues(),
  });

  const isAccountLinked = Boolean(session?.accountLinked && session.account?.employee);
  const timeOffRequestsEnabled = isFeatureEnabled(session?.features, 'time_off_requests');
  const requesterName = session?.account?.employee?.fullName ?? session?.account?.displayName ?? 'You';

  const loadTimeOffData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [leaveTypeData, holidayData, leaveRequestResponse] = await Promise.all([
        listLeaveTypes(),
        listHolidays(),
        listLeaveRequests({
          page: 1,
          limit: 100,
          search: search || undefined,
          status: statusFilter === 'All' ? undefined : statusFilter,
        }),
      ]);

      setLeaveTypes(leaveTypeData);
      setHolidays(holidayData);
      setLeaveRequests(leaveRequestResponse.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load time off data.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTimeOffData();
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [loadTimeOffData, session?.account?.id, session?.accountLinked]);

  const openCreatePanel = () => {
    if (!isAccountLinked || !timeOffRequestsEnabled) {
      return;
    }

    setSelectedLeaveRequest(null);
    reset(createDefaultFormValues());
    setPanelOpen(true);
  };

  const openEditPanel = (leaveRequest: LeaveRequestRecord) => {
    if (!leaveRequest.canEdit) {
      return;
    }

    if (!timeOffRequestsEnabled) {
      return;
    }

    setSelectedLeaveRequest(leaveRequest);
    reset({
      leaveTypeId: leaveRequest.leaveType?.id ?? '',
      startDate: leaveRequest.startDate?.slice(0, 10) ?? createDefaultFormValues().startDate,
      endDate: leaveRequest.endDate?.slice(0, 10) ?? createDefaultFormValues().endDate,
      requestedHours: String(leaveRequest.requestedHours),
      notes: leaveRequest.notes ?? '',
    });
    setPanelOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);

    try {
      if (!isAccountLinked) {
        throw new Error('Your account must be linked to an employee profile before requesting time off.');
      }

      if (!timeOffRequestsEnabled) {
        throw new Error('Time off requests are currently unavailable.');
      }

      const payload = toPayload(values);
      if (Number.isNaN(payload.requestedHours) || payload.requestedHours <= 0) {
        throw new Error('Requested hours must be a positive number.');
      }

      if (selectedLeaveRequest) {
        await updateLeaveRequest(selectedLeaveRequest.id, payload);
      } else {
        await createLeaveRequest(payload);
      }

      setPanelOpen(false);
      setSelectedLeaveRequest(null);
      reset(createDefaultFormValues());
      await loadTimeOffData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save the leave request.');
    } finally {
      setSubmitting(false);
    }
  });

  const submitCancel = async () => {
    if (!cancelCandidate) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (!timeOffRequestsEnabled) {
        throw new Error('Time off requests are currently unavailable.');
      }

      await cancelLeaveRequest(cancelCandidate.id, {
        comments: cancelComments.trim() || null,
      });

      setCancelCandidate(null);
      setCancelComments('');
      await loadTimeOffData();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel the leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const startOfToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const pendingCount = leaveRequests.filter((request) => request.status === 'Pending').length;
  const approvedUpcoming = leaveRequests.filter((request) => {
    if (request.status !== 'Approved' || !request.endDate) {
      return false;
    }

    return new Date(request.endDate).getTime() >= startOfToday.getTime();
  }).length;
  const totalRequestedHours = leaveRequests.reduce((total, request) => total + request.requestedHours, 0);

  const upcomingHolidays = useMemo(() => {
    return [...holidays]
      .filter((holiday) => !holiday.holidayDate || new Date(holiday.holidayDate).getTime() >= startOfToday.getTime())
      .sort((left, right) => new Date(left.holidayDate ?? '').getTime() - new Date(right.holidayDate ?? '').getTime())
      .slice(0, 4);
  }, [holidays, startOfToday]);

  return (
    <section className="timeoff-page">
      <div className="timeoff-hero card">
        <div className="page-header timeoff-page-header">
          <div>
            <span className="timeoff-eyebrow">Self-Service</span>
            <h1 className="page-title">My Time Off</h1>
            <p className="page-subtitle">Request time away for yourself, track request status, and keep upcoming holidays visible without mixing in approvals.</p>
          </div>
          <button type="button" className="button" onClick={openCreatePanel} disabled={!isAccountLinked || !timeOffRequestsEnabled}>
            <Plus size={16} />
            New request
          </button>
        </div>

        {!timeOffRequestsEnabled ? (
          <div className="timeoff-banner timeoff-banner-info">
            <AlertTriangle size={16} />
            <span>Time off requests are currently turned off by your administrator. You can still review your request history and company holidays.</span>
          </div>
        ) : null}

        {!isAccountLinked ? (
          <div className="timeoff-banner timeoff-banner-info">
            <AlertTriangle size={16} />
            <span>Your account is not linked to an employee profile yet. You can review holidays, but you cannot submit time off requests until HR completes the link.</span>
          </div>
        ) : null}

        <div className="timeoff-metrics">
          <MetricTile label="My pending requests" value={String(pendingCount)} icon={<Clock3 size={16} />} />
          <MetricTile label="My approved upcoming" value={String(approvedUpcoming)} icon={<CheckCircle2 size={16} />} />
          <MetricTile label="My requested hours" value={formatHours(totalRequestedHours)} icon={<CalendarDays size={16} />} />
        </div>
      </div>

      <div className="timeoff-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">My Requests</h3>
              <p className="card-subtitle">View your history, keep pending requests current, and cancel only items that have not been decided.</p>
            </div>
            <button
              type="button"
              className="button button-outline timeoff-refresh-button"
              onClick={() => { void loadTimeOffData(); }}
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>

          <div className="timeoff-toolbar">
            <label className="timeoff-search">
              <Search size={16} className="timeoff-search-icon" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search leave type or notes"
              />
            </label>
            <select className="timeoff-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeaveFilterStatus)}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === 'All' ? 'All statuses' : status}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div className="timeoff-banner timeoff-banner-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="timeoff-empty-state">
              <LoaderCircle className="timeoff-spin" size={20} />
              <span>Loading your time off requests...</span>
            </div>
          ) : null}

          {!loading && !isAccountLinked ? (
            <div className="timeoff-empty-state">
              <CalendarDays size={20} />
              <div className="timeoff-empty-state-copy">
                <strong>No request history is available yet.</strong>
                <span>Once your account is linked to an employee profile, your time off requests will appear here.</span>
              </div>
            </div>
          ) : null}

          {!loading && isAccountLinked && leaveRequests.length === 0 ? (
            <div className="timeoff-empty-state">
              <CalendarDays size={20} />
              <div className="timeoff-empty-state-copy">
                <strong>No requests matched the current filters.</strong>
                <span>Create a new request or adjust the filters to see more history.</span>
              </div>
            </div>
          ) : null}

          {!loading && leaveRequests.length > 0 ? (
            <>
              <div className="timeoff-table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th>Dates</th>
                      <th>Hours</th>
                      <th>Status</th>
                      <th>Routed To</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <div className="timeoff-request-title">{request.leaveType?.name ?? 'Leave request'}</div>
                          {request.notes ? <div className="timeoff-request-meta">{request.notes}</div> : null}
                        </td>
                        <td>{formatShortDate(request.startDate)} to {formatShortDate(request.endDate)}</td>
                        <td>{formatHours(request.requestedHours)}</td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(request.status)}`}>{request.status}</span>
                          {request.decisionComment ? <div className="timeoff-request-note">{request.decisionComment}</div> : null}
                        </td>
                        <td>{request.approver?.fullName ?? 'HR Operations'}</td>
                        <td>
                          <div className="timeoff-row-actions">
                            {timeOffRequestsEnabled && request.canEdit ? (
                              <button type="button" className="button button-outline timeoff-action-button" onClick={() => openEditPanel(request)}>
                                Edit
                              </button>
                            ) : null}
                            {timeOffRequestsEnabled && request.canCancel ? (
                              <button
                                type="button"
                                className="button button-outline timeoff-action-button-danger"
                                onClick={() => setCancelCandidate(request)}
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="timeoff-mobile-list">
                {leaveRequests.map((request) => (
                  <article key={request.id} className="timeoff-mobile-card">
                    <div className="timeoff-mobile-card-header">
                      <div>
                        <div className="timeoff-request-title">{request.leaveType?.name ?? 'Leave request'}</div>
                        <div className="timeoff-person-meta">{formatHours(request.requestedHours)} hours | {formatShortDate(request.startDate)} to {formatShortDate(request.endDate)}</div>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(request.status)}`}>{request.status}</span>
                    </div>
                    <div className="timeoff-mobile-grid">
                      <MobileDatum label="Routed to" value={request.approver?.fullName ?? 'HR Operations'} />
                      <MobileDatum label="Hours" value={`${formatHours(request.requestedHours)} hrs`} />
                    </div>
                    {request.notes ? <p className="timeoff-request-note">{request.notes}</p> : null}
                    {request.decisionComment ? <p className="timeoff-request-note">{request.decisionComment}</p> : null}
                    <div className="timeoff-mobile-actions">
                      {timeOffRequestsEnabled && request.canEdit ? (
                        <button type="button" className="button button-outline" onClick={() => openEditPanel(request)}>
                          Edit
                        </button>
                      ) : null}
                      {timeOffRequestsEnabled && request.canCancel ? (
                        <button type="button" className="button button-outline timeoff-action-button-danger" onClick={() => setCancelCandidate(request)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="timeoff-side-column">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Upcoming Holidays</h3>
                <p className="card-subtitle">Keep company closures visible while planning your own time away.</p>
              </div>
            </div>
            <div className="timeoff-side-list">
              {upcomingHolidays.length > 0 ? upcomingHolidays.map((holiday) => (
                <div key={holiday.id} className="timeoff-side-row">
                  <div>
                    <div className="timeoff-side-title">{holiday.name}</div>
                    <div className="timeoff-side-meta">{holiday.note ?? 'Company holiday'}</div>
                  </div>
                  <span className="badge badge-primary">{formatShortDate(holiday.holidayDate)}</span>
                </div>
              )) : (
                <div className="timeoff-empty-state timeoff-side-empty">
                  <CalendarDays size={18} />
                  <span>No upcoming holidays are configured.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`timeoff-panel-overlay ${panelOpen && timeOffRequestsEnabled ? 'timeoff-panel-overlay-visible' : ''}`} onClick={() => setPanelOpen(false)} />
      <aside className={`timeoff-panel ${panelOpen && timeOffRequestsEnabled ? 'timeoff-panel-open' : ''}`}>
        <div className="timeoff-panel-header">
          <div>
            <h2>{selectedLeaveRequest ? 'Edit time off request' : 'New time off request'}</h2>
            <p>Request time away for yourself. Approvals are routed automatically to your active manager or to HR Operations when no manager is available.</p>
          </div>
          <button type="button" className="timeoff-icon-button" onClick={() => setPanelOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <form className="timeoff-form" onSubmit={onSubmit}>
          <div className="timeoff-requester-summary">
            <div>
              <span className="timeoff-mobile-label">Requester</span>
              <strong>{requesterName}</strong>
            </div>
            <p className="timeoff-panel-note">
              {selectedLeaveRequest?.approver?.fullName
                ? `Current route: ${selectedLeaveRequest.approver.fullName}`
                : 'Requests route to your manager when available, otherwise to HR Operations.'}
            </p>
          </div>

          <label className="timeoff-field">
            <span>Leave type</span>
            <select {...register('leaveTypeId', { required: 'Leave type is required' })}>
              <option value="">Select leave type</option>
              {leaveTypes.map((leaveType) => (
                <option key={leaveType.id} value={leaveType.id}>{leaveType.name}</option>
              ))}
            </select>
            {errors.leaveTypeId ? <small>{errors.leaveTypeId.message}</small> : null}
          </label>

          <div className="timeoff-form-grid">
            <label className="timeoff-field">
              <span>Start date</span>
              <input type="date" {...register('startDate', { required: 'Start date is required' })} />
              {errors.startDate ? <small>{errors.startDate.message}</small> : null}
            </label>
            <label className="timeoff-field">
              <span>End date</span>
              <input type="date" {...register('endDate', { required: 'End date is required' })} />
              {errors.endDate ? <small>{errors.endDate.message}</small> : null}
            </label>
          </div>

          <label className="timeoff-field">
            <span>Requested hours</span>
            <input type="number" min="1" step="0.5" {...register('requestedHours', { required: 'Requested hours are required' })} />
            {errors.requestedHours ? <small>{errors.requestedHours.message}</small> : null}
          </label>

          <label className="timeoff-field">
            <span>Notes</span>
            <textarea rows={5} {...register('notes')} placeholder="Add context for your manager or HR if needed." />
          </label>

          <div className="timeoff-form-actions">
            <button type="button" className="button button-outline" onClick={() => setPanelOpen(false)}>Close</button>
            <button type="submit" className="button" disabled={submitting || !isAccountLinked || !timeOffRequestsEnabled}>
              {submitting ? <LoaderCircle className="timeoff-spin" size={16} /> : <CalendarDays size={16} />}
              {selectedLeaveRequest ? 'Save changes' : 'Submit request'}
            </button>
          </div>
        </form>
      </aside>

      {cancelCandidate ? (
        <div className="timeoff-dialog-backdrop">
          <div className="timeoff-dialog card">
            <div className="timeoff-dialog-icon"><AlertTriangle size={20} /></div>
            <h2>Cancel time off request</h2>
            <p>
              Cancel your {cancelCandidate.leaveType?.name ?? 'time off'} request for {formatHours(cancelCandidate.requestedHours)} hours
              from {formatShortDate(cancelCandidate.startDate)} to {formatShortDate(cancelCandidate.endDate)}.
            </p>
            <label className="timeoff-field">
              <span>Cancellation note</span>
              <textarea
                rows={4}
                value={cancelComments}
                onChange={(event) => setCancelComments(event.target.value)}
                placeholder="Optional note for your manager or HR."
              />
            </label>
            <div className="timeoff-dialog-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setCancelCandidate(null);
                  setCancelComments('');
                }}
              >
                Keep request
              </button>
              <button type="button" className="button timeoff-danger-button" onClick={() => { void submitCancel(); }} disabled={submitting}>
                {submitting ? <LoaderCircle className="timeoff-spin" size={16} /> : null}
                Cancel request
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="timeoff-metric-tile">
      <span className="timeoff-metric-label">{label}</span>
      <strong className="timeoff-metric-value">{value}</strong>
      <span className="timeoff-metric-icon">{icon}</span>
    </div>
  );
}

function MobileDatum({ label, value }: { label: string; value: string }) {
  return <div><span className="timeoff-mobile-label">{label}</span><strong>{value}</strong></div>;
}
