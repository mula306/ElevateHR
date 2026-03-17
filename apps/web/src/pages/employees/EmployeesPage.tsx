import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { AlertTriangle, LoaderCircle, PencilLine, Plus, Search, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
  type Employee,
  type EmployeeMutationPayload,
  type EmployeePayFrequency,
  type EmployeeStatus,
} from './employees.api';
import './EmployeesPage.css';

type FilterStatus = EmployeeStatus | 'All';

interface EmployeeFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  hireDate: string;
  jobTitle: string;
  department: string;
  managerId: string;
  salary: string;
  payFrequency: EmployeePayFrequency;
  status: EmployeeStatus;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
}

const columnHelper = createColumnHelper<Employee>();
const statusOptions: FilterStatus[] = ['All', 'Active', 'Probation', 'On Leave', 'Terminated'];
const payFrequencyOptions: EmployeePayFrequency[] = ['Biweekly', 'Monthly', 'Weekly'];
const emptyFormValues: EmployeeFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  hireDate: format(new Date(), 'yyyy-MM-dd'),
  jobTitle: '',
  department: '',
  managerId: '',
  salary: '',
  payFrequency: 'Biweekly',
  status: 'Active',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Canada',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
};

function getStatusClassName(status: EmployeeStatus) {
  switch (status) {
    case 'Active':
      return 'badge-success';
    case 'On Leave':
      return 'badge-warning';
    case 'Terminated':
      return 'badge-danger';
    default:
      return 'badge-primary';
  }
}

function toFormValues(employee: Employee): EmployeeFormValues {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone ?? '',
    dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
    hireDate: employee.hireDate.slice(0, 10),
    jobTitle: employee.jobTitle,
    department: employee.department,
    managerId: employee.managerId ?? '',
    salary: String(employee.salary),
    payFrequency: employee.payFrequency ?? 'Biweekly',
    status: employee.status,
    addressLine1: employee.addressLine1 ?? '',
    addressLine2: employee.addressLine2 ?? '',
    city: employee.city ?? '',
    province: employee.province ?? '',
    postalCode: employee.postalCode ?? '',
    country: employee.country ?? 'Canada',
    emergencyName: employee.emergencyName ?? '',
    emergencyPhone: employee.emergencyPhone ?? '',
    emergencyRelation: employee.emergencyRelation ?? '',
  };
}

function toPayload(values: EmployeeFormValues): EmployeeMutationPayload {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim() || null,
    dateOfBirth: values.dateOfBirth || null,
    hireDate: values.hireDate,
    jobTitle: values.jobTitle.trim(),
    department: values.department.trim(),
    managerId: values.managerId.trim() || null,
    salary: Number(values.salary),
    payFrequency: values.payFrequency,
    status: values.status,
    addressLine1: values.addressLine1.trim() || null,
    addressLine2: values.addressLine2.trim() || null,
    city: values.city.trim() || null,
    province: values.province.trim() || null,
    postalCode: values.postalCode.trim() || null,
    country: values.country.trim() || 'Canada',
    emergencyName: values.emergencyName.trim() || null,
    emergencyPhone: values.emergencyPhone.trim() || null,
    emergencyRelation: values.emergencyRelation.trim() || null,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return format(new Date(value), 'MMM d, yyyy');
}

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Employee | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EmployeeFormValues>({ defaultValues: emptyFormValues });

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listEmployees({
        page: 1,
        limit: 100,
        search: search || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
        sortBy: 'lastName',
        sortOrder: 'asc',
      });
      setEmployees(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadEmployees(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadEmployees]);

  const openCreatePanel = () => {
    setSelectedEmployeeId(null);
    reset(emptyFormValues);
    setPanelOpen(true);
  };

  const openEditPanel = useCallback(async (employeeId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await getEmployee(employeeId);
      setSelectedEmployeeId(employeeId);
      reset(toFormValues(response.data));
      setPanelOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employee details.');
    } finally {
      setSubmitting(false);
    }
  }, [reset]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'employee',
      header: 'Employee',
      cell: ({ row }) => (
        <div className="employees-person-cell">
          <div className="employees-person-avatar">{`${row.original.firstName[0] ?? ''}${row.original.lastName[0] ?? ''}`.toUpperCase()}</div>
          <div>
            <div className="employees-person-name">{row.original.firstName} {row.original.lastName}</div>
            <div className="employees-person-meta">{row.original.employeeNumber}</div>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('jobTitle', { header: 'Role' }),
    columnHelper.accessor('department', { header: 'Department' }),
    columnHelper.accessor('hireDate', { header: 'Hire Date', cell: ({ getValue }) => formatDate(getValue()) }),
    columnHelper.accessor('salary', { header: 'Salary', cell: ({ getValue }) => <span className="employees-salary-cell">{formatCurrency(getValue())}</span> }),
    columnHelper.accessor('status', { header: 'Status', cell: ({ getValue }) => <span className={`badge ${getStatusClassName(getValue())}`}>{getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="employees-row-actions">
          <button type="button" className="employees-icon-button" onClick={() => { void openEditPanel(row.original.id); }} title={`Edit ${row.original.firstName} ${row.original.lastName}`}>
            <PencilLine size={16} />
          </button>
          <button type="button" className="employees-icon-button employees-icon-button-danger" onClick={() => setDeleteCandidate(row.original)} title={`Delete ${row.original.firstName} ${row.original.lastName}`}>
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }),
  ], [openEditPanel]);

  const table = useReactTable({ data: employees, columns, getCoreRowModel: getCoreRowModel() });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = toPayload(values);
      if (Number.isNaN(payload.salary) || payload.salary <= 0) {
        throw new Error('Salary must be a positive number.');
      }
      if (selectedEmployeeId) {
        await updateEmployee(selectedEmployeeId, payload);
      } else {
        await createEmployee(payload);
      }
      setPanelOpen(false);
      setSelectedEmployeeId(null);
      reset(emptyFormValues);
      await loadEmployees();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save employee.');
    } finally {
      setSubmitting(false);
    }
  });

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteEmployee(deleteCandidate.id);
      setDeleteCandidate(null);
      await loadEmployees();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete employee.');
    } finally {
      setSubmitting(false);
    }
  };

  const employeeCount = employees.length;
  const activeCount = employees.filter((employee) => employee.status === 'Active').length;
  const monthlyPayroll = employees.reduce((sum, employee) => sum + (employee.payFrequency === 'Monthly' ? employee.salary : employee.salary / 12), 0);

  return (
    <section className="employees-page">
      <div className="employees-hero card">
        <div className="page-header employees-page-header">
          <div>
            <span className="employees-eyebrow">Employee Operations</span>
            <h1 className="page-title">Employee Directory</h1>
            <p className="page-subtitle">Manage employee records from one place with fast search, controlled edits, and safer delete actions.</p>
          </div>
          <button type="button" className="button employees-primary-action" onClick={openCreatePanel}>
            <Plus size={16} /> New employee
          </button>
        </div>
        <div className="employees-metrics">
          <MetricTile label="People records" value={String(employeeCount)} />
          <MetricTile label="Active employees" value={String(activeCount)} />
          <MetricTile label="Monthly payroll view" value={formatCurrency(monthlyPayroll)} />
        </div>
      </div>

      <div className="card employees-toolbar-card">
        <div className="employees-toolbar">
          <label className="employees-search">
            <Search size={16} className="employees-search-icon" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or employee number" />
          </label>
          <select className="employees-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}>
            {statusOptions.map((status) => <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>)}
          </select>
        </div>

        {error ? <div className="employees-banner employees-banner-error"><AlertTriangle size={16} /><span>{error}</span></div> : null}

        {loading ? <div className="employees-empty-state"><LoaderCircle className="employees-spin" size={20} /><span>Loading employees...</span></div> : null}
        {!loading && employees.length === 0 ? <div className="employees-empty-state"><UsersRound size={20} /><span>No employees matched the current filters.</span></div> : null}

        {!loading && employees.length > 0 ? (
          <>
            <div className="employees-table-shell">
              <table className="data-table employees-table">
                <thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
                <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="employees-mobile-list">
              {employees.map((employee) => (
                <article key={employee.id} className="employees-mobile-card">
                  <div className="employees-mobile-card-header">
                    <div className="employees-person-cell">
                      <div className="employees-person-avatar">{`${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`.toUpperCase()}</div>
                      <div>
                        <div className="employees-person-name">{employee.firstName} {employee.lastName}</div>
                        <div className="employees-person-meta">{employee.employeeNumber}</div>
                      </div>
                    </div>
                    <span className={`badge ${getStatusClassName(employee.status)}`}>{employee.status}</span>
                  </div>
                  <div className="employees-mobile-grid">
                    <MobileData label="Role" value={employee.jobTitle} />
                    <MobileData label="Department" value={employee.department} />
                    <MobileData label="Hire date" value={formatDate(employee.hireDate)} />
                    <MobileData label="Salary" value={formatCurrency(employee.salary)} />
                  </div>
                  <div className="employees-mobile-actions">
                    <button type="button" className="button button-outline" onClick={() => { void openEditPanel(employee.id); }}><PencilLine size={16} /> Edit</button>
                    <button type="button" className="button button-outline employees-danger-outline" onClick={() => setDeleteCandidate(employee)}><Trash2 size={16} /> Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className={`employees-panel-overlay ${panelOpen ? 'employees-panel-overlay-visible' : ''}`} onClick={() => setPanelOpen(false)} />
      <aside className={`employees-panel ${panelOpen ? 'employees-panel-open' : ''}`}>
        <div className="employees-panel-header">
          <div>
            <h2>{selectedEmployeeId ? 'Edit employee' : 'Add employee'}</h2>
            <p>Capture core employment details, compensation, and emergency contact information.</p>
          </div>
          <button type="button" className="employees-icon-button" onClick={() => setPanelOpen(false)}><X size={18} /></button>
        </div>
        <form className="employees-form" onSubmit={onSubmit}>
          <FormSection title="Core profile">
            <Field label="First name" error={errors.firstName?.message}><input {...register('firstName', { required: 'First name is required' })} /></Field>
            <Field label="Last name" error={errors.lastName?.message}><input {...register('lastName', { required: 'Last name is required' })} /></Field>
            <Field label="Email" error={errors.email?.message}><input type="email" {...register('email', { required: 'Email is required' })} /></Field>
            <Field label="Phone"><input {...register('phone')} /></Field>
            <Field label="Hire date" error={errors.hireDate?.message}><input type="date" {...register('hireDate', { required: 'Hire date is required' })} /></Field>
            <Field label="Date of birth"><input type="date" {...register('dateOfBirth')} /></Field>
          </FormSection>

          <FormSection title="Employment">
            <Field label="Job title" error={errors.jobTitle?.message}><input {...register('jobTitle', { required: 'Job title is required' })} /></Field>
            <Field label="Department" error={errors.department?.message}><input {...register('department', { required: 'Department is required' })} /></Field>
            <Field label="Salary" error={errors.salary?.message}><input type="number" min="0" step="1000" {...register('salary', { required: 'Salary is required' })} /></Field>
            <Field label="Pay frequency"><select {...register('payFrequency')}>{payFrequencyOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
            <Field label="Status"><select {...register('status')}>{statusOptions.filter((option): option is EmployeeStatus => option !== 'All').map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
            <Field label="Manager ID"><input {...register('managerId')} placeholder="Optional UUID" /></Field>
          </FormSection>

          <FormSection title="Address">
            <Field label="Address line 1"><input {...register('addressLine1')} /></Field>
            <Field label="Address line 2"><input {...register('addressLine2')} /></Field>
            <Field label="City"><input {...register('city')} /></Field>
            <Field label="Province"><input {...register('province')} /></Field>
            <Field label="Postal code"><input {...register('postalCode')} /></Field>
            <Field label="Country"><input {...register('country')} /></Field>
          </FormSection>

          <FormSection title="Emergency contact">
            <Field label="Contact name"><input {...register('emergencyName')} /></Field>
            <Field label="Contact phone"><input {...register('emergencyPhone')} /></Field>
            <Field label="Relationship"><input {...register('emergencyRelation')} /></Field>
          </FormSection>

          <div className="employees-form-actions">
            <button type="button" className="button button-outline" onClick={() => { setPanelOpen(false); setSelectedEmployeeId(null); reset(emptyFormValues); }}>Cancel</button>
            <button type="submit" className="button" disabled={submitting}>{submitting ? <LoaderCircle className="employees-spin" size={16} /> : <UserRound size={16} />}{selectedEmployeeId ? 'Save changes' : 'Create employee'}</button>
          </div>
        </form>
      </aside>

      {deleteCandidate ? (
        <div className="employees-dialog-backdrop">
          <div className="employees-dialog card">
            <div className="employees-dialog-icon"><AlertTriangle size={20} /></div>
            <h2>Confirm delete</h2>
            <p>This will mark {deleteCandidate.firstName} {deleteCandidate.lastName} as terminated. Confirm before continuing.</p>
            <div className="employees-dialog-actions">
              <button type="button" className="button button-outline" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button type="button" className="button employees-danger-button" onClick={() => { void confirmDelete(); }} disabled={submitting}>{submitting ? <LoaderCircle className="employees-spin" size={16} /> : <Trash2 size={16} />}Confirm delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="employees-metric-tile"><span className="employees-metric-label">{label}</span><strong className="employees-metric-value">{value}</strong></div>;
}

function MobileData({ label, value }: { label: string; value: string }) {
  return <div><span className="employees-mobile-label">{label}</span><strong>{value}</strong></div>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="employees-form-section"><h3>{title}</h3><div className="employees-form-grid">{children}</div></div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="employees-field"><span>{label}</span>{children}{error ? <small>{error}</small> : null}</label>;
}
