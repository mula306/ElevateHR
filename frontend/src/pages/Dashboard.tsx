import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import './Dashboard.css';
import {
  useReactTable, getCoreRowModel, flexRender, createColumnHelper
} from '@tanstack/react-table';
import {
  ArrowUpRight, ArrowDownRight, Users, CreditCard, UserPlus,
  Clock, MoreHorizontal, Eye
} from 'lucide-react';

/* ===== Mock Data ===== */
const payrollData = [
  { month: 'Jan', cost: 85000, budget: 90000 },
  { month: 'Feb', cost: 82000, budget: 90000 },
  { month: 'Mar', cost: 91000, budget: 90000 },
  { month: 'Apr', cost: 88000, budget: 92000 },
  { month: 'May', cost: 93000, budget: 92000 },
  { month: 'Jun', cost: 89000, budget: 95000 },
  { month: 'Jul', cost: 96000, budget: 95000 },
];

const departmentData = [
  { name: 'Engineering', value: 42, color: '#0098DB' },
  { name: 'Design', value: 18, color: '#96DEBA' },
  { name: 'Marketing', value: 15, color: '#f59e0b' },
  { name: 'Sales', value: 25, color: '#8b5cf6' },
];

type Employee = {
  id: string;
  name: string;
  initials: string;
  department: string;
  role: string;
  joinDate: string;
  salary: number;
  status: 'Active' | 'On Leave' | 'Probation';
};

const employeeData: Employee[] = [
  { id: 'EMP-1024', name: 'Hazel Nutt', initials: 'HN', department: 'Engineering', role: 'Lead UI/UX Designer', joinDate: 'Jun 21, 2024', salary: 85000, status: 'Active' },
  { id: 'EMP-1025', name: 'Simon Cyrene', initials: 'SC', department: 'Engineering', role: 'Sr Software Engineer', joinDate: 'Mar 15, 2023', salary: 120000, status: 'Active' },
  { id: 'EMP-1026', name: 'Aida Bugg', initials: 'AB', department: 'Design', role: 'Graphics Designer', joinDate: 'Jan 10, 2024', salary: 75000, status: 'On Leave' },
  { id: 'EMP-1027', name: 'Peg Legge', initials: 'PL', department: 'Marketing', role: 'Product Manager', joinDate: 'Sep 04, 2022', salary: 110000, status: 'Active' },
  { id: 'EMP-1028', name: 'Terry Aki', initials: 'TA', department: 'Sales', role: 'Account Executive', joinDate: 'Nov 22, 2024', salary: 68000, status: 'Probation' },
];

const columnHelper = createColumnHelper<Employee>();

/* ===== Custom Tooltip ===== */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: 'none',
      borderRadius: 'var(--border-radius-md)',
      boxShadow: 'var(--box-shadow-lg)',
      padding: '12px 16px',
      fontSize: 'var(--font-size-sm)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text-main)' }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, color: 'var(--color-text-secondary)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: entry.color }} />
          {entry.name}: <strong style={{ color: 'var(--color-text-main)' }}>${(entry.value / 1000).toFixed(0)}K</strong>
        </div>
      ))}
    </div>
  );
}

/* ===== Dashboard Component ===== */
export function Dashboard() {
  const columns = useMemo(() => [
    columnHelper.display({
      id: 'employee',
      header: 'Employee',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, var(--color-primary), var(--color-secondary))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
          }}>{row.original.initials}</div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: 'var(--font-size-sm)' }}>{row.original.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{row.original.id}</div>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('department', { header: 'Department' }),
    columnHelper.accessor('role', { header: 'Role' }),
    columnHelper.accessor('joinDate', { header: 'Join Date' }),
    columnHelper.accessor('salary', {
      header: 'Salary',
      cell: info => <span style={{ fontWeight: 600 }}>${info.getValue().toLocaleString()}</span>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => {
        const status = info.getValue();
        const cls = status === 'Active' ? 'badge-success' : status === 'On Leave' ? 'badge-warning' : 'badge-primary';
        return <span className={`badge ${cls}`}>{status}</span>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: () => (
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <button className="header-icon-btn" title="View"><Eye size={16} /></button>
          <button className="header-icon-btn" title="More"><MoreHorizontal size={16} /></button>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back! Here's what's happening with your workforce.</p>
        </div>
        <button className="button">
          <UserPlus size={16} /> Add Employee
        </button>
      </div>

      {/* Metric Cards */}
      <div className="metrics-grid">
        <MetricCard title="Total Employees" value="2,450" trend={+4.5} icon={<Users size={20} />} iconBg="var(--color-primary-light)" iconColor="var(--color-primary)" />
        <MetricCard title="Payroll Expense" value="$1.2M" trend={-1.2} icon={<CreditCard size={20} />} iconBg="var(--color-secondary-light)" iconColor="var(--color-success)" />
        <MetricCard title="New Hires (Q1)" value="67" trend={+12.0} icon={<UserPlus size={20} />} iconBg="var(--color-warning-bg)" iconColor="var(--color-warning)" />
        <MetricCard title="Avg Attendance" value="96.4%" trend={+0.8} icon={<Clock size={20} />} iconBg="hsl(270, 50%, 95%)" iconColor="hsl(270, 56%, 52%)" />
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        {/* Bar Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Payroll Overview</h3>
              <p className="card-subtitle">Monthly payroll cost vs budget</p>
            </div>
            <button className="button-outline button" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}>View Details</button>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payrollData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} tickFormatter={v => `$${v / 1000}K`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-background)', radius: 4 }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '16px', fontSize: '13px' }} />
                <Bar dataKey="cost" name="Actual Cost" fill="#0098DB" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="budget" name="Budget" fill="#96DEBA" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Departments</h3>
              <p className="card-subtitle">Headcount distribution</p>
            </div>
          </div>
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={departmentData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}>
                  {departmentData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
            {departmentData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: d.color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>{d.name}</span>
                </div>
                <span style={{ fontWeight: 600 }}>{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Employees</h3>
            <p className="card-subtitle">Latest additions to your team</p>
          </div>
          <button className="button-outline button" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}>View All</button>
        </div>
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
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

/* ===== Metric Card ===== */
function MetricCard({ title, value, trend, icon, iconBg, iconColor }: {
  title: string; value: string; trend?: number; icon?: React.ReactNode;
  iconBg?: string; iconColor?: string;
}) {
  const isPositive = trend && trend > 0;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-muted)' }}>{title}</span>
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--border-radius-md)',
            backgroundColor: iconBg || 'var(--color-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: iconColor || 'var(--color-primary)'
          }}>{icon}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-3)' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-main)', letterSpacing: '-0.02em' }}>{value}</span>
        {trend !== undefined && (
          <span className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`} style={{ gap: 2 }}>
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
