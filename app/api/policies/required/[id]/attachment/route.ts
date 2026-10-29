import { assertPolicyUser } from "@/lib/policy-enforcement";
import { downloadPolicyAttachment, policyError } from "@/lib/policies";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const upn = await assertPolicyUser();
        const { id } = await context.params;
        if (!z.string().uuid().safeParse(id).success) return new Response("Invalid policy ID", { status: 400 });
        const file = await downloadPolicyAttachment(id, upn, false);
        return new Response(Buffer.from(file.data, "base64"), { headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        } });
    } catch (error) { return policyError(error); }
}
