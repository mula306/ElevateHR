import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { isFeatureEnabled } from '@/shared/features/feature-registry';
import { getOperationalReports, type OperationsReport } from './reports.api';
import './ReportsPage.css';

type ReportView = 'headcount' | 'staffing' | 'movement' | 'leave' | 'lifecycle' | 'documents' | 'performance' | 'recruitment' | 'learning' | 'time';

const reportViews: Array<{ id: ReportView; label: string }> = [
  { id: 'headcount', label: 'Headcount' },
  { id: 'staffing', label: 'Staffing' },
  { id: 'movement', label: 'Movement' },
  { id: 'leave', label: 'Leave' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'documents', label: 'Documents' },
  { id: 'performance', label: 'Planning for Success' },
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'learning', label: 'Learning' },
  { id: 'time', label: 'Time & Attendance' },
];

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

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header] ?? '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { session } = useAppSession();
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [selectedView, setSelectedView] = useState<ReportView>('headcount');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextReport = await getOperationalReports();
      setReport(nextReport);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  const performanceEnabled = isFeatureEnabled(session?.features, 'planning_management');
  const learningEnabled = isFeatureEnabled(session?.features, 'learning_management');
  const timeOffRequestsEnabled = isFeatureEnabled(session?.features, 'time_off_requests');
  const timeAttendanceEnabled = isFeatureEnabled(session?.features, 'time_attendance_management');

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const visibleReportViews = useMemo(() => reportViews.filter((view) => {
    if (view.id === 'performance') {
      return performanceEnabled;
    }

    if (view.id === 'learning') {
      return learningEnabled;
    }

    if (view.id === 'time') {
      return timeAttendanceEnabled;
    }

    if (view.id === 'leave') {
      return timeOffRequestsEnabled;
    }

    return true;
  }), [learningEnabled, performanceEnabled, timeAttendanceEnabled, timeOffRequestsEnabled]);

  useEffect(() => {
    if (!visibleReportViews.some((view) => view.id === selectedView)) {
      setSelectedView(visibleReportViews[0]?.id ?? 'headcount');
    }
  }, [selectedView, visibleReportViews]);

  const exportRows = useMemo(() => {
    if (!report) {
      return [];
    }

    switch (selectedView) {
      case 'headcount':
        return report.headcountByOrgUnit.map((row) => ({
          Code: row.code,
          Name: row.name,
          Type: row.type,
          'Approved Headcount': row.approvedHeadcount,
          'Filled Seats': row.filledSeats,
          'Open Seats': row.openSeats,
          'Active Employees': row.activeEmployees,
        }));
      case 'staffing':
        return report.staffingCoverage.map((row) => ({
          'Position Code': row.positionCode,
          Title: row.title,
          'Org Unit': row.orgUnit?.name ?? '',
          'Approved Headcount': row.approvedHeadcount,
          'Filled Seats': row.filledSeats,
          'Open Seats': row.openSeats,
          Incumbents: row.incumbents.map((employee) => employee.fullName).join('; '),
        }));
      case 'movement':
        return report.peopleMovement.events.map((row) => ({
          'Employee Number': row.employeeNumber,
          Employee: row.fullName,
          Department: row.department,
          'Event Type': row.eventType,
          'Event Date': row.eventDate ?? '',
          Status: row.status,
        }));
      case 'leave':
        return report.leaveSnapshot.requests.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          'Leave Type': row.leaveType?.name ?? '',
          'Start Date': row.startDate ?? '',
          'End Date': row.endDate ?? '',
          Hours: row.requestedHours,
        }));
      case 'lifecycle':
        return report.lifecycleStatus.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          Title: row.title,
          Lifecycle: row.lifecycleType,
          'Due Date': row.dueDate ?? '',
          'Open Items': row.openItems,
          'Overdue Items': row.overdueItems,
        }));
      case 'documents':
        return report.documentCompliance.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          Title: row.title,
          Status: row.status,
          Category: row.category ?? '',
          'Expiry Date': row.expiryDate ?? '',
          'Pending Acknowledgments': row.pendingAcknowledgments,
        }));
      case 'performance':
        return report.performance.reviews.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          Manager: row.manager ?? '',
          Cycle: row.cycleName,
          Status: row.status,
          'Self Review Due': row.selfReviewDueDate ?? '',
          'Manager Review Due': row.managerReviewDueDate ?? '',
        }));
      case 'recruitment':
        return report.recruitment.requests.map((row) => ({
          'Request Number': row.requestNumber,
          Title: row.title,
          Status: row.status,
          'Budget Impacting': row.budgetImpacting ? 'Yes' : 'No',
          'Request Type': row.requestType?.name ?? '',
          'Org Unit': row.orgUnit?.name ?? '',
          Requestor: row.requestor?.fullName ?? '',
          'Submitted At': row.submittedAt ?? '',
        }));
      case 'learning':
        return report.learning.records.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          'Learning Item': row.learningItem,
          Provider: row.providerName,
          Status: row.status,
          'Due Date': row.dueDate ?? '',
          'Certificate Expiry': row.certificateExpiresAt ?? '',
        }));
      case 'time':
        return report.timeAttendance.timeCards.map((row) => ({
          Employee: row.employee?.fullName ?? '',
          Department: row.employee?.department ?? '',
          'Org Unit': row.orgUnit?.name ?? '',
          Status: row.status,
          'Period Start': row.periodStart ?? '',
          'Period End': row.periodEnd ?? '',
          'Overtime Hours': row.overtimeHours,
          Exceptions: row.exceptionCount,
        }));
      default:
        return [];
    }
  }, [report, selectedView]);

  if (loading && !report) {
    return (
      <div className="reports-page">
        <div className="card reports-state">
          <LoaderCircle className="reports-spin" size={18} />
          <span>Loading reports...</span>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="reports-page">
        <div className="card reports-state reports-state-error">
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button type="button" className="button" onClick={() => { void loadReport(); }}>
            <RefreshCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <section className="reports-page">
      <div className="reports-hero card">
        <div className="page-header reports-page-header">
          <div>
            <span className="reports-eyebrow">Operational Reporting</span>
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">Fixed operational views for HR leadership and HR Ops, with clean exports instead of a heavyweight report builder.</p>
          </div>
          <div className="reports-header-actions">
            <button type="button" className="button button-outline" onClick={() => { void loadReport(); }}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <button type="button" className="button" onClick={() => downloadCsv(`elevatehr-${selectedView}.csv`, exportRows)}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="reports-metric-grid">
          <MetricCard label="Current employees" value={String(report.overview.currentEmployees)} />
          <MetricCard label="Open seats" value={String(report.overview.openSeats)} />
          {timeOffRequestsEnabled ? <MetricCard label="Pending approvals" value={String(report.overview.pendingApprovals)} /> : null}
          {timeOffRequestsEnabled ? <MetricCard label="Upcoming absences" value={String(report.overview.upcomingAbsences)} /> : null}
          <MetricCard label="Overdue tasks" value={String(report.overview.overdueTasks)} />
          <MetricCard label="Document alerts" value={String(report.overview.expiringDocuments)} />
          {timeAttendanceEnabled ? <MetricCard label="Time approvals" value={String(report.overview.pendingTimeApprovals)} /> : null}
          {timeAttendanceEnabled ? <MetricCard label="Uncovered shifts" value={String(report.overview.uncoveredShifts)} /> : null}
          {performanceEnabled ? <MetricCard label="Active cycles" value={String(report.overview.activePerformanceCycles)} /> : null}
          <MetricCard label="Open requests" value={String(report.overview.openRecruitmentRequests)} />
          {learningEnabled ? <MetricCard label="Learning renewals" value={String(report.overview.learningRenewals)} /> : null}
        </div>
      </div>

      {error ? (
        <div className="reports-banner reports-banner-error">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card">
        <div className="reports-tab-list">
          {visibleReportViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`reports-tab ${selectedView === view.id ? 'reports-tab-active' : ''}`}
              onClick={() => setSelectedView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>

        {selectedView === 'headcount' ? (
          <ReportTable
            title="Headcount by Org Unit"
            subtitle="Approved structure against active workforce counts."
            headers={['Org Unit', 'Type', 'Approved Headcount', 'Filled Seats', 'Open Seats', 'Active Employees']}
            rows={report.headcountByOrgUnit.map((row) => [
              `${row.code} | ${row.name}`,
              row.type,
              row.approvedHeadcount,
              row.filledSeats,
              row.openSeats,
              row.activeEmployees,
            ])}
          />
        ) : null}

        {selectedView === 'staffing' ? (
          <ReportTable
            title="Vacancies and Staffing Coverage"
            subtitle="Operational view of approved seats and vacancy pressure."
            headers={['Position', 'Org Unit', 'Approved Headcount', 'Filled Seats', 'Open Seats', 'Incumbents']}
            rows={report.staffingCoverage.map((row) => [
              `${row.positionCode} | ${row.title}`,
              row.orgUnit?.name ?? 'Unassigned',
              row.approvedHeadcount,
              row.filledSeats,
              row.openSeats,
              row.incumbents.map((employee) => employee.fullName).join(', ') || 'Vacant',
            ])}
          />
        ) : null}

        {selectedView === 'movement' ? (
          <ReportTable
            title="People Movement"
            subtitle="New hires and terminations over the last 90 days."
            headers={['Employee', 'Department', 'Event Type', 'Event Date', 'Status']}
            rows={report.peopleMovement.events.map((row) => [
              `${row.employeeNumber} | ${row.fullName}`,
              row.department,
              row.eventType,
              formatShortDate(row.eventDate),
              row.status,
            ])}
          />
        ) : null}

        {timeOffRequestsEnabled && selectedView === 'leave' ? (
          <ReportTable
            title="Leave Requests and Upcoming Absences"
            subtitle={`${report.leaveSnapshot.pendingApprovalCount} pending approvals | ${report.leaveSnapshot.upcomingApprovedRequests} approved upcoming requests`}
            headers={['Employee', 'Department', 'Leave Type', 'Start', 'End', 'Hours']}
            rows={report.leaveSnapshot.requests.map((row) => [
              row.employee?.fullName ?? 'Unknown employee',
              row.employee?.department ?? 'Unknown',
              row.leaveType?.name ?? 'Leave',
              formatShortDate(row.startDate),
              formatShortDate(row.endDate),
              row.requestedHours,
            ])}
          />
        ) : null}

        {selectedView === 'lifecycle' ? (
          <ReportTable
            title="Onboarding and Offboarding"
            subtitle="Checklist visibility for lifecycle work still in progress."
            headers={['Employee', 'Department', 'Checklist', 'Lifecycle', 'Open Items', 'Overdue Items', 'Due Date']}
            rows={report.lifecycleStatus.map((row) => [
              row.employee?.fullName ?? 'Unknown employee',
              row.employee?.department ?? 'Unknown',
              row.title,
              row.lifecycleType,
              row.openItems,
              row.overdueItems,
              formatShortDate(row.dueDate),
            ])}
          />
        ) : null}

        {selectedView === 'documents' ? (
          <ReportTable
            title="Document Compliance"
            subtitle="Pending acknowledgments, expiring documents, and expired records."
            headers={['Employee', 'Department', 'Document', 'Category', 'Status', 'Expiry Date', 'Pending Acknowledgments']}
            rows={report.documentCompliance.map((row) => [
              row.employee?.fullName ?? 'Unknown employee',
              row.employee?.department ?? 'Unknown',
              row.title,
              row.category ?? 'General',
              row.status,
              formatShortDate(row.expiryDate),
              row.pendingAcknowledgments,
            ])}
          />
        ) : null}

        {performanceEnabled && selectedView === 'performance' ? (
          <ReportTable
            title="Planning for Success Cycle Progress"
            subtitle={`${report.performance.activeCycleCount} active cycles | ${report.performance.overdueSelfReviews} overdue self reviews | ${report.performance.overdueManagerReviews} overdue manager reviews | ${report.performance.pendingAcknowledgments} acknowledgments pending`}
            headers={['Employee', 'Department', 'Manager', 'Cycle', 'Status', 'Self Review Due', 'Manager Review Due']}
            rows={report.performance.reviews.map((row) => [
              row.employee?.fullName ?? 'Unknown employee',
              row.employee?.department ?? 'Unknown',
              row.manager ?? 'Unassigned',
              row.cycleName,
              row.status,
              formatShortDate(row.selfReviewDueDate),
              formatShortDate(row.managerReviewDueDate),
            ])}
            />
          ) : null}

          {selectedView === 'recruitment' ? (
            <ReportTable
              title="Recruitment Request Flow"
              subtitle={`${report.recruitment.openRequestCount} open requests | ${report.recruitment.approvedRequestCount} approved | ${report.recruitment.closedRequestCount} closed`}
              headers={['Request', 'Title', 'Type', 'Org Unit', 'Requestor', 'Status', 'Submitted']}
              rows={report.recruitment.requests.map((row) => [
                row.requestNumber,
                row.title,
                row.requestType?.name ?? 'Unconfigured type',
                row.orgUnit?.name ?? 'Not set',
                row.requestor?.fullName ?? 'Not set',
                row.status,
                formatShortDate(row.submittedAt ?? row.createdAt),
              ])}
            />
          ) : null}

          {learningEnabled && selectedView === 'learning' ? (
            <>
            <ReportTable
              title="Learning Compliance"
              subtitle={`${report.learning.overview.activeAssignments} active assignments | ${report.learning.overview.overdue} overdue learners | ${report.learning.overview.certificateRenewals} certificate renewals`}
              headers={['Employee', 'Department', 'Learning Item', 'Provider', 'Status', 'Due Date', 'Certificate Expiry']}
              rows={report.learning.records.map((row) => [
                row.employee?.fullName ?? 'Unknown employee',
                row.employee?.department ?? 'Unknown',
                row.learningItem,
                row.providerName,
                row.status,
                formatShortDate(row.dueDate),
                formatShortDate(row.certificateExpiresAt),
              ])}
            />
            <ReportTable
              title="Provider Coverage"
              subtitle={`${report.learning.overview.providerCount} active providers | ${report.learning.overview.completionRate}% compliance completion`}
              headers={['Provider', 'Status', 'Sync Mode', 'Catalog Items', 'Last Sync']}
              rows={report.learning.providers.map((row) => [
                row.displayName,
                row.status,
                row.syncMode,
                row.contentCount,
                formatShortDate(row.lastSyncCompletedAt),
              ])}
            />
          </>
        ) : null}

        {timeAttendanceEnabled && selectedView === 'time' ? (
          <>
            <ReportTable
              title="Time Card and Approval Status"
              subtitle={`${report.timeAttendance.overview.pendingApprovals} pending approvals | ${report.timeAttendance.overview.openExceptions} open exceptions | ${report.timeAttendance.overview.uncoveredShifts} uncovered shifts`}
              headers={['Employee', 'Department', 'Org Unit', 'Status', 'Period', 'Overtime', 'Exceptions']}
              rows={report.timeAttendance.timeCards.map((row) => [
                row.employee?.fullName ?? 'Unknown employee',
                row.employee?.department ?? 'Unknown',
                row.orgUnit?.name ?? 'Unassigned',
                row.status,
                `${formatShortDate(row.periodStart)} to ${formatShortDate(row.periodEnd)}`,
                row.overtimeHours,
                row.exceptionCount,
              ])}
            />
            <ReportTable
              title="Coverage Pressure"
              subtitle="Published schedules and uncovered shift counts in the current period."
              headers={['Org Unit', 'Period', 'Status', 'Shift Count', 'Uncovered']}
              rows={report.timeAttendance.coverage.map((row) => [
                row.orgUnit?.name ?? 'Unassigned',
                `${formatShortDate(row.periodStart)} to ${formatShortDate(row.periodEnd)}`,
                row.status,
                row.shiftCount,
                row.uncoveredShiftCount,
              ])}
            />
          </>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Workflow Inbox</h3>
            <p className="card-subtitle">The same operational task queue that drives approvals and follow-up work.</p>
          </div>
        </div>
        <div className="reports-workflow-list">
          {report.workflowInbox.length === 0 ? (
            <div className="reports-empty-state">No workflow tasks are currently open.</div>
          ) : report.workflowInbox.map((task) => (
            <div key={task.id} className="reports-workflow-row">
              <div>
                <div className="reports-workflow-title">{task.title}</div>
                <div className="reports-workflow-meta">{task.taskType} | {task.employee?.fullName ?? 'Unassigned'} | {task.ownerLabel ?? 'No owner'}</div>
              </div>
              <span className="badge badge-warning">{formatShortDate(task.dueDate)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="reports-metric-card">
      <span className="reports-metric-label">{label}</span>
      <strong className="reports-metric-value">{value}</strong>
    </div>
  );
}

function ReportTable({
  title,
  subtitle,
  headers,
  rows,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="reports-section">
      <div className="card-header">
        <div>
          <h3 className="card-title">{title}</h3>
          <p className="card-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="reports-table-shell">
        <table className="data-table">
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="reports-empty-cell">No data available for this report.</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={index}>{row.map((value, cellIndex) => <td key={`${index}-${cellIndex}`}>{value}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
