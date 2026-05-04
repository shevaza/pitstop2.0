import { z } from "zod";
import { createTicket, listMyTickets, ticketPriorities } from "@/lib/it-tickets";
import { assertModuleAccess } from "@/lib/module-auth";
import { getRequestIdentity } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    category: z.string().trim().nullable().optional(),
    priority: z.enum(ticketPriorities).default("medium"),
    attachments: z.array(z.object({
        fileName: z.string().trim().min(1).max(180),
        mimeType: z.string().trim().regex(/^image\//),
        dataUrl: z.string().trim().startsWith("data:image/").max(7_000_000),
    })).max(5).optional(),
});

async function getActor(requiredLevel: "read" | "modify" = "read") {
    await assertModuleAccess("it-tickets", requiredLevel);
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
        const actor = await getActor("modify");
        const items = await listMyTickets(actor.upn);
        return Response.json({ items });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/it-tickets failed", error);
        return new Response("Failed to load tickets", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const actor = await getActor();
        const parsed = payloadSchema.parse(await req.json());
        const ticket = await createTicket({
            ...parsed,
            actor,
        });
        return Response.json({ ticket }, { status: 201 });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("POST /api/it-tickets failed", error);
        return new Response("Failed to create ticket", { status: 500 });
    }
}
