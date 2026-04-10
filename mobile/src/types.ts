export type AppModuleKey =
  | "dashboard"
  | "users"
  | "bulk"
  | "orgchart"
  | "hr"
  | "attendance"
  | "assets"
  | "user-access"
  | "settings";

export type UserRecord = {
  id: string;
  userPrincipalName: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  mobilePhone?: string;
  employeeId?: string;
  employeeType?: string;
  usageLocation?: string;
  accountEnabled?: boolean;
};

export type AssetRecord = {
  id: string;
  asset_tag: string;
  name: string;
  asset_group?: string | null;
  asset_type: string;
  status: string;
  serial_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  notes?: string | null;
  created_at: string;
  assigned_user?: {
    azure_user_id?: string | null;
    id?: string;
    user_principal_name: string;
    display_name?: string | null;
    given_name?: string | null;
    surname?: string | null;
    department?: string | null;
    job_title?: string | null;
    office_location?: string | null;
    mobile_phone?: string | null;
    employee_id?: string | null;
    employee_type?: string | null;
    usage_location?: string | null;
    account_enabled?: boolean | null;
    last_synced_at?: string | null;
  } | null;
};

export type Metrics = {
  totals: { employees: number; active: number; disabled: number; guests: number };
  departments: { name: string; count: number; active: number; disabled: number }[];
  generatedAt: string;
  recentRuns: {
    id: string;
    actorUpn: string;
    createdAt: string;
    dryRun: boolean;
    total: number;
    changed: number;
    failed: number;
  }[];
};

export type AttendanceResponse = {
  rows: Record<string, unknown>[];
  columns: string[];
  fetchedAt: string;
  limit: number;
  queryUsed?: string;
  source?: string;
  report?: { id: string; name: string };
  availableReports?: { id: string; name: string }[];
};
