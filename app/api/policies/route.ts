import { assertModuleAccess } from "@/lib/module-auth";
import { getModuleAccessLevelMap } from "@/lib/module-access";
import { listPolicies, publishPolicy, policyError } from "@/lib/policies";
import { EMPLOYEE_TYPES } from "@/lib/employee-types";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z.object({
    attachment: z.object({
        name: z.string().trim().min(1).max(255).regex(/^[^\x00-\x1f\x7f/\\]+$/),
        size: z.number().int().positive().max(5 * 1024 * 1024),
        data: z.string().max(6990508).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    }).refine((file) => Buffer.from(file.data, "base64").length === file.size, { message: "Invalid attachment" }).optional(),
    id: z.string().uuid().optional(), version: z.number().int().positive().max(2147483647).optional(),
    expectedVersion: z.number().int().positive().max(2147483647).optional(),
    target_roles: z.array(z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/)).max(1000).default([]),
    target_employee_types: z.array(z.enum(EMPLOYEE_TYPES)).max(3).default([]),
    target_departments: z.array(z.string().trim().min(1).max(256)).max(1000).default([]),
    target_users: z.array(z.string().trim().email().toLowerCase()).max(10000).default([]),
    title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(100000),
}).refine((value) => !value.id || (!!value.version && !!value.expectedVersion && value.version > value.expectedVersion), { message: "Enter a version greater than the current version" });

export async function GET() {
    try {
        const upn = await assertModuleAccess("policies");
        const levels = await getModuleAccessLevelMap(upn);
        const policies = await listPolicies(upn, levels.policies === "modify");
        return Response.json({ policies, pendingCount: policies.filter((p) => p.requires_acknowledgement && !p.acknowledged_at).length, canModify: levels.policies === "modify" });
    } catch (error) { return policyError(error); }
}

export async function POST(req: Request) {
    try {
        const upn = await assertModuleAccess("policies", "modify");
        const input = schema.parse(await req.json());
        return Response.json(await publishPolicy(input, upn), { status: input.id ? 200 : 201 });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return new Response("Enter a title, policy text, valid version, valid audience, and an attachment up to 5 MB.", { status: 400 });
        return policyError(error);
    }
}
