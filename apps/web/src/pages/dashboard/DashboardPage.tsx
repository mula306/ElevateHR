import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileWarning,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import { isFeatureEnabled } from '@/shared/features/feature-registry';
import { getDashboardSummary, type DashboardSummary } from './dashboard.api';
import './DashboardPage.css';

const departmentColors = ['#0098DB', '#58A618', '#F59E0B', '#0F766E', '#C2410C', '#1D4ED8'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function getStatusBadgeClass(status: string) {
  if (status === 'Active') {
    return 'badge-success';
  }

  if (status === 'On Leave') {
    return 'badge-warning';
  }

  if (status === 'Probation') {
    return 'badge-primary';
  }

  return 'badge-danger';
}

export function DashboardPage() {
  const { session } = useAppSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSummary = await getDashboardSummary();
      setSummary(nextSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const departmentChartData = useMemo(() => {
    return (summary?.departmentDistribution ?? []).map((department, index) => ({
      ...department,
      color: departmentColors[index % departmentColors.length],
    }));
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="dashboard-stack">
        <div className="card dashboard-state">
          <LoaderCircle className="dashboard-spin" size={18} />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="dashboard-stack">
        <div className="card dashboard-state dashboard-state-error">
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button type="button" className="button" onClick={() => { void loadDashboard(); }}>
            <RefreshCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const metrics = summary?.metrics;
  const timeOffRequestsEnabled = isFeatureEnabled(session?.features, 'time_off_requests');

  if (!summary || !metrics) {
    return (
      <div className="dashboard-stack">
        <div className="card dashboard-state">
          <span>No dashboard data is available.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live workforce metrics with approvals, leave, lifecycle tasks, and document risk in one operational view.</p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/time-attendance?tab=leave" className="button button-outline dashboard-link-button">
            <CalendarClock size={16} />
            Leave
          </Link>
          <Link to="/employees" className="button">
            <UserPlus size={16} />
            Employees
          </Link>
        </div>
      </div>

      <div className="card dashboard-start-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Start Here</h3>
            <p className="card-subtitle">Jump straight into the operating areas HR administrators use most often.</p>
          </div>
        </div>
        <div className="dashboard-start-grid">
          <Link to="/inbox" className="dashboard-start-link">
            <ClipboardCheck size={18} />
            <div>
              <strong>Review Inbox</strong>
              <span>Clear approvals and operational follow-up.</span>
            </div>
          </Link>
          <Link to="/recruitment" className="dashboard-start-link">
            <UserPlus size={18} />
            <div>
              <strong>Open Recruitment</strong>
              <span>Track requests, approvals, and hiring close-out.</span>
            </div>
          </Link>
          <Link to="/settings" className="dashboard-start-link">
            <FileWarning size={18} />
            <div>
              <strong>Manage Settings</strong>
              <span>Update features, taxonomy, and approval routing.</span>
            </div>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="dashboard-banner dashboard-banner-error">
          <ShieldAlert size={16} />
          <span>{error}</span>
          <button type="button" className="button button-outline dashboard-inline-button" onClick={() => { void loadDashboard(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      ) : null}

      <div className="metrics-grid dashboard-metrics-grid-wide">
        <MetricCard
          title="Current Workforce"
          value={metrics.currentEmployees.toLocaleString()}
          trend={metrics.currentWorkforceTrend}
          detail={`${metrics.filledSeats} filled seats | ${metrics.openSeats} open seats`}
          icon={<Users size={20} />}
          iconBackground="var(--color-primary-light)"
          iconColor="var(--color-primary)"
        />
        <MetricCard
          title="Annual Payroll"
          value={formatCurrency(metrics.annualPayroll)}
          detail={`Average salary ${formatCurrency(metrics.averageAnnualSalary)}`}
          icon={<CreditCard size={20} />}
          iconBackground="var(--color-secondary-light)"
          iconColor="var(--color-success)"
        />
        <MetricCard
          title="New Hires (QTD)"
          value={metrics.newHiresThisQuarter.toLocaleString()}
          trend={metrics.newHireTrend}
          detail={`Previous quarter ${metrics.previousQuarterNewHires}`}
          icon={<UserPlus size={20} />}
          iconBackground="var(--color-warning-bg)"
          iconColor="var(--color-warning)"
        />
        <MetricCard
          title="Active Workforce Rate"
          value={formatPercent(metrics.activeStatusRate)}
          detail={`${metrics.activeEmployees} active | ${metrics.onLeaveEmployees} on leave`}
          icon={<CheckCircle2 size={20} />}
          iconBackground="rgb(224 242 254)"
          iconColor="rgb(3 105 161)"
        />
        {timeOffRequestsEnabled ? (
          <MetricCard
            title="Pending Approvals"
            value={metrics.pendingApprovals.toLocaleString()}
            detail={`${metrics.overdueTasks} overdue workflow tasks`}
            icon={<ClipboardCheck size={20} />}
            iconBackground="rgb(254 249 195)"
            iconColor="rgb(161 98 7)"
          />
        ) : null}
        {timeOffRequestsEnabled ? (
          <MetricCard
            title="Upcoming Absences"
            value={metrics.upcomingAbsences.toLocaleString()}
            detail={`${metrics.expiringDocuments} document alerts`}
            icon={<FileWarning size={20} />}
            iconBackground="rgb(239 246 255)"
            iconColor="rgb(29 78 216)"
          />
        ) : null}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Hiring Trend</h3>
              <p className="card-subtitle">Confirmed hires over the last six months</p>
            </div>
          </div>
          <div className="chart-surface">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.hiringTrend} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} dy={10} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'var(--color-background)', radius: 4 }} />
                <Bar dataKey="hires" name="Hires" fill="#0098DB" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Departments</h3>
              <p className="card-subtitle">Current workforce distribution by department</p>
            </div>
          </div>
          <div className="donut-surface">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={departmentChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="employeeCount"
                  strokeWidth={0}
                >
                  {departmentChartData.map((entry) => (
                    <Cell key={entry.department} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="department-legend">
            {departmentChartData.map((department) => (
              <div key={department.department} className="department-legend-row">
                <div className="department-legend-label">
                  <span className="department-legend-dot" style={{ backgroundColor: department.color }} />
                  <span>{department.department}</span>
                </div>
                <span className="department-legend-value">{department.employeeCount} | {formatPercent(department.workforceShare)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-ops-grid">
        <div className="card dashboard-personal-work-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">My Work</h3>
              <p className="card-subtitle">Personal queue for approvals and assigned operational work.</p>
            </div>
            <Link to="/inbox" className="button button-outline dashboard-inline-button">
              <ClipboardCheck size={16} />
              Open Inbox
            </Link>
          </div>
          <div className="dashboard-personal-work-grid">
            <div className="dashboard-personal-work-metric">
              <span className="dashboard-personal-work-label">Open work</span>
              <strong>{summary.myWork.openCount.toLocaleString()}</strong>
            </div>
            <div className="dashboard-personal-work-metric">
              <span className="dashboard-personal-work-label">Overdue</span>
              <strong>{summary.myWork.overdueCount.toLocaleString()}</strong>
            </div>
            <div className="dashboard-personal-work-metric">
              <span className="dashboard-personal-work-label">Approvals</span>
              <strong>{summary.myWork.approvalCount.toLocaleString()}</strong>
            </div>
            <div className="dashboard-personal-work-metric">
              <span className="dashboard-personal-work-label">Due today</span>
              <strong>{summary.myWork.dueTodayCount.toLocaleString()}</strong>
            </div>
          </div>
        </div>
        {timeOffRequestsEnabled ? (
          <SurfaceListCard
            title="Upcoming Time Off"
            subtitle="Approved absences in the next 30 days"
            rows={summary.upcomingTimeOff}
            emptyMessage="No approved absences in the next 30 days."
            renderRow={(row) => (
              <>
                <div>
                  <div className="dashboard-list-title">{row.employee?.fullName ?? 'Unknown employee'}</div>
                  <div className="dashboard-list-meta">{row.leaveType?.name ?? 'Leave'} | {row.requestedHours} hours</div>
                </div>
                <span className="dashboard-list-date">{formatShortDate(row.startDate)}</span>
              </>
            )}
          />
        ) : null}
      </div>

      <div className="dashboard-secondary-grid">
        <SurfaceListCard
          title="Lifecycle Queue"
          subtitle="Open onboarding and offboarding work"
          rows={summary.lifecycleQueue}
          emptyMessage="No lifecycle items are currently open."
          renderRow={(row) => (
            <>
              <div>
                <div className="dashboard-list-title">{row.employee?.fullName ?? 'Unknown employee'}</div>
                <div className="dashboard-list-meta">{row.lifecycleType} | {row.openItems} open items</div>
              </div>
              <span className="badge badge-primary">{formatShortDate(row.dueDate)}</span>
            </>
          )}
        />
        <SurfaceListCard
          title="Document Alerts"
          subtitle="Pending acknowledgments and expiring records"
          rows={summary.documentAlerts}
          emptyMessage="No document alerts are active."
          renderRow={(row) => (
            <>
              <div>
                <div className="dashboard-list-title">{row.title}</div>
                <div className="dashboard-list-meta">{row.employee?.fullName ?? 'Unknown employee'}</div>
              </div>
              <span className={`badge ${row.status === 'Pending Acknowledgment' ? 'badge-warning' : 'badge-danger'}`}>{row.status}</span>
            </>
          )}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Employees</h3>
            <p className="card-subtitle">Latest hires currently stored in the database</p>
          </div>
          <button type="button" className="button button-outline dashboard-inline-button" onClick={() => { void loadDashboard(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Role</th>
              <th>Join Date</th>
              <th>Salary</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} className="dashboard-table-empty">No employees found.</td>
              </tr>
            ) : summary.recentEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <div className="employee-cell">
                    <div className="employee-initials">{employee.initials}</div>
                    <div>
                      <div className="employee-name">{employee.fullName}</div>
                      <div className="employee-id">{employee.employeeNumber}</div>
                    </div>
                  </div>
                </td>
                <td>{employee.department}</td>
                <td>{employee.jobTitle}</td>
                <td>{formatShortDate(employee.hireDate)}</td>
                <td><span className="salary-cell">{formatCurrency(employee.salary)}</span></td>
                <td><span className={`badge ${getStatusBadgeClass(employee.status)}`}>{employee.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  detail?: string;
  trend?: number | null;
  icon?: ReactNode;
  iconBackground?: string;
  iconColor?: string;
}

function MetricCard({
  title,
  value,
  detail,
  trend,
  icon,
  iconBackground,
  iconColor,
}: MetricCardProps) {
  const isPositive = trend !== null && trend !== undefined && trend > 0;
  const isNegative = trend !== null && trend !== undefined && trend < 0;
  const trendClassName = isPositive ? 'badge-success' : isNegative ? 'badge-danger' : 'badge-primary';

  return (
    <div className="card metric-card">
      <div className="metric-card-header">
        <span className="metric-card-title">{title}</span>
        {icon ? (
          <div
            className="metric-card-icon"
            style={{
              backgroundColor: iconBackground || 'var(--color-primary-light)',
              color: iconColor || 'var(--color-primary)',
            }}
          >
            {icon}
          </div>
        ) : null}
      </div>
      <div className="metric-card-value-row">
        <span className="metric-card-value">{value}</span>
        {trend !== null && trend !== undefined ? (
          <span className={`badge ${trendClassName} metric-card-trend`}>
            {isNegative ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      {detail ? <p className="metric-card-detail">{detail}</p> : null}
    </div>
  );
}

function SurfaceListCard<T>({
  title,
  subtitle,
  rows,
  emptyMessage,
  renderRow,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  emptyMessage: string;
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">{title}</h3>
          <p className="card-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="dashboard-list">
        {rows.length === 0 ? <div className="dashboard-list-empty">{emptyMessage}</div> : rows.map((row, index) => (
          <div key={index} className="dashboard-list-row">{renderRow(row)}</div>
        ))}
      </div>
    </div>
  );
}
