import { promises as fs } from "node:fs";
import path from "node:path";

export type MssqlSettings = {
    server: string;
    database: string;
    user: string;
    password: string;
    attendanceQuery?: string;
    reports?: AttendanceReport[];
    encrypt?: boolean;
    trustServerCertificate?: boolean;
};

const SETTINGS_PATH = path.join(process.cwd(), ".data", "mssql-settings.json");
export const DEFAULT_ATTENDANCE_QUERY =
    "SELECT TOP ({{limit}}) * FROM Attendance ORDER BY [Date] DESC";
const DEFAULT_REPORT_ID = "attendance-default";

async function ensureSettingsDir() {
    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
}

export async function readSettingsFile(): Promise<MssqlSettings | null> {
    try {
        const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
        return JSON.parse(raw) as MssqlSettings;
    } catch {
        return null;
    }
}

export async function writeSettingsFile(settings: MssqlSettings) {
    await ensureSettingsDir();
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function loadEnvSettings(): Partial<MssqlSettings> {
    const envQuery = process.env.MSSQL_ATTENDANCE_QUERY;
    return {
        server: process.env.MSSQL_SERVER || process.env.SQL_SERVER || "",
        database: process.env.MSSQL_DATABASE || process.env.SQL_DATABASE || "",
        user: process.env.MSSQL_USER || process.env.SQL_USER || "",
        password: process.env.MSSQL_PASSWORD || process.env.SQL_PASSWORD || "",
        attendanceQuery: envQuery && envQuery.trim().length > 0 ? envQuery : undefined,
        reports: undefined,
        encrypt: envFlag(process.env.MSSQL_ENCRYPT, true),
        trustServerCertificate: envFlag(process.env.MSSQL_TRUST_SERVER_CERT, true),
    };
}

export async function loadMssqlSettings(): Promise<MssqlSettings | null> {
    const fileSettings = await readSettingsFile();
    const env = loadEnvSettings();
    const fallbackQuery = env.attendanceQuery || fileSettings?.attendanceQuery || DEFAULT_ATTENDANCE_QUERY;
    const reports = normalizeReports(env.reports ?? fileSettings?.reports, fallbackQuery);
    const merged: MssqlSettings = {
        server: env.server || fileSettings?.server || "",
        database: env.database || fileSettings?.database || "",
        user: env.user || fileSettings?.user || "",
        password: env.password || fileSettings?.password || "",
        attendanceQuery: reports[0]?.query || DEFAULT_ATTENDANCE_QUERY,
        reports,
        encrypt: env.encrypt ?? fileSettings?.encrypt ?? true,
        trustServerCertificate: env.trustServerCertificate ?? fileSettings?.trustServerCertificate ?? true,
    };

    if (!merged.server || !merged.database || !merged.user || !merged.password) {
        return null;
    }
    return merged;
}

export type PublicSettings = {
    server: string;
    database: string;
    user: string;
    attendanceQuery: string;
    reports: AttendanceReport[];
    encrypt: boolean;
    trustServerCertificate: boolean;
    hasPassword: boolean;
    source: "file" | "env" | "mixed";
};

export async function getPublicSettings(): Promise<PublicSettings | null> {
    const fileSettings = await readSettingsFile();
    const env = loadEnvSettings();
    const hasEnvPassword = !!env.password;
    const fallbackQuery = env.attendanceQuery || fileSettings?.attendanceQuery || DEFAULT_ATTENDANCE_QUERY;
    const reports = normalizeReports(env.reports ?? fileSettings?.reports, fallbackQuery);
    const merged: PublicSettings = {
        server: env.server || fileSettings?.server || "",
        database: env.database || fileSettings?.database || "",
        user: env.user || fileSettings?.user || "",
        attendanceQuery: reports[0]?.query || DEFAULT_ATTENDANCE_QUERY,
        reports,
        encrypt: env.encrypt ?? fileSettings?.encrypt ?? true,
        trustServerCertificate: env.trustServerCertificate ?? fileSettings?.trustServerCertificate ?? true,
        hasPassword: hasEnvPassword || !!fileSettings?.password,
        source: resolveSource(env, fileSettings),
    };

    if (!merged.server && !merged.database && !merged.user && !merged.hasPassword) {
        return null;
    }
    return merged;
}

export async function saveMssqlSettings(input: {
    server?: string;
    database?: string;
    user?: string;
    password?: string;
    attendanceQuery?: string;
    reports?: AttendanceReport[];
    encrypt?: boolean;
    trustServerCertificate?: boolean;
}) {
    const current = await readSettingsFile();
    const fallbackQuery = input.attendanceQuery ?? current?.attendanceQuery ?? DEFAULT_ATTENDANCE_QUERY;
    const reports = normalizeReports(input.reports ?? current?.reports, fallbackQuery);
    const next: MssqlSettings = {
        server: (input.server ?? current?.server ?? "").trim(),
        database: (input.database ?? current?.database ?? "").trim(),
        user: (input.user ?? current?.user ?? "").trim(),
        password: input.password !== undefined ? input.password : current?.password ?? "",
        attendanceQuery: reports[0]?.query || DEFAULT_ATTENDANCE_QUERY,
        reports,
        encrypt: input.encrypt ?? current?.encrypt ?? true,
        trustServerCertificate: input.trustServerCertificate ?? current?.trustServerCertificate ?? true,
    };
    await writeSettingsFile(next);
    return next;
}

function envFlag(value: string | undefined, fallback: boolean) {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function resolveSource(env: Partial<MssqlSettings>, file: MssqlSettings | null): PublicSettings["source"] {
    const fromEnv = !!(env.server || env.database || env.user || env.password);
    const fromFile = !!file;
    if (fromEnv && fromFile) return "mixed";
    if (fromEnv) return "env";
    if (fromFile) return "file";
    return "file";
}

export type AttendanceReport = {
    id: string;
    name: string;
    query: string;
};

function normalizeReports(input: AttendanceReport[] | undefined | null, fallbackQuery?: string): AttendanceReport[] {
    const cleaned = (input ?? [])
        .map((r, idx) => ({
            id: (r.id ?? "").trim() || r.name?.trim().toLowerCase().replace(/\s+/g, "-") || `report-${idx + 1}`,
            name: (r.name ?? "").trim() || `Report ${idx + 1}`,
            query: (r.query ?? "").trim(),
        }))
        .filter((r) => r.query.length > 0);

    const seen = new Set<string>();
    const unique: AttendanceReport[] = [];
    for (const report of cleaned) {
        let id = report.id || DEFAULT_REPORT_ID;
        let suffix = 1;
        while (seen.has(id)) {
            id = `${report.id || DEFAULT_REPORT_ID}-${suffix++}`;
        }
        seen.add(id);
        unique.push({ ...report, id });
    }

    if (unique.length > 0) {
        return unique;
    }

    if (fallbackQuery && fallbackQuery.trim().length > 0) {
        return [
            {
                id: DEFAULT_REPORT_ID,
                name: "Attendance",
                query: fallbackQuery.trim(),
            },
        ];
    }

    return [
        {
            id: DEFAULT_REPORT_ID,
            name: "Attendance",
            query: DEFAULT_ATTENDANCE_QUERY,
        },
    ];
}
