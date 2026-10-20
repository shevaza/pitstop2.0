import { assertModuleAccess } from "@/lib/module-auth";
import { listPolicyAcknowledgements, policyError } from "@/lib/policies";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await assertModuleAccess("policies", "modify");
        const id = z.string().uuid().parse((await context.params).id);
        return Response.json({ acknowledgements: await listPolicyAcknowledgements(id) });
    } catch (error) {
        if (error instanceof z.ZodError) return new Response("Invalid policy", { status: 400 });
        return policyError(error);
    }
}
