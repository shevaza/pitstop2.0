import { z } from "zod";
import { request as httpsRequest } from "node:https";

const reportSchema = z.object({ id: z.string(), name: z.string() });
export const attendanceSchema = z.object({
    rows: z.array(z.record(z.string(), z.unknown())).max(2000),
    columns: z.array(z.string()),
    fetchedAt: z.string(),
    limit: z.number().int().min(1).max(2000),
    report: reportSchema,
    availableReports: z.array(reportSchema),
    source: z.string(),
});
const reportsSchema = z.object({ connected: z.literal(true), reports: z.array(reportSchema) });
export type AttendanceApiSettings = z.infer<typeof reportsSchema> & { managedBy: "internal-api" };

export class AttendanceApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
}

// Import only from server routes. Service credentials must never reach web/mobile bundles.
export function getAttendanceApiConfig(env = process.env) {
    const raw = env.ATTENDANCE_API_URL;
    const token = env.ATTENDANCE_API_TOKEN;
    if (!raw || !token || token.length < 32 || /\s/.test(token)) {
        throw new AttendanceApiError("Attendance API is not configured on the app server.", 503);
    }
    let url: URL;
    try { url = new URL(raw); } catch {
        throw new AttendanceApiError("Attendance API URL is invalid.", 503);
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && local && url.protocol === "http:"))) {
        throw new AttendanceApiError("Attendance API requires an HTTPS origin (localhost HTTP is allowed in development).", 503);
    }
    const clientId = env.ATTENDANCE_CF_ACCESS_CLIENT_ID;
    const clientSecret = env.ATTENDANCE_CF_ACCESS_CLIENT_SECRET;
    const authMode = env.ATTENDANCE_API_AUTH_MODE || "cloudflare";
    if (!["cloudflare", "bearer"].includes(authMode)) {
        throw new AttendanceApiError("Attendance API authentication mode is invalid.", 503);
    }
    if (authMode === "cloudflare" && (!local || env.NODE_ENV === "production") && (!clientId || !clientSecret)) {
        throw new AttendanceApiError("Attendance Cloudflare Access credentials are not configured.", 503);
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (authMode === "cloudflare" && clientId && clientSecret) {
        headers["CF-Access-Client-Id"] = clientId;
        headers["CF-Access-Client-Secret"] = clientSecret;
    }
    const ca = env.ATTENDANCE_API_CA_PEM?.replace(/\\n/g, "\n");
    if (ca && (!ca.includes("-----BEGIN CERTIFICATE-----") || ca.includes("PRIVATE KEY"))) {
        throw new AttendanceApiError("Attendance API CA must contain public PEM certificates only.", 503);
    }
    return { url, headers, ca };
}

// Custom trust applies only to this API connection, never to global Node TLS.
// Node verifies the chain, validity dates, and URL hostname/IP. No redirect following.
async function getWithPrivateCa(url: URL, headers: Record<string, string>, ca: string): Promise<Response> {
    if (url.protocol !== "https:") throw new AttendanceApiError("Custom certificate trust requires HTTPS.", 503);
    return new Promise((resolve, reject) => {
        const req = httpsRequest(url, { headers, ca, rejectUnauthorized: true, agent: false }, (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > 4 * 1024 * 1024) {
                    req.destroy(new AttendanceApiError("Attendance report is too large. Reduce the row limit.", 502));
                    return;
                }
                chunks.push(chunk);
            });
            res.on("error", reject);
            res.on("end", () => {
                clearTimeout(timer);
                const status = res.statusCode || 502;
                if (status >= 300 && status < 400) {
                    reject(new AttendanceApiError("Attendance API redirects are not allowed.", 502));
                    return;
                }
                resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
                    status, headers: { "content-type": String(res.headers["content-type"] || "") },
                }));
            });
        });
        const timer = setTimeout(() => req.destroy(new AttendanceApiError("Attendance service timed out. Try again shortly.", 504)), 25000);
        req.on("error", (error) => { clearTimeout(timer); reject(error); });
        req.end();
    });
}

async function apiGet<T>(path: string, schema: z.ZodType<T>) {
    const { url, headers, ca } = getAttendanceApiConfig();
    try {
        const response = ca ? await getWithPrivateCa(new URL(path, url), headers, ca) : await fetch(new URL(path, url), {
            headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 400) throw new AttendanceApiError("Invalid attendance filters or report. Check the dates and row limit (1–2000).", 400);
            if (response.status === 429) throw new AttendanceApiError("Too many attendance requests. Try again shortly.", 429);
            if (response.status === 413) throw new AttendanceApiError("Attendance report is too large. Reduce the row limit or date range.", 413);
            throw new AttendanceApiError("Attendance service is unavailable. Contact IT if this continues.", 503);
        }
        if (!response.headers.get("content-type")?.includes("application/json") || !response.body) {
            await response.body?.cancel();
            throw new AttendanceApiError("Invalid response from attendance service.", 502);
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4 * 1024 * 1024) {
                await reader.cancel();
                throw new AttendanceApiError("Attendance report is too large. Reduce the row limit.", 502);
            }
            chunks.push(value);
        }
        return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (error) {
        if (error instanceof AttendanceApiError) throw error;
        if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
            throw new AttendanceApiError("Attendance service timed out. Try again shortly.", 504);
        }
        throw new AttendanceApiError("Could not retrieve data from attendance service.", 502);
    }
}

export async function fetchAttendance(params: URLSearchParams) {
    const allowed = new Set(["limit", "fromDate", "toDate", "reportId"]);
    for (const key of params.keys()) {
        if (!allowed.has(key) || params.getAll(key).length !== 1) {
            throw new AttendanceApiError("Unsupported or repeated attendance parameter.", 400);
        }
    }
    return apiGet(`/v1/attendance?${params.toString()}`, attendanceSchema);
}

export async function fetchAttendanceSettings(): Promise<AttendanceApiSettings> {
    return { ...await apiGet("/v1/reports", reportsSchema), managedBy: "internal-api" };
}

export function attendanceErrorResponse(error: unknown) {
    const known = error instanceof AttendanceApiError;
    return new Response(known ? error.message : "Attendance service is unavailable.", {
        status: known ? error.status : 503,
        headers: { "Cache-Control": "no-store", ...(known && error.status === 429 ? { "Retry-After": "60" } : {}) },
    });
}
