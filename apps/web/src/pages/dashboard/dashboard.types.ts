export type EmployeeStatus = 'Active' | 'On Leave' | 'Probation';

export interface PayrollDatum {
  month: string;
  cost: number;
  budget: number;
}

export interface DepartmentDatum {
  name: string;
  value: number;
  color: string;
}

export interface DashboardEmployee {
  id: string;
  name: string;
  initials: string;
  department: string;
  role: string;
  joinDate: string;
  salary: number;
  status: EmployeeStatus;
}
