import { assertModuleAccess } from "@/lib/module-auth";
import { changePolicyStatus, policyError } from "@/lib/policies";
import { z } from "zod";
export const runtime = "nodejs";
const schema = z.object({ action: z.enum(["hide", "show", "delete"]), version: z.number().int().positive() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const upn = await assertModuleAccess("policies", "modify");
        const id = z.string().uuid().parse((await context.params).id);
        const input = schema.parse(await request.json());
        await changePolicyStatus(id, input.version, input.action, upn);
        return Response.json({ updated: true });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return new Response("Invalid policy action or version", { status: 400 });
        return policyError(error);
    }
}
