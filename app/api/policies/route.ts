import { assertModuleAccess } from "@/lib/module-auth";
import { getModuleAccessLevelMap } from "@/lib/module-access";
import { listPolicies, publishPolicy, policyError } from "@/lib/policies";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z.object({
    id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(100000),
}).refine((value) => !value.id || !!value.version, { message: "Version is required for updates" });

export async function GET() {
    try {
        const upn = await assertModuleAccess("policies");
        const [policies, levels] = await Promise.all([listPolicies(upn), getModuleAccessLevelMap(upn)]);
        return Response.json({ policies, pendingCount: policies.filter((p) => !p.acknowledged_at).length, canModify: levels.policies === "modify" });
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
