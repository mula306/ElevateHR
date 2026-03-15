import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  CreditCard,
  Eye,
  MoreHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';
import { departmentData, employeeData, payrollData } from './dashboard.data';
import type { DashboardEmployee } from './dashboard.types';
import './DashboardPage.css';

const columnHelper = createColumnHelper<DashboardEmployee>();

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="dashboard-tooltip">
      <div className="dashboard-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="dashboard-tooltip-row">
          <span className="dashboard-tooltip-dot" style={{ background: entry.color }} />
          {entry.name}: <strong className="dashboard-tooltip-value">${(entry.value / 1000).toFixed(0)}K</strong>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const columns = useMemo(() => [
    columnHelper.display({
      id: 'employee',
      header: 'Employee',
      cell: ({ row }) => (
        <div className="employee-cell">
          <div className="employee-initials">{row.original.initials}</div>
          <div>
            <div className="employee-name">{row.original.name}</div>
            <div className="employee-id">{row.original.id}</div>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('department', { header: 'Department' }),
    columnHelper.accessor('role', { header: 'Role' }),
    columnHelper.accessor('joinDate', { header: 'Join Date' }),
    columnHelper.accessor('salary', {
      header: 'Salary',
      cell: (info) => <span className="salary-cell">${info.getValue().toLocaleString()}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        const className = status === 'Active'
          ? 'badge-success'
          : status === 'On Leave'
            ? 'badge-warning'
            : 'badge-primary';

        return <span className={`badge ${className}`}>{status}</span>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: () => (
        <div className="row-actions">
          <button className="header-icon-btn" title="View">
            <Eye size={16} />
          </button>
          <button className="header-icon-btn" title="More">
            <MoreHorizontal size={16} />
          </button>
        </div>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: employeeData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="dashboard-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back! Here&apos;s what&apos;s happening with your workforce.</p>
        </div>
        <button className="button">
          <UserPlus size={16} /> Add Employee
        </button>
      </div>

      <div className="metrics-grid">
        <MetricCard
          title="Total Employees"
          value="2,450"
          trend={4.5}
          icon={<Users size={20} />}
          iconBackground="var(--color-primary-light)"
          iconColor="var(--color-primary)"
        />
        <MetricCard
          title="Payroll Expense"
          value="$1.2M"
          trend={-1.2}
          icon={<CreditCard size={20} />}
          iconBackground="var(--color-secondary-light)"
          iconColor="var(--color-success)"
        />
        <MetricCard
          title="New Hires (Q1)"
          value="67"
          trend={12}
          icon={<UserPlus size={20} />}
          iconBackground="var(--color-warning-bg)"
          iconColor="var(--color-warning)"
        />
        <MetricCard
          title="Avg Attendance"
          value="96.4%"
          trend={0.8}
          icon={<Clock size={20} />}
          iconBackground="hsl(270 50% 95%)"
          iconColor="hsl(270 56% 52%)"
        />
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Payroll Overview</h3>
              <p className="card-subtitle">Monthly payroll cost vs budget</p>
            </div>
            <button className="button button-outline dashboard-inline-button">View Details</button>
          </div>
          <div className="chart-surface">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payrollData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} tickFormatter={(value) => `$${value / 1000}K`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-background)', radius: 4 }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '16px', fontSize: '13px' }} />
                <Bar dataKey="cost" name="Actual Cost" fill="#0098DB" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="budget" name="Budget" fill="#96DEBA" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Departments</h3>
              <p className="card-subtitle">Headcount distribution</p>
            </div>
          </div>
          <div className="donut-surface">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={departmentData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}>
                  {departmentData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="department-legend">
            {departmentData.map((department) => (
              <div key={department.name} className="department-legend-row">
                <div className="department-legend-label">
                  <span className="department-legend-dot" style={{ backgroundColor: department.color }} />
                  <span>{department.name}</span>
                </div>
                <span className="department-legend-value">{department.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Employees</h3>
            <p className="card-subtitle">Latest additions to your team</p>
          </div>
          <button className="button button-outline dashboard-inline-button">View All</button>
        </div>
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
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
  trend?: number;
  icon?: ReactNode;
  iconBackground?: string;
  iconColor?: string;
}

function MetricCard({
  title,
  value,
  trend,
  icon,
  iconBackground,
  iconColor,
}: MetricCardProps) {
  const isPositive = trend !== undefined && trend > 0;

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
        {trend !== undefined ? (
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'} metric-card-trend`}>
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
