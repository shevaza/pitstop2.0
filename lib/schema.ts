import { z } from "zod";

export const RowSchema = z.object({
    UserPrincipalName: z.string().email(),
    DisplayName: z.string().optional(),
    GivenName: z.string().optional(),
    Surname: z.string().optional(),
    JobTitle: z.string().optional(),
    Department: z.string().optional(),
    OfficeLocation: z.string().optional(),
    MobilePhone: z.string().optional(),
    EmployeeId: z.string().optional(),
    EmployeeType: z.string().optional(),
    UsageLocation: z.string().length(2).optional(),
    ManagerUPN: z.string().email().optional(),
    "Groups(semi;colon;list)": z.string().optional(),
    "Licenses(comma,list)": z.string().optional(),
});
export type Row = z.infer<typeof RowSchema>;
