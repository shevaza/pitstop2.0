"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TicketAttachment = {
    id: string;
    file_name: string;
    mime_type: string;
    data_url: string;
    created_at: string;
};

type AttachmentDraft = {
    fileName: string;
    mimeType: string;
    dataUrl: string;
};

type TicketComment = {
    id: string;
    author_name?: string | null;
    author_upn: string;
    body: string;
    visibility: string;
    created_at: string;
    attachments?: TicketAttachment[];
};

type Ticket = {
    id: string;
    title: string;
    description: string;
    category?: string | null;
    priority: string;
    status: string;
    assigned_to_upn?: string | null;
    created_at: string;
    updated_at: string;
    comments?: TicketComment[];
    attachments?: TicketAttachment[];
};

const priorities = ["low", "medium", "high", "urgent"];

function statusTone(status: string) {
    switch (status) {
        case "resolved":
        case "closed":
            return "bg-[color:rgba(52,211,153,0.18)]";
        case "in-progress":
            return "bg-[color:rgba(59,130,246,0.18)]";
        case "waiting-user":
            return "bg-[color:rgba(251,191,36,0.2)]";
        default:
            return "bg-[color:rgba(255,255,255,0.12)]";
    }
}

function filesToAttachments(files: FileList | null): Promise<AttachmentDraft[]> {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 5);
    return Promise.all(imageFiles.map((file) => new Promise<AttachmentDraft>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
            fileName: file.name,
            mimeType: file.type || "image/jpeg",
            dataUrl: String(reader.result),
        });
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
        reader.readAsDataURL(file);
    })));
}

function AttachmentGallery({ attachments }: { attachments?: TicketAttachment[] | AttachmentDraft[] }) {
    if (!attachments?.length) return null;
    return (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attachments.map((attachment, index) => {
                const key = "id" in attachment ? attachment.id : `${attachment.fileName}-${index}`;
                const name = "file_name" in attachment ? attachment.file_name : attachment.fileName;
                const dataUrl = "data_url" in attachment ? attachment.data_url : attachment.dataUrl;
                return (
                    <a key={key} href={dataUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={dataUrl} alt={name} className="h-28 w-full object-cover" />
                        <div className="truncate px-2 py-1 text-xs text-[var(--text)]/65">{name}</div>
                    </a>
                );
            })}
        </div>
    );
}

export default function ItTicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [commentByTicket, setCommentByTicket] = useState<Record<string, string>>({});
    const [commentAttachmentsByTicket, setCommentAttachmentsByTicket] = useState<Record<string, AttachmentDraft[]>>({});
    const [ticketAttachments, setTicketAttachments] = useState<AttachmentDraft[]>([]);
    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "",
        priority: "medium",
    });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/it-tickets", { cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setTickets(Array.isArray(data.items) ? data.items : []);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openCount = useMemo(
        () => tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length,
        [tickets],
    );

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/it-tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, attachments: ticketAttachments }),
            });
            if (!res.ok) throw new Error(await res.text());
            setForm({ title: "", description: "", category: "", priority: "medium" });
            setTicketAttachments([]);
            setMessage("Ticket submitted");
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to submit ticket");
        } finally {
            setSaving(false);
        }
    };

    const addComment = async (ticketId: string) => {
        const body = commentByTicket[ticketId]?.trim();
        const attachments = commentAttachmentsByTicket[ticketId] ?? [];
        if (!body && !attachments.length) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/it-tickets/${encodeURIComponent(ticketId)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body, attachments }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCommentByTicket((current) => ({ ...current, [ticketId]: "" }));
            setCommentAttachmentsByTicket((current) => ({ ...current, [ticketId]: [] }));
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to add comment");
        } finally {
            setSaving(false);
        }
    };

    const updateTicketAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
        setTicketAttachments(await filesToAttachments(event.target.files));
        event.target.value = "";
    };

    const updateCommentAttachments = async (ticketId: string, event: ChangeEvent<HTMLInputElement>) => {
        const attachments = await filesToAttachments(event.target.files);
        setCommentAttachmentsByTicket((current) => ({ ...current, [ticketId]: attachments }));
        event.target.value = "";
    };

    return (
        <ModuleGuard moduleKey="it-tickets">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold text-[var(--text)]">IT Tickets</h1>
                            <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                                Submit support requests and follow status, replies, and history from one place.
                            </p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-4 py-3 text-sm text-[var(--text)]/75">
                            {openCount} active of {tickets.length}
                        </div>
                    </div>
                    {message && (
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-4 py-3 text-sm text-[var(--text)]/80">
                            {message}
                        </div>
                    )}
                </section>

                <section className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                    <form onSubmit={submit} className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                        <h2 className="text-lg font-semibold text-[var(--text)]">Submit Ticket</h2>
                        <div className="mt-4 space-y-4">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Title</div>
                                <input
                                    value={form.title}
                                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none"
                                    required
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Category</div>
                                <input
                                    value={form.category}
                                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none"
                                    placeholder="Hardware, software, access..."
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Priority</div>
                                <select
                                    value={form.priority}
                                    onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none"
                                >
                                    {priorities.map((priority) => (
                                        <option key={priority} value={priority}>{priority}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Description</div>
                                <textarea
                                    value={form.description}
                                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                                    className="min-h-32 w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none"
                                    required
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Images</div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    multiple
                                    onChange={(event) => void updateTicketAttachments(event)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)] outline-none"
                                />
                                <AttachmentGallery attachments={ticketAttachments} />
                            </label>
                            <button
                                className="w-full rounded border border-[var(--border)] bg-[color:rgba(14,3,219,0.24)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "Submit Ticket"}
                            </button>
                        </div>
                    </form>

                    <div className="space-y-4">
                        {tickets.map((ticket) => (
                            <article key={ticket.id} className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold text-[var(--text)]">{ticket.title}</h2>
                                        <div className="mt-1 text-xs text-[var(--text)]/60">
                                            {ticket.category || "Uncategorized"} | {ticket.priority} | Updated {new Date(ticket.updated_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--text)] ${statusTone(ticket.status)}`}>
                                        {ticket.status}
                                    </span>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text)]/75">{ticket.description}</p>
                                <AttachmentGallery attachments={ticket.attachments} />
                                <div className="mt-4 space-y-2">
                                    {(ticket.comments ?? []).map((comment) => (
                                        <div key={comment.id} className="rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] p-3 text-sm">
                                            <div className="text-xs text-[var(--text)]/55">
                                                {comment.author_name || comment.author_upn} | {new Date(comment.created_at).toLocaleString()}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap text-[var(--text)]/80">{comment.body}</div>
                                            <AttachmentGallery attachments={comment.attachments} />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-col gap-2">
                                    <input
                                        value={commentByTicket[ticket.id] ?? ""}
                                        onChange={(event) => setCommentByTicket((current) => ({ ...current, [ticket.id]: event.target.value }))}
                                        className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)] outline-none"
                                        placeholder="Add follow-up..."
                                    />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        multiple
                                        onChange={(event) => void updateCommentAttachments(ticket.id, event)}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)] outline-none"
                                    />
                                    <AttachmentGallery attachments={commentAttachmentsByTicket[ticket.id]} />
                                    <button
                                        type="button"
                                        onClick={() => void addComment(ticket.id)}
                                        className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                                        disabled={saving || (!commentByTicket[ticket.id]?.trim() && !commentAttachmentsByTicket[ticket.id]?.length)}
                                    >
                                        Send
                                    </button>
                                </div>
                            </article>
                        ))}
                        {!tickets.length && !loading && (
                            <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--text)]/60">
                                No tickets submitted yet.
                            </div>
                        )}
                        {loading && <div className="text-sm text-[var(--text)]/60">Loading tickets...</div>}
                    </div>
                </section>
            </main>
        </ModuleGuard>
    );
}
