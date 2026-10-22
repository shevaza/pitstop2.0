import { assertModuleAccess } from "@/lib/module-auth";
import { getModuleAccessLevelMap } from "@/lib/module-access";
import { listPolicies, publishPolicy, policyError } from "@/lib/policies";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z.object({
    id: z.string().uuid().optional(), version: z.number().int().positive().max(2147483647).optional(),
    expectedVersion: z.number().int().positive().max(2147483647).optional(),
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
        if (error instanceof z.ZodError || error instanceof SyntaxError) return new Response("Enter a title, policy text, and valid version.", { status: 400 });
        return policyError(error);
    }
}
