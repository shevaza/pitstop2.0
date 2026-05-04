"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

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
    visibility: string;
    body: string;
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
    requester_upn: string;
    requester_name?: string | null;
    assigned_to_upn?: string | null;
    created_at: string;
    updated_at: string;
    comments?: TicketComment[];
    attachments?: TicketAttachment[];
};

const statuses = ["open", "in-progress", "waiting-user", "resolved", "closed"];
const priorities = ["low", "medium", "high", "urgent"];

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

export default function ItTicketsAdminPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [filter, setFilter] = useState("active");
    const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
    const [draft, setDraft] = useState({
        status: "open",
        priority: "medium",
        assignedToUpn: "",
        comment: "",
        visibility: "public",
    });

    const load = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/it-tickets/admin", { cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const nextTickets = Array.isArray(data.items) ? data.items : [];
            setTickets(nextTickets);
            setSelectedId((current) => current ?? nextTickets[0]?.id ?? null);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const filteredTickets = useMemo(() => {
        if (filter === "all") return tickets;
        if (filter === "closed") return tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status));
        return tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
    }, [filter, tickets]);

    const selectedTicket = useMemo(
        () => tickets.find((ticket) => ticket.id === selectedId) ?? filteredTickets[0] ?? null,
        [filteredTickets, selectedId, tickets],
    );

    useEffect(() => {
        if (!selectedTicket) return;
        setDraft({
            status: selectedTicket.status,
            priority: selectedTicket.priority,
            assignedToUpn: selectedTicket.assigned_to_upn ?? "",
            comment: "",
            visibility: "public",
        });
        setAttachments([]);
    }, [selectedTicket]);

    const save = async () => {
        if (!selectedTicket) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/it-tickets/admin", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: selectedTicket.id,
                    ...draft,
                    attachments,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            setMessage("Ticket updated");
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to update ticket");
        } finally {
            setSaving(false);
        }
    };

    const updateAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
        setAttachments(await filesToAttachments(event.target.files));
        event.target.value = "";
    };

    return (
        <ModuleGuard moduleKey="it-tickets-admin">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold text-[var(--text)]">IT Tickets Admin</h1>
                            <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                                Review all tickets, update ownership and status, and keep requester-visible history current.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>
                    {message && (
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-4 py-3 text-sm text-[var(--text)]/80">
                            {message}
                        </div>
                    )}
                </section>

                <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
                        <div className="mb-3 flex gap-2">
                            {["active", "closed", "all"].map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setFilter(option)}
                                    className={`rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--text)] ${filter === option ? "bg-[color:rgba(14,3,219,0.28)]" : "bg-[var(--glass)]"}`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-2">
                            {filteredTickets.map((ticket) => (
                                <button
                                    key={ticket.id}
                                    type="button"
                                    onClick={() => setSelectedId(ticket.id)}
                                    className={`w-full rounded-xl border border-[var(--border)] p-3 text-left text-sm transition-colors ${selectedTicket?.id === ticket.id ? "bg-[color:rgba(14,3,219,0.18)]" : "bg-[var(--glass-strong)]"}`}
                                >
                                    <div className="font-medium text-[var(--text)]">{ticket.title}</div>
                                    <div className="mt-1 text-xs text-[var(--text)]/60">
                                        {ticket.status} | {ticket.priority} | {ticket.requester_name || ticket.requester_upn}
                                    </div>
                                </button>
                            ))}
                            {!filteredTickets.length && (
                                <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text)]/60">
                                    No tickets in this view.
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedTicket ? (
                        <div className="space-y-4">
                            <article className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-semibold text-[var(--text)]">{selectedTicket.title}</h2>
                                        <div className="mt-1 text-xs text-[var(--text)]/60">
                                            {selectedTicket.requester_name || selectedTicket.requester_upn} | Created {new Date(selectedTicket.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="rounded-full bg-[color:rgba(255,255,255,0.12)] px-3 py-1 text-xs font-semibold text-[var(--text)]">
                                        {selectedTicket.status}
                                    </div>
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--text)]/75">{selectedTicket.description}</p>
                                <AttachmentGallery attachments={selectedTicket.attachments} />
                            </article>

                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                                <h3 className="text-lg font-semibold text-[var(--text)]">Manage Ticket</h3>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Status</div>
                                        <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none">
                                            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                                        </select>
                                    </label>
                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Priority</div>
                                        <select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none">
                                            {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                                        </select>
                                    </label>
                                    <label className="block md:col-span-2">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Assigned To UPN</div>
                                        <input value={draft.assignedToUpn} onChange={(event) => setDraft((current) => ({ ...current, assignedToUpn: event.target.value }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none" />
                                    </label>
                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Comment Visibility</div>
                                        <select value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none">
                                            <option value="public">public</option>
                                            <option value="internal">internal</option>
                                        </select>
                                    </label>
                                    <label className="block md:col-span-2">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Follow-up Comment</div>
                                        <textarea value={draft.comment} onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))} className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-[var(--text)] outline-none" />
                                    </label>
                                    <label className="block md:col-span-2">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Images</div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            multiple
                                            onChange={(event) => void updateAttachments(event)}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)] outline-none"
                                        />
                                        <AttachmentGallery attachments={attachments} />
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void save()}
                                    disabled={saving}
                                    className="mt-4 rounded border border-[var(--border)] bg-[color:rgba(14,3,219,0.24)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                                >
                                    {saving ? "Saving..." : "Save Ticket"}
                                </button>
                            </div>

                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                                <h3 className="text-lg font-semibold text-[var(--text)]">History</h3>
                                <div className="mt-4 space-y-2">
                                    {(selectedTicket.comments ?? []).map((comment) => (
                                        <div key={comment.id} className="rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] p-3 text-sm">
                                            <div className="text-xs text-[var(--text)]/55">
                                                {comment.author_name || comment.author_upn} | {comment.visibility} | {new Date(comment.created_at).toLocaleString()}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap text-[var(--text)]/80">{comment.body}</div>
                                            <AttachmentGallery attachments={comment.attachments} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--text)]/60">
                            Select a ticket to manage.
                        </div>
                    )}
                </section>
            </main>
        </ModuleGuard>
    );
}
