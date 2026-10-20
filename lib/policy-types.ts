export type Policy = {
    id: string;
    title: string;
    body: string;
    version: number;
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
