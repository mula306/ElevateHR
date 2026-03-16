import type { DashboardEmployee, DepartmentDatum, PayrollDatum } from './dashboard.types';

export const payrollData: PayrollDatum[] = [
  { month: 'Jan', cost: 85000, budget: 90000 },
  { month: 'Feb', cost: 82000, budget: 90000 },
  { month: 'Mar', cost: 91000, budget: 90000 },
  { month: 'Apr', cost: 88000, budget: 92000 },
  { month: 'May', cost: 93000, budget: 92000 },
  { month: 'Jun', cost: 89000, budget: 95000 },
  { month: 'Jul', cost: 96000, budget: 95000 },
];

export const departmentData: DepartmentDatum[] = [
  { name: 'Engineering', value: 42, color: '#0098DB' },
  { name: 'Design', value: 18, color: '#58A618' },
  { name: 'Marketing', value: 15, color: '#f59e0b' },
  { name: 'Sales', value: 25, color: '#8b5cf6' },
];

export const employeeData: DashboardEmployee[] = [
  { id: 'EMP-1024', name: 'Hazel Nutt', initials: 'HN', department: 'Engineering', role: 'Lead UI/UX Designer', joinDate: 'Jun 21, 2024', salary: 85000, status: 'Active' },
  { id: 'EMP-1025', name: 'Simon Cyrene', initials: 'SC', department: 'Engineering', role: 'Sr Software Engineer', joinDate: 'Mar 15, 2023', salary: 120000, status: 'Active' },
  { id: 'EMP-1026', name: 'Aida Bugg', initials: 'AB', department: 'Design', role: 'Graphics Designer', joinDate: 'Jan 10, 2024', salary: 75000, status: 'On Leave' },
  { id: 'EMP-1027', name: 'Peg Legge', initials: 'PL', department: 'Marketing', role: 'Product Manager', joinDate: 'Sep 04, 2022', salary: 110000, status: 'Active' },
  { id: 'EMP-1028', name: 'Terry Aki', initials: 'TA', department: 'Sales', role: 'Account Executive', joinDate: 'Nov 22, 2024', salary: 68000, status: 'Probation' },
];
