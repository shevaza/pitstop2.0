import { supabaseRequest } from "@/lib/supabase-admin";

export const ticketStatuses = ["open", "in-progress", "waiting-user", "resolved", "closed"] as const;
export const ticketPriorities = ["low", "medium", "high", "urgent"] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketPriority = (typeof ticketPriorities)[number];

export type TicketComment = {
    id: string;
    ticket_id: string;
    author_upn: string;
    author_name?: string | null;
    visibility: "public" | "internal";
    body: string;
    created_at: string;
    attachments?: TicketAttachment[];
};

export type TicketAttachment = {
    id: string;
    ticket_id: string;
    comment_id?: string | null;
    uploader_upn: string;
    uploader_name?: string | null;
    file_name: string;
    mime_type: string;
    data_url: string;
    created_at: string;
};

export type TicketRecord = {
    id: string;
    title: string;
    description: string;
    category?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    requester_upn: string;
    requester_name?: string | null;
    assigned_to_upn?: string | null;
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
    comments?: TicketComment[];
    attachments?: TicketAttachment[];
};

type Actor = {
    upn: string;
    name?: string | null;
};

function normalizeUpn(value: string) {
    return value.trim().toLowerCase();
}

async function withComments(tickets: TicketRecord[], includeInternal: boolean) {
    if (!tickets.length) return tickets;

    const ids = tickets.map((ticket) => ticket.id).join(",");
    const [comments, attachments] = await Promise.all([
        supabaseRequest<TicketComment[]>("it_ticket_comments", {
            query: {
                select: "*",
                ticket_id: `in.(${ids})`,
                ...(includeInternal ? {} : { visibility: "eq.public" }),
                order: "created_at.asc",
            },
        }),
        supabaseRequest<TicketAttachment[]>("it_ticket_attachments", {
            query: {
                select: "*",
                ticket_id: `in.(${ids})`,
                order: "created_at.asc",
            },
        }),
    ]);
    const commentsByTicket = new Map<string, TicketComment[]>();
    for (const comment of comments) {
        commentsByTicket.set(comment.ticket_id, [...(commentsByTicket.get(comment.ticket_id) ?? []), comment]);
    }
    const ticketAttachmentsByTicket = new Map<string, TicketAttachment[]>();
    const attachmentsByComment = new Map<string, TicketAttachment[]>();
    for (const attachment of attachments) {
        if (attachment.comment_id) {
            attachmentsByComment.set(attachment.comment_id, [...(attachmentsByComment.get(attachment.comment_id) ?? []), attachment]);
        } else {
            ticketAttachmentsByTicket.set(attachment.ticket_id, [...(ticketAttachmentsByTicket.get(attachment.ticket_id) ?? []), attachment]);
        }
    }

    return tickets.map((ticket) => ({
        ...ticket,
        attachments: ticketAttachmentsByTicket.get(ticket.id) ?? [],
        comments: (commentsByTicket.get(ticket.id) ?? []).map((comment) => ({
            ...comment,
            attachments: attachmentsByComment.get(comment.id) ?? [],
        })),
    }));
}

export async function listMyTickets(userPrincipalName: string) {
    const tickets = await supabaseRequest<TicketRecord[]>("it_tickets", {
        query: {
            select: "*",
            requester_upn: `eq.${normalizeUpn(userPrincipalName)}`,
            order: "updated_at.desc",
        },
    });

    return withComments(tickets, false);
}

export async function listAllTickets() {
    const tickets = await supabaseRequest<TicketRecord[]>("it_tickets", {
        query: {
            select: "*",
            order: "updated_at.desc",
        },
    });

    return withComments(tickets, true);
}

export async function getTicketById(id: string) {
    const [ticket] = await supabaseRequest<TicketRecord[]>("it_tickets", {
        query: {
            select: "*",
            id: `eq.${id}`,
            limit: 1,
        },
    });

    if (!ticket) return null;
    const [withHistory] = await withComments([ticket], true);
    return withHistory;
}

export async function createTicket(input: {
    title: string;
    description: string;
    category?: string | null;
    priority: TicketPriority;
    actor: Actor;
    attachments?: TicketAttachmentInput[];
}) {
    const [ticket] = await supabaseRequest<TicketRecord[]>("it_tickets", {
        method: "POST",
        query: { select: "*" },
        headers: { Prefer: "return=representation" },
        body: {
            title: input.title,
            description: input.description,
            category: input.category ?? null,
            priority: input.priority,
            status: "open",
            requester_upn: normalizeUpn(input.actor.upn),
            requester_name: input.actor.name ?? null,
        },
    });

    await addTicketComment({
        ticketId: ticket.id,
        body: "Ticket submitted.",
        actor: input.actor,
        visibility: "public",
    });
    if (input.attachments?.length) {
        await addTicketAttachments({
            ticketId: ticket.id,
            actor: input.actor,
            attachments: input.attachments,
        });
    }

    return getTicketById(ticket.id);
}

export async function updateTicket(id: string, input: {
    status: TicketStatus;
    priority: TicketPriority;
    assignedToUpn?: string | null;
    actor: Actor;
    comment?: string | null;
    visibility?: "public" | "internal";
    attachments?: TicketAttachmentInput[];
}) {
    const [ticket] = await supabaseRequest<TicketRecord[]>("it_tickets", {
        method: "PATCH",
        query: {
            select: "*",
            id: `eq.${id}`,
        },
        headers: { Prefer: "return=representation" },
        body: {
            status: input.status,
            priority: input.priority,
            assigned_to_upn: input.assignedToUpn?.trim().toLowerCase() || null,
            closed_at: ["resolved", "closed"].includes(input.status) ? new Date().toISOString() : null,
        },
    });

    if (input.comment?.trim() || input.attachments?.length) {
        const comment = await addTicketComment({
            ticketId: id,
            body: input.comment?.trim() || "Added attachment.",
            actor: input.actor,
            visibility: input.visibility ?? "public",
        });
        if (input.attachments?.length) {
            await addTicketAttachments({
                ticketId: id,
                commentId: comment.id,
                actor: input.actor,
                attachments: input.attachments,
            });
        }
    }

    return getTicketById(ticket.id);
}

export type TicketAttachmentInput = {
    fileName: string;
    mimeType: string;
    dataUrl: string;
};

export async function addTicketComment(input: {
    ticketId: string;
    body: string;
    actor: Actor;
    visibility: "public" | "internal";
    attachments?: TicketAttachmentInput[];
}) {
    const [comment] = await supabaseRequest<TicketComment[]>("it_ticket_comments", {
        method: "POST",
        query: { select: "*" },
        headers: { Prefer: "return=representation" },
        body: {
            ticket_id: input.ticketId,
            author_upn: normalizeUpn(input.actor.upn),
            author_name: input.actor.name ?? null,
            visibility: input.visibility,
            body: input.body,
        },
    });

    if (input.attachments?.length) {
        await addTicketAttachments({
            ticketId: input.ticketId,
            commentId: comment.id,
            actor: input.actor,
            attachments: input.attachments,
        });
    }

    return comment;
}

async function addTicketAttachments(input: {
    ticketId: string;
    commentId?: string | null;
    actor: Actor;
    attachments: TicketAttachmentInput[];
}) {
    const rows = input.attachments.map((attachment) => ({
        ticket_id: input.ticketId,
        comment_id: input.commentId ?? null,
        uploader_upn: normalizeUpn(input.actor.upn),
        uploader_name: input.actor.name ?? null,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType,
        data_url: attachment.dataUrl,
    }));

    return supabaseRequest<TicketAttachment[]>("it_ticket_attachments", {
        method: "POST",
        query: { select: "*" },
        headers: { Prefer: "return=representation" },
        body: rows,
    });
}
