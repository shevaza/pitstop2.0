export type PolicyAttachment = { name: string; size: number; data: string };

export type Policy = {
    id: string;
    title: string;
    body: string;
    attachment_name?: string | null;
    is_hidden: boolean;
    deleted_at: string | null;
    version: number;
    target_roles: string[];
    target_employee_types: string[];
    target_departments: string[];
    target_users: string[];
    recipient_upns: string[] | null;
    requires_acknowledgement?: boolean;
    updated_by_upn: string;
    created_at: string;
    updated_at: string;
    acknowledged_at: string | null;
};

export type PolicyAcknowledgement = {
    policy_id: string;
    version: number;
    user_upn: string;
    acknowledged_at: string;
};

export type PolicyList = { policies: Policy[]; pendingCount: number; canModify: boolean };

export type PolicyAudience = { roles: string[]; departments: string[]; users: { upn: string; name: string; department: string; employeeType: string; role: string }[] };
