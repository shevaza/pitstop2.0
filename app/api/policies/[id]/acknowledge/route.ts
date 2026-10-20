import { assertModuleAccess } from "@/lib/module-auth";
import { acknowledgePolicy, policyError } from "@/lib/policies";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const upn = await assertModuleAccess("policies");
        const id = z.string().uuid().parse((await context.params).id);
        const { version } = z.object({ version: z.number().int().positive() }).parse(await req.json());
        await acknowledgePolicy(id, version, upn);
        return Response.json({ acknowledged: true });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return new Response("Invalid policy or version", { status: 400 });
        return policyError(error);
    }
}
