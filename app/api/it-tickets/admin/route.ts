import { z } from "zod";
import { listAllTickets, ticketPriorities, ticketStatuses, updateTicket } from "@/lib/it-tickets";
import { assertModuleAccess } from "@/lib/module-auth";
import { getRequestIdentity } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(ticketStatuses),
    priority: z.enum(ticketPriorities),
    assignedToUpn: z.string().trim().nullable().optional(),
    comment: z.string().trim().nullable().optional(),
    visibility: z.enum(["public", "internal"]).default("public"),
    attachments: z.array(z.object({
        fileName: z.string().trim().min(1).max(180),
        mimeType: z.string().trim().regex(/^image\//),
        dataUrl: z.string().trim().startsWith("data:image/").max(7_000_000),
    })).max(5).optional(),
});

async function getActor(requiredLevel: "read" | "modify" = "read") {
    await assertModuleAccess("it-tickets-admin", requiredLevel);
    const identity = await getRequestIdentity();
    if (!identity?.upn) {
        throw new Response("Forbidden", { status: 403 });
    }
    return {
        upn: identity.upn,
        name: identity.name ?? identity.email ?? identity.upn,
    };
}

export async function GET() {
    try {
        await getActor();
        const items = await listAllTickets();
        return Response.json({ items });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/it-tickets/admin failed", error);
        return new Response("Failed to load tickets", { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const actor = await getActor("modify");
        const parsed = payloadSchema.parse(await req.json());
        const ticket = await updateTicket(parsed.id, {
            status: parsed.status,
            priority: parsed.priority,
            assignedToUpn: parsed.assignedToUpn,
            comment: parsed.comment,
            visibility: parsed.visibility,
            attachments: parsed.attachments,
            actor,
        });
        return Response.json({ ticket });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("PATCH /api/it-tickets/admin failed", error);
        return new Response("Failed to update ticket", { status: 500 });
    }
}
