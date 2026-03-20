import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  RefreshCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import {
  approveLeaveRequest,
  approveTimeCard,
  listInboxItems,
  rejectLeaveRequest,
  rejectTimeCard,
  updateWorkflowTask,
  type InboxItem,
  type InboxItemsQuery,
} from './inbox.api';
import './InboxPage.css';

type InboxTab = 'open' | 'approvals' | 'tasks' | 'completed';

function formatShortDate(value: string | null) {
  if (!value) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function getPriorityBadge(priority: string) {
  if (priority === 'High') {
    return 'badge-danger';
  }

  if (priority === 'Low') {
    return 'badge-primary';
  }

  return 'badge-warning';
}

function getSourceRoute(item: InboxItem) {
  if (item.sourceType === 'Leave') {
    return '/time-off';
  }

  if (item.sourceType === 'Performance') {
    if (item.taskType === 'PerformanceManagerReview') {
      return '/performance';
    }

    return '/my-performance';
  }

  if (item.sourceType === 'Learning') {
    return '/my-learning';
  }

  if (item.sourceType === 'Recruitment') {
    return '/recruitment';
  }

  if (item.sourceType === 'Time') {
    return item.taskType === 'TimeCardApproval' ? '/workforce-time' : '/time-attendance';
  }

  if (item.sourceType === 'Checklist' || item.sourceType === 'Document') {
    return '/employees';
  }

  return '/';
}

export function InboxPage() {
  const { session, inboxSummary, refreshInboxSummary } = useAppSession();
  const [tab, setTab] = useState<InboxTab>('open');
  const [dueWindow, setDueWindow] = useState<'all' | 'overdue' | 'today' | 'next7'>('all');
  const [source, setSource] = useState<'' | 'Leave' | 'Checklist' | 'Document' | 'Performance' | 'Learning' | 'Time' | 'Recruitment' | 'Operational'>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<InboxItemsQuery>({
    tab: 'open',
    dueWindow: 'all',
    source: '',
    search: '',
    page: 1,
    limit: 25,
  });
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState<{
    item: InboxItem;
    action: 'approve' | 'reject';
    comments: string;
  } | null>(null);

  const loadItems = useCallback(async (nextQuery: InboxItemsQuery) => {
    setLoading(true);
    setError(null);

    try {
      const result = await listInboxItems(nextQuery);
      setItems(result.data);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load inbox items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems(query);
  }, [loadItems, query]);

  const applyFilters = () => {
    setQuery({
      tab,
      dueWindow,
      source,
      search: search.trim(),
      page: 1,
      limit: 25,
    });
  };

  const changeTab = (nextTab: InboxTab) => {
    setTab(nextTab);
    setQuery((current) => ({
      ...current,
      tab: nextTab,
      page: 1,
    }));
  };

  const handleWorkflowStatusUpdate = async (item: InboxItem, status: 'Open' | 'Completed') => {
    setSavingId(item.id);

    try {
      await updateWorkflowTask(item.id, status);
      await Promise.all([
        loadItems(query),
        refreshInboxSummary(),
      ]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the task.');
    } finally {
      setSavingId(null);
    }
  };

  const submitDecision = async () => {
    if (!decisionState?.item.relatedEntityId) {
      return;
    }

    setSavingId(decisionState.item.id);

    try {
      if (decisionState.item.actionKind === 'approve_time_card') {
        if (decisionState.action === 'approve') {
          await approveTimeCard(decisionState.item.relatedEntityId, decisionState.comments);
        } else {
          await rejectTimeCard(decisionState.item.relatedEntityId, decisionState.comments);
        }
      } else if (decisionState.action === 'approve') {
        await approveLeaveRequest(decisionState.item.relatedEntityId, decisionState.comments);
      } else {
        await rejectLeaveRequest(decisionState.item.relatedEntityId, decisionState.comments);
      }

      setDecisionState(null);
      await Promise.all([
        loadItems(query),
        refreshInboxSummary(),
      ]);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to update the leave request.');
    } finally {
      setSavingId(null);
    }
  };

  const tabCounts = useMemo(() => ({
    open: inboxSummary?.openCount ?? 0,
    approvals: inboxSummary?.approvalCount ?? 0,
    tasks: Math.max((inboxSummary?.openCount ?? 0) - (inboxSummary?.approvalCount ?? 0), 0),
    completed: tab === 'completed' ? pagination.total : 0,
  }), [inboxSummary, pagination.total, tab]);

  return (
    <div className="inbox-stack">
      <div className="card inbox-hero">
        <div className="page-header inbox-hero-header">
          <div>
            <span className="inbox-eyebrow">Personal Work</span>
            <h1 className="page-title">Inbox</h1>
            <p className="page-subtitle">Your approvals, tasks, and operational alerts for the current account in one focused workspace.</p>
          </div>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              void Promise.all([
                loadItems(query),
                refreshInboxSummary(),
              ]);
            }}
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {session && !session.accountLinked ? (
          <div className="inbox-banner">
            <ShieldAlert size={16} />
            <span>Your account is not linked to an employee profile yet. Queue work is visible, but self and manager assignments may be limited.</span>
          </div>
        ) : null}

        {error ? (
          <div className="inbox-banner inbox-banner-error">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="inbox-summary-grid">
        <div className="card inbox-summary-card">
          <span className="inbox-summary-label">Open work</span>
          <span className="inbox-summary-value">{(inboxSummary?.openCount ?? 0).toLocaleString()}</span>
          <span className="inbox-summary-detail">All currently assigned work</span>
        </div>
        <div className="card inbox-summary-card">
          <span className="inbox-summary-label">Overdue</span>
          <span className="inbox-summary-value">{(inboxSummary?.overdueCount ?? 0).toLocaleString()}</span>
          <span className="inbox-summary-detail">Items past their due date</span>
        </div>
        <div className="card inbox-summary-card">
          <span className="inbox-summary-label">Approvals</span>
          <span className="inbox-summary-value">{(inboxSummary?.approvalCount ?? 0).toLocaleString()}</span>
          <span className="inbox-summary-detail">Leave and time approvals awaiting action</span>
        </div>
        <div className="card inbox-summary-card">
          <span className="inbox-summary-label">Due today</span>
          <span className="inbox-summary-value">{(inboxSummary?.dueTodayCount ?? 0).toLocaleString()}</span>
          <span className="inbox-summary-detail">Priority items due this day</span>
        </div>
      </div>

      <div className="card inbox-toolbar-card">
        <div className="inbox-tabs" role="tablist" aria-label="Inbox tabs">
          {([
            ['open', 'Open'],
            ['approvals', 'Approvals'],
            ['tasks', 'Tasks'],
            ['completed', 'Completed'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`inbox-tab ${tab === value ? 'inbox-tab-active' : ''}`}
              onClick={() => changeTab(value)}
            >
              <span>{label}</span>
              <span className="inbox-tab-count">{tabCounts[value]}</span>
            </button>
          ))}
        </div>

        <div className="inbox-filters">
          <label className="inbox-field">
            <span>Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
              <option value="">All sources</option>
              <option value="Leave">Leave</option>
              <option value="Checklist">Checklist</option>
              <option value="Document">Document</option>
              <option value="Performance">Performance</option>
              <option value="Learning">Learning</option>
              <option value="Time">Time</option>
              <option value="Operational">Operational</option>
            </select>
          </label>

          <label className="inbox-field">
            <span>Due window</span>
            <select value={dueWindow} onChange={(event) => setDueWindow(event.target.value as typeof dueWindow)}>
              <option value="all">All dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="next7">Next 7 days</option>
            </select>
          </label>

          <label className="inbox-field inbox-search-field">
            <span>Search</span>
            <div className="inbox-search-input">
              <Search size={16} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyFilters();
                  }
                }}
                placeholder="Search title or employee"
              />
            </div>
          </label>

          <div className="inbox-filter-actions">
            <button type="button" className="button" onClick={applyFilters}>
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Assigned work</h3>
            <p className="card-subtitle">Focused queue for your current account and queue memberships.</p>
          </div>
          <span className="inbox-results-label">{pagination.total.toLocaleString()} items</span>
        </div>

        {loading ? (
          <div className="inbox-state">
            <LoaderCircle className="inbox-spin" size={18} />
            <span>Loading inbox...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="inbox-state">
            <span>No inbox items match the current filters.</span>
          </div>
        ) : (
          <>
            <div className="inbox-table-shell">
              <table className="data-table inbox-table">
                <thead>
                  <tr>
                    <th>Work item</th>
                    <th>Source</th>
                    <th>Subject</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="inbox-title-cell">
                          <div className="inbox-item-title">{item.title}</div>
                          <div className="inbox-item-meta">{item.taskType} | {item.status}</div>
                        </div>
                      </td>
                      <td>{item.sourceType}</td>
                      <td>{item.subjectEmployee?.fullName ?? 'No employee context'}</td>
                      <td>{formatShortDate(item.dueDate)}</td>
                      <td><span className={`badge ${getPriorityBadge(item.priority)}`}>{item.priority}</span></td>
                      <td>{item.assignee.label}</td>
                      <td>{renderActionCell(item, savingId, setDecisionState, handleWorkflowStatusUpdate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="inbox-card-list">
              {items.map((item) => (
                <div key={item.id} className="inbox-card">
                  <div className="inbox-card-header">
                    <div>
                      <div className="inbox-item-title">{item.title}</div>
                      <div className="inbox-item-meta">{item.sourceType} | {item.taskType}</div>
                    </div>
                    <span className={`badge ${getPriorityBadge(item.priority)}`}>{item.priority}</span>
                  </div>
                  <div className="inbox-card-grid">
                    <span><strong>Subject:</strong> {item.subjectEmployee?.fullName ?? 'No employee context'}</span>
                    <span><strong>Due:</strong> {formatShortDate(item.dueDate)}</span>
                    <span><strong>Assigned:</strong> {item.assignee.label}</span>
                    <span><strong>Status:</strong> {item.status}</span>
                  </div>
                  <div className="inbox-card-actions">
                    {renderActionCell(item, savingId, setDecisionState, handleWorkflowStatusUpdate)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="inbox-pagination">
          <button
            type="button"
            className="button button-outline"
            disabled={pagination.page <= 1 || loading}
            onClick={() => setQuery((current) => ({ ...current, page: Math.max(current.page ?? 1, 2) - 1 }))}
          >
            <ArrowLeft size={16} />
            Previous
          </button>
          <span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span>
          <button
            type="button"
            className="button button-outline"
            disabled={pagination.page >= pagination.totalPages || loading || pagination.totalPages === 0}
            onClick={() => setQuery((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
          >
            Next
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {decisionState ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="inbox-decision-title">
            <div className="modal-header">
              <div>
                <h2 id="inbox-decision-title" className="card-title">
                  {decisionState.item.actionKind === 'approve_time_card'
                    ? (decisionState.action === 'approve' ? 'Approve time card' : 'Reject time card')
                    : (decisionState.action === 'approve' ? 'Approve leave request' : 'Reject leave request')}
                </h2>
                <p className="card-subtitle">{decisionState.item.title}</p>
              </div>
            </div>

            <label className="inbox-field">
              <span>Comments</span>
              <textarea
                rows={4}
                value={decisionState.comments}
                onChange={(event) => setDecisionState((current) => current ? { ...current, comments: event.target.value } : null)}
                placeholder="Optional note for the employee or audit trail"
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-outline" onClick={() => setDecisionState(null)}>
                Cancel
              </button>
              <button type="button" className="button" onClick={() => { void submitDecision(); }} disabled={savingId === decisionState.item.id}>
                {decisionState.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderActionCell(
  item: InboxItem,
  savingId: string | null,
  setDecisionState: (state: {
    item: InboxItem;
    action: 'approve' | 'reject';
    comments: string;
  } | null) => void,
  handleWorkflowStatusUpdate: (item: InboxItem, status: 'Open' | 'Completed') => Promise<void>,
) {
  if ((item.actionKind === 'approve_leave' || item.actionKind === 'approve_time_card') && item.relatedEntityId) {
    return (
      <div className="inbox-row-actions">
        <button
          type="button"
          className="button button-outline"
          onClick={() => setDecisionState({ item, action: 'approve', comments: '' })}
          disabled={savingId === item.id}
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button
          type="button"
          className="button button-outline"
          onClick={() => setDecisionState({ item, action: 'reject', comments: '' })}
          disabled={savingId === item.id}
        >
          <XCircle size={16} />
          Reject
        </button>
      </div>
    );
  }

  if (item.actionKind === 'complete_task') {
    return (
      <button
        type="button"
        className="button button-outline"
        onClick={() => { void handleWorkflowStatusUpdate(item, item.status === 'Completed' ? 'Open' : 'Completed'); }}
        disabled={savingId === item.id}
      >
        <ClipboardCheck size={16} />
        {item.status === 'Completed' ? 'Reopen' : 'Complete'}
      </button>
    );
  }

  return (
    <Link to={getSourceRoute(item)} className="button button-outline">
      Open record
    </Link>
  );
}
