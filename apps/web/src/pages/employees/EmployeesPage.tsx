import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import {
  AlertTriangle,
  FileText,
  FolderSync,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Banner, ConfirmDialog, Drawer, IconButton, PageHero } from '@/shared/ui/primitives';
import {
  listTeamSkills,
  markTeamSkillNotValidated,
  validateTeamSkill,
  type TeamEmployeeSkillRecord,
} from '@/pages/skills/skills.api';
import {
  acknowledgeEmployeeDocument,
  createEmployeeChecklist,
  createEmployeeDocument,
  listChecklistTemplates,
  listDocumentReferenceData,
  listEmployeeChecklists,
  listEmployeeDocuments,
  updateChecklistItem,
  type ChecklistTemplateRecord,
  type DocumentCategoryRecord,
  type DocumentTemplateRecord,
  type EmployeeChecklistRecord,
  type EmployeeDocumentRecord,
} from './employee-ops.api';
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
type AttentionFilter = 'All' | 'Needs attention';
type PanelTab = 'profile' | 'lifecycle' | 'documents' | 'skills';

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

interface DocumentDraft {
  title: string;
  categoryId: string;
  templateId: string;
  issueDate: string;
  expiryDate: string;
  required: boolean;
  notes: string;
}

const columnHelper = createColumnHelper<Employee>();
const statusOptions: FilterStatus[] = ['All', 'Active', 'Probation', 'On Leave', 'Terminated'];
const attentionOptions: AttentionFilter[] = ['All', 'Needs attention'];
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

const emptyDocumentDraft: DocumentDraft = {
  title: '',
  categoryId: '',
  templateId: '',
  issueDate: format(new Date(), 'yyyy-MM-dd'),
  expiryDate: '',
  required: false,
  notes: '',
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
    hireDate: employee.hireDate?.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd'),
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

function formatDate(value: string | null | undefined) {
  return value ? format(new Date(value), 'MMM d, yyyy') : 'TBD';
}

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('All');
  const [loading, setLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('profile');
  const [deleteCandidate, setDeleteCandidate] = useState<Employee | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [checklists, setChecklists] = useState<EmployeeChecklistRecord[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocumentRecord[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplateRecord[]>([]);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategoryRecord[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [employeeSkills, setEmployeeSkills] = useState<TeamEmployeeSkillRecord[]>([]);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(emptyDocumentDraft);
  const [skillNotes, setSkillNotes] = useState<Record<string, string>>({});
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
        attentionOnly: attentionFilter === 'Needs attention' ? true : undefined,
        sortBy: 'lastName',
        sortOrder: 'asc',
      });
      setEmployees(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [attentionFilter, search, statusFilter]);

  const loadEmployeeOps = useCallback(async (employeeId: string) => {
    setOpsLoading(true);
    try {
      const [employeeChecklists, employeeDocuments, templates, documentReferenceData, teamSkillGroups] = await Promise.all([
        listEmployeeChecklists(employeeId),
        listEmployeeDocuments(employeeId),
        checklistTemplates.length > 0 ? Promise.resolve(checklistTemplates) : listChecklistTemplates(),
        documentCategories.length > 0 && documentTemplates.length > 0
          ? Promise.resolve({ categories: documentCategories, templates: documentTemplates })
          : listDocumentReferenceData(),
        listTeamSkills(employeeId),
      ]);

      setChecklists(employeeChecklists);
      setDocuments(employeeDocuments);
      setChecklistTemplates(templates);
      setDocumentCategories(documentReferenceData.categories);
      setDocumentTemplates(documentReferenceData.templates);
      setEmployeeSkills(teamSkillGroups[0]?.skills ?? []);
      setSkillNotes(
        Object.fromEntries(
          (teamSkillGroups[0]?.skills ?? []).map((skill) => [skill.id, skill.managerNote ?? '']),
        ),
      );
    } finally {
      setOpsLoading(false);
    }
  }, [checklistTemplates, documentCategories, documentTemplates]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadEmployees(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadEmployees]);

  const openCreatePanel = () => {
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    setPanelTab('profile');
    setChecklists([]);
    setDocuments([]);
    setEmployeeSkills([]);
    setSkillNotes({});
    setDocumentDraft(emptyDocumentDraft);
    reset(emptyFormValues);
    setPanelOpen(true);
  };

  const openEditPanel = useCallback(async (employeeId: string) => {
    setSubmitting(true);
    setOpsLoading(true);
    setError(null);
    try {
      const response = await getEmployee(employeeId);
      setSelectedEmployeeId(employeeId);
      setSelectedEmployee(response.data);
      setPanelTab('profile');
      reset(toFormValues(response.data));
      setPanelOpen(true);
      await loadEmployeeOps(employeeId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load employee details.');
    } finally {
      setSubmitting(false);
      setOpsLoading(false);
    }
  }, [loadEmployeeOps, reset]);

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
    columnHelper.display({
      id: 'ops',
      header: 'HR Ops',
      cell: ({ row }) => (
        <div className="employees-ops-summary">
          <span>{row.original.opsSummary?.openChecklistItems ?? 0} tasks</span>
          <span>{row.original.opsSummary?.pendingAcknowledgments ?? 0} docs</span>
        </div>
      ),
    }),
    columnHelper.accessor('salary', { header: 'Salary', cell: ({ getValue }) => <span className="employees-salary-cell">{formatCurrency(getValue())}</span> }),
    columnHelper.accessor('status', { header: 'Status', cell: ({ getValue }) => <span className={`badge ${getStatusClassName(getValue())}`}>{getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="employees-row-actions">
          <IconButton label={`Edit ${row.original.firstName} ${row.original.lastName}`} onClick={() => { void openEditPanel(row.original.id); }}>
            <PencilLine size={16} />
          </IconButton>
          <IconButton label={`Delete ${row.original.firstName} ${row.original.lastName}`} tone="danger" onClick={() => setDeleteCandidate(row.original)}>
            <Trash2 size={16} />
          </IconButton>
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
      setSelectedEmployee(null);
      reset(emptyFormValues);
      await loadEmployees();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save employee.');
    } finally {
      setSubmitting(false);
    }
  });

  const confirmDelete = async () => {
    if (!deleteCandidate) {
      return;
    }

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

  const handleCreateLifecycleChecklist = async (lifecycleType: 'Onboarding' | 'Offboarding') => {
    if (!selectedEmployeeId) {
      return;
    }

    setOpsLoading(true);
    try {
      await createEmployeeChecklist({ employeeId: selectedEmployeeId, lifecycleType });
      await loadEmployeeOps(selectedEmployeeId);
      await loadEmployees();
    } catch (opsError) {
      setError(opsError instanceof Error ? opsError.message : 'Unable to create checklist.');
    } finally {
      setOpsLoading(false);
    }
  };

  const handleChecklistToggle = async (itemId: string, currentStatus: 'Open' | 'Completed') => {
    if (!selectedEmployeeId) {
      return;
    }

    setOpsLoading(true);
    try {
      const nextStatus = currentStatus === 'Completed' ? 'Open' : 'Completed';
      await updateChecklistItem(itemId, nextStatus);
      await loadEmployeeOps(selectedEmployeeId);
      await loadEmployees();
    } catch (opsError) {
      setError(opsError instanceof Error ? opsError.message : 'Unable to update checklist item.');
    } finally {
      setOpsLoading(false);
    }
  };

  const handleDocumentTemplateChange = (templateId: string) => {
    const template = documentTemplates.find((candidate) => candidate.id === templateId);
    setDocumentDraft((current) => ({
      ...current,
      templateId,
      categoryId: template?.category?.id ?? current.categoryId,
      required: template?.requiresAcknowledgement ?? current.required,
      title: current.title || template?.name || '',
      expiryDate: template?.defaultExpiryDays
        ? format(new Date(Date.now() + template.defaultExpiryDays * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
        : current.expiryDate,
    }));
  };

  const handleCreateDocument = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    setOpsLoading(true);
    setError(null);
    try {
      await createEmployeeDocument({
        employeeId: selectedEmployeeId,
        categoryId: documentDraft.categoryId,
        templateId: documentDraft.templateId || null,
        title: documentDraft.title,
        required: documentDraft.required,
        issueDate: documentDraft.issueDate || null,
        expiryDate: documentDraft.expiryDate || null,
        notes: documentDraft.notes || null,
      });
      setDocumentDraft(emptyDocumentDraft);
      await loadEmployeeOps(selectedEmployeeId);
      await loadEmployees();
    } catch (documentError) {
      setError(documentError instanceof Error ? documentError.message : 'Unable to create employee document.');
    } finally {
      setOpsLoading(false);
    }
  };

  const handleAcknowledgeDocument = async (documentId: string) => {
    if (!selectedEmployeeId) {
      return;
    }

    setOpsLoading(true);
    try {
      await acknowledgeEmployeeDocument(documentId);
      await loadEmployeeOps(selectedEmployeeId);
      await loadEmployees();
    } catch (documentError) {
      setError(documentError instanceof Error ? documentError.message : 'Unable to acknowledge employee document.');
    } finally {
      setOpsLoading(false);
    }
  };

  const handleSkillValidation = async (skillId: string, validationStatus: 'Validated' | 'NotValidated') => {
    if (!selectedEmployeeId) {
      return;
    }

    setOpsLoading(true);
    setError(null);
    try {
      const note = skillNotes[skillId] ?? null;
      const updatedSkill = validationStatus === 'Validated'
        ? await validateTeamSkill(skillId, note)
        : await markTeamSkillNotValidated(skillId, note);
      setEmployeeSkills((current) => current.map((skill) => skill.id === updatedSkill.id ? updatedSkill : skill));
    } catch (skillError) {
      setError(skillError instanceof Error ? skillError.message : 'Unable to update skill validation.');
    } finally {
      setOpsLoading(false);
    }
  };

  const employeeCount = employees.length;
  const activeCount = employees.filter((employee) => employee.status === 'Active').length;
  const employeesNeedingAttention = employees.filter((employee) => employee.opsSummary?.needsAttention).length;
  const monthlyPayroll = employees.reduce((sum, employee) => sum + (employee.payFrequency === 'Monthly' ? employee.salary : employee.salary / 12), 0);

  return (
    <section className="employees-page">
      <PageHero
        eyebrow="Employee Operations"
        title="Employee Directory"
        subtitle="Manage profile records, lifecycle work, and employee documents from one professional HR Ops workspace."
        actions={<button type="button" className="button employees-primary-action" onClick={openCreatePanel}><Plus size={16} />New employee</button>}
        className="employees-hero"
      >
        <div className="employees-metrics employees-metrics-wide">
          <MetricTile label="People records" value={String(employeeCount)} />
          <MetricTile label="Active employees" value={String(activeCount)} />
          <MetricTile label="Needs attention" value={String(employeesNeedingAttention)} />
          <MetricTile label="Monthly payroll view" value={formatCurrency(monthlyPayroll)} />
        </div>
      </PageHero>

      <div className="card employees-toolbar-card">
        <div className="employees-toolbar">
          <label className="employees-search">
            <Search size={16} className="employees-search-icon" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or employee number" />
          </label>
          <select className="employees-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}>
            {statusOptions.map((status) => <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>)}
          </select>
          <select className="employees-select" value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value as AttentionFilter)}>
            {attentionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        {error ? <Banner tone="error" icon={<AlertTriangle size={16} />} className="employees-banner">{error}</Banner> : null}

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
                    <MobileData label="Ops" value={`${employee.opsSummary?.openChecklistItems ?? 0} tasks | ${employee.opsSummary?.pendingAcknowledgments ?? 0} docs`} />
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

      {panelOpen ? (
        <Drawer
          title={selectedEmployeeId ? 'Manage employee' : 'Add employee'}
          subtitle={selectedEmployeeId ? 'Update profile data, then move into lifecycle and document work without leaving the employee record.' : 'Capture core employment details, compensation, and emergency contact information.'}
          onClose={() => setPanelOpen(false)}
          bodyClassName="employees-panel-body"
          size="lg"
        >
          {selectedEmployeeId ? (
            <div className="employees-panel-tabs">
              {[
                { id: 'profile', label: 'Profile', icon: <UserRound size={14} /> },
                { id: 'lifecycle', label: 'Lifecycle', icon: <FolderSync size={14} /> },
                { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
                { id: 'skills', label: 'Skills', icon: <ShieldCheck size={14} /> },
              ].map((tab) => (
                <button key={tab.id} type="button" className={`employees-panel-tab ${panelTab === tab.id ? 'employees-panel-tab-active' : ''}`} onClick={() => setPanelTab(tab.id as PanelTab)}>
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="employees-form">
          {panelTab === 'profile' ? (
            <form onSubmit={onSubmit}>
              {selectedEmployee?.learningSummary ? (
                <div className="employees-learning-summary">
                  <div className="employees-learning-summary-header">
                    <h3>Learning summary</h3>
                    <p>Compact training visibility for HR without leaving the employee record.</p>
                  </div>
                  <div className="employees-learning-summary-grid">
                    <MetricTile label="Assigned" value={String(selectedEmployee.learningSummary.assigned)} />
                    <MetricTile label="Overdue" value={String(selectedEmployee.learningSummary.overdue)} />
                    <MetricTile label="Completed" value={String(selectedEmployee.learningSummary.completed)} />
                    <MetricTile label="Certificate alerts" value={String(selectedEmployee.learningSummary.certificateAlerts)} />
                  </div>
                </div>
              ) : null}

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
                <Field label="Manager">
                  <select {...register('managerId')}>
                    <option value="">No manager assigned</option>
                    {employees.filter((employee) => employee.id !== selectedEmployeeId).map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>
                    ))}
                  </select>
                </Field>
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
          ) : null}

          {panelTab === 'lifecycle' && selectedEmployeeId ? renderLifecycleTab({
            checklists,
            opsLoading,
            onCreateChecklist: handleCreateLifecycleChecklist,
            onToggleItem: handleChecklistToggle,
          }) : null}

          {panelTab === 'documents' && selectedEmployeeId ? renderDocumentsTab({
            documentCategories,
            documentDraft,
            documentTemplates,
            documents,
            opsLoading,
            onAcknowledge: handleAcknowledgeDocument,
            onCreateDocument: handleCreateDocument,
            onDraftChange: setDocumentDraft,
            onTemplateChange: handleDocumentTemplateChange,
          }) : null}

          {panelTab === 'skills' && selectedEmployeeId ? renderSkillsTab({
            employeeSkills,
            opsLoading,
            skillNotes,
            onSkillNoteChange: setSkillNotes,
            onValidate: handleSkillValidation,
          }) : null}
          </div>
        </Drawer>
      ) : null}

      {deleteCandidate ? (
        <ConfirmDialog
          title="Confirm delete"
          confirmLabel={<>{submitting ? <LoaderCircle className="employees-spin" size={16} /> : <Trash2 size={16} />}Confirm delete</>}
          onConfirm={() => { void confirmDelete(); }}
          onClose={() => setDeleteCandidate(null)}
          confirmDisabled={submitting}
          tone="danger"
          className="employees-dialog"
        >
          <div className="employees-dialog-icon"><AlertTriangle size={20} /></div>
          <p>This will mark {deleteCandidate.firstName} {deleteCandidate.lastName} as terminated and create offboarding work if needed. Confirm before continuing.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function renderSkillsTab({
  employeeSkills,
  opsLoading,
  skillNotes,
  onSkillNoteChange,
  onValidate,
}: {
  employeeSkills: TeamEmployeeSkillRecord[];
  opsLoading: boolean;
  skillNotes: Record<string, string>;
  onSkillNoteChange: Dispatch<SetStateAction<Record<string, string>>>;
  onValidate: (skillId: string, validationStatus: 'Validated' | 'NotValidated') => Promise<void>;
}) {
  return (
    <div className="employees-ops-shell">
      {opsLoading ? <div className="employees-empty-state employees-ops-state"><LoaderCircle className="employees-spin" size={18} /><span>Loading skills...</span></div> : null}
      {!opsLoading && employeeSkills.length === 0 ? <div className="employees-empty-state employees-ops-state"><ShieldCheck size={18} /><span>No self-identified skills are on file for this employee yet.</span></div> : null}
      {!opsLoading && employeeSkills.length > 0 ? employeeSkills.map((skill) => (
        <div key={skill.id} className="employees-ops-card">
          <div className="employees-ops-card-header">
            <div>
              <h3>{skill.skillTag.name}</h3>
              <p>{skill.skillTag.category?.name ?? 'Skill'} | {skill.selfReportedLevel ?? 'Level not supplied'} | {skill.confidence ? `${skill.confidence}/5 confidence` : 'Confidence not supplied'}</p>
            </div>
            <span className={`badge ${skill.validationStatus === 'Validated' ? 'badge-success' : skill.validationStatus === 'NotValidated' ? 'badge-danger' : 'badge-warning'}`}>{skill.validationStatus}</span>
          </div>
          <label className="employees-field">
            <span>HR or manager note</span>
            <textarea rows={3} value={skillNotes[skill.id] ?? skill.managerNote ?? ''} onChange={(event) => onSkillNoteChange((current) => ({ ...current, [skill.id]: event.target.value }))} />
          </label>
          <div className="employees-form-actions employees-form-actions-inline">
            <button type="button" className="button button-outline" onClick={() => { void onValidate(skill.id, 'Validated'); }}>Validate</button>
            <button type="button" className="button button-outline employees-danger-outline" onClick={() => { void onValidate(skill.id, 'NotValidated'); }}>Not validated</button>
          </div>
        </div>
      )) : null}
    </div>
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

function renderLifecycleTab({
  checklists,
  opsLoading,
  onCreateChecklist,
  onToggleItem,
}: {
  checklists: EmployeeChecklistRecord[];
  opsLoading: boolean;
  onCreateChecklist: (lifecycleType: 'Onboarding' | 'Offboarding') => Promise<void>;
  onToggleItem: (itemId: string, currentStatus: 'Open' | 'Completed') => Promise<void>;
}) {
  return (
    <div className="employees-ops-shell">
      <div className="employees-ops-actions">
        <button type="button" className="button button-outline" onClick={() => { void onCreateChecklist('Onboarding'); }} disabled={opsLoading}>
          <FolderSync size={16} />
          Add onboarding checklist
        </button>
        <button type="button" className="button button-outline" onClick={() => { void onCreateChecklist('Offboarding'); }} disabled={opsLoading}>
          <ShieldCheck size={16} />
          Add offboarding checklist
        </button>
      </div>
      {opsLoading ? <div className="employees-empty-state employees-ops-state"><LoaderCircle className="employees-spin" size={18} /><span>Loading lifecycle work...</span></div> : null}
      {!opsLoading && checklists.length === 0 ? <div className="employees-empty-state employees-ops-state"><FolderSync size={18} /><span>No lifecycle checklists have been created for this employee yet.</span></div> : null}
      {!opsLoading && checklists.length > 0 ? checklists.map((checklist) => (
        <div key={checklist.id} className="employees-ops-card">
          <div className="employees-ops-card-header">
            <div>
              <h3>{checklist.title}</h3>
              <p>{checklist.lifecycleType} | {checklist.summary.completedItems}/{checklist.summary.totalItems} completed | Due {formatDate(checklist.dueDate)}</p>
            </div>
            <span className={`badge ${checklist.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>{checklist.status}</span>
          </div>
          <div className="employees-ops-list">
            {checklist.items.map((item) => (
              <div key={item.id} className="employees-ops-row">
                <div>
                  <div className="employees-ops-title">{item.title}</div>
                  <div className="employees-ops-meta">{item.ownerLabel} | Due {formatDate(item.dueDate)}</div>
                </div>
                <button type="button" className={`button button-outline ${item.status === 'Completed' ? 'employees-ops-complete' : ''}`} onClick={() => { void onToggleItem(item.id, item.status); }}>
                  {item.status === 'Completed' ? 'Completed' : 'Mark complete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )) : null}
    </div>
  );
}

function renderDocumentsTab({
  documentCategories,
  documentDraft,
  documentTemplates,
  documents,
  opsLoading,
  onAcknowledge,
  onCreateDocument,
  onDraftChange,
  onTemplateChange,
}: {
  documentCategories: DocumentCategoryRecord[];
  documentDraft: DocumentDraft;
  documentTemplates: DocumentTemplateRecord[];
  documents: EmployeeDocumentRecord[];
  opsLoading: boolean;
  onAcknowledge: (documentId: string) => Promise<void>;
  onCreateDocument: () => Promise<void>;
  onDraftChange: Dispatch<SetStateAction<DocumentDraft>>;
  onTemplateChange: (templateId: string) => void;
}) {
  return (
    <div className="employees-ops-shell">
      <div className="employees-ops-card">
        <div className="employees-ops-card-header">
          <div>
            <h3>Add document</h3>
            <p>Track required acknowledgments, contracts, and expiry-driven records in the employee profile.</p>
          </div>
        </div>
        <div className="employees-form-grid">
          <Field label="Title"><input value={documentDraft.title} onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))} /></Field>
          <Field label="Category">
            <select value={documentDraft.categoryId} onChange={(event) => onDraftChange((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">Select category</option>
              {documentCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Template">
            <select value={documentDraft.templateId} onChange={(event) => onTemplateChange(event.target.value)}>
              <option value="">Optional template</option>
              {documentTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </Field>
          <Field label="Issue date"><input type="date" value={documentDraft.issueDate} onChange={(event) => onDraftChange((current) => ({ ...current, issueDate: event.target.value }))} /></Field>
          <Field label="Expiry date"><input type="date" value={documentDraft.expiryDate} onChange={(event) => onDraftChange((current) => ({ ...current, expiryDate: event.target.value }))} /></Field>
          <Field label="Requires acknowledgment">
            <select value={documentDraft.required ? 'yes' : 'no'} onChange={(event) => onDraftChange((current) => ({ ...current, required: event.target.value === 'yes' }))}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><input value={documentDraft.notes} onChange={(event) => onDraftChange((current) => ({ ...current, notes: event.target.value }))} /></Field>
        <div className="employees-form-actions employees-form-actions-inline">
          <button type="button" className="button" onClick={() => { void onCreateDocument(); }} disabled={opsLoading || !documentDraft.title || !documentDraft.categoryId}>
            {opsLoading ? <LoaderCircle className="employees-spin" size={16} /> : <FileText size={16} />}
            Add document
          </button>
        </div>
      </div>

      {opsLoading ? <div className="employees-empty-state employees-ops-state"><LoaderCircle className="employees-spin" size={18} /><span>Loading documents...</span></div> : null}
      {!opsLoading && documents.length === 0 ? <div className="employees-empty-state employees-ops-state"><FileText size={18} /><span>No employee documents are tracked yet.</span></div> : null}
      {!opsLoading && documents.length > 0 ? documents.map((document) => (
        <div key={document.id} className="employees-ops-card">
          <div className="employees-ops-card-header">
            <div>
              <h3>{document.title}</h3>
              <p>{document.category?.name ?? 'General'} | {document.required ? 'Required' : 'Optional'} | {document.expiryDate ? `Expires ${formatDate(document.expiryDate)}` : 'No expiry'}</p>
            </div>
            <span className={`badge ${document.status === 'Current' ? 'badge-success' : document.status === 'Pending Acknowledgment' ? 'badge-warning' : 'badge-danger'}`}>{document.status}</span>
          </div>
          {document.notes ? <p className="employees-ops-description">{document.notes}</p> : null}
          {document.acknowledgments.length > 0 ? (
            <div className="employees-ops-list">
              {document.acknowledgments.map((ack) => (
                <div key={ack.id} className="employees-ops-row">
                  <div>
                    <div className="employees-ops-title">{ack.status === 'Pending' ? 'Acknowledgment pending' : 'Acknowledged'}</div>
                    <div className="employees-ops-meta">Due {formatDate(ack.dueDate)} {ack.acknowledgedAt ? `| Completed ${formatDate(ack.acknowledgedAt)}` : ''}</div>
                  </div>
                  {ack.status === 'Pending' ? <button type="button" className="button button-outline" onClick={() => { void onAcknowledge(document.id); }}>Mark acknowledged</button> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )) : null}
    </div>
  );
}
