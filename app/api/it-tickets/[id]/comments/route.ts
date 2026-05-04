import { z } from "zod";
import { addTicketComment, getTicketById } from "@/lib/it-tickets";
import { canAccessModuleWithLevel } from "@/lib/module-access";
import { getRequestIdentity } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
    body: z.string().trim().optional(),
    attachments: z.array(z.object({
        fileName: z.string().trim().min(1).max(180),
        mimeType: z.string().trim().regex(/^image\//),
        dataUrl: z.string().trim().startsWith("data:image/").max(7_000_000),
    })).max(5).optional(),
}).refine((value) => Boolean(value.body?.trim() || value.attachments?.length), {
    message: "Add a comment or attachment",
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const identity = await getRequestIdentity();
        if (!identity?.upn || !(await canAccessModuleWithLevel(identity.upn, "it-tickets", "modify"))) {
            return new Response("Forbidden", { status: 403 });
        }

        const { id } = await ctx.params;
        const ticket = await getTicketById(decodeURIComponent(id));
        if (!ticket || ticket.requester_upn !== identity.upn.trim().toLowerCase()) {
            return new Response("Ticket not found", { status: 404 });
        }

        const parsed = payloadSchema.parse(await req.json());
        const comment = await addTicketComment({
            ticketId: ticket.id,
            body: parsed.body?.trim() || "Added attachment.",
            actor: {
                upn: identity.upn,
                name: identity.name ?? identity.email ?? identity.upn,
            },
            visibility: "public",
            attachments: parsed.attachments,
        });
        return Response.json({ comment }, { status: 201 });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("POST /api/it-tickets/[id]/comments failed", error);
        return new Response("Failed to add ticket comment", { status: 500 });
    }
}
