import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";

export const dynamic = "force-dynamic";

const columns = [
    "UserPrincipalName",
    "DisplayName",
    "GivenName",
    "Surname",
    "JobTitle",
    "Department",
    "OfficeLocation",
    "MobilePhone",
    "EmployeeId",
    "EmployeeType",
    "UsageLocation",
    "ManagerUPN",
    "Groups(semi;colon;list)",
    "Licenses(comma,list)",
] as const;

function csvEscape(value: string) {
    if (value.includes('"') || value.includes(",") || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export async function GET() {
    const session = await auth();
    const upn = (session as any)?.upn as string | undefined;
    if (!upn || !(await isAllowed(upn))) return new Response("Forbidden", { status: 403 });

    const select = [
        "id",
        "userPrincipalName",
        "displayName",
        "givenName",
        "surname",
        "jobTitle",
        "department",
        "officeLocation",
        "mobilePhone",
        "employeeId",
        "employeeType",
        "usageLocation",
    ].join(",");

    const users = await graphFetch<{ value: any[] }>(`/users?$top=10&$select=${select}`);

    const rows = await Promise.all(
        (users.value || []).map(async (u) => {
            let managerUpn = "";
            try {
                const mgr = await graphFetch<{ userPrincipalName?: string }>(`/users/${u.id}/manager?$select=userPrincipalName`);
                managerUpn = mgr?.userPrincipalName || "";
            } catch {
                managerUpn = "";
            }

            return {
                UserPrincipalName: u.userPrincipalName || "",
                DisplayName: u.displayName || "",
                GivenName: u.givenName || "",
                Surname: u.surname || "",
                JobTitle: u.jobTitle || "",
                Department: u.department || "",
                OfficeLocation: u.officeLocation || "",
                MobilePhone: u.mobilePhone || "",
                EmployeeId: u.employeeId || "",
                EmployeeType: u.employeeType || "",
                UsageLocation: u.usageLocation || "",
                ManagerUPN: managerUpn,
                "Groups(semi;colon;list)": "",
                "Licenses(comma,list)": "",
            };
        })
    );

    const csv = [
        columns.join(","),
        ...rows.map((r) => columns.map((c) => csvEscape(String((r as any)[c] ?? ""))).join(",")),
    ].join("\n");

    return new Response(csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": "attachment; filename=\"m365-bulk-template.csv\"",
        },
    });
}
