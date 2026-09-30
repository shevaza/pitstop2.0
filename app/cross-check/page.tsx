"use client";

import ModuleGuard from "@/components/ModuleGuard";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type JsonRecord = Record<string, unknown>;

type SelectOption = {
  value: string;
  label: string;
};

type ResultTable = {
  title: string;
  rows: JsonRecord[];
  columns: string[];
};

type AttendanceResponse = {
  rows: JsonRecord[];
  columns: string[];
};

type ComparisonKind = "conflict" | "missing" | "ok" | "weekend";

type ComparisonRow = JsonRecord & {
  Date: string;
  Day: string;
  Leave: string;
  Punches: number;
  Result: string;
  __kind: ComparisonKind;
};

const apiBaseUrl = "/api/cross-check";

export default function CrossCheckPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [employeeId, setEmployeeId] = useState("");
  const [users, setUsers] = useState<SelectOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [punchesLoading, setPunchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [punchesError, setPunchesError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [badgeNumber, setBadgeNumber] = useState("");
  const [punchRows, setPunchRows] = useState<JsonRecord[]>([]);
  const [punchColumns, setPunchColumns] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      setUsersLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/leave-users`, { cache: "no-store" });
        if (!res.ok) {
          const msg = (await res.text()) || `Request failed with ${res.status}`;
          throw new Error(msg);
        }
        const json = (await res.json()) as unknown;
        const options = normalizeUsers(json);
        if (!active) return;
        setUsers(options);
        setEmployeeId((current) => current || options[0]?.value || "");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load leave users");
      } finally {
        if (active) setUsersLoading(false);
      }
    };

    void loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const tables = useMemo(() => extractTables(result), [result]);
  const logsTable = useMemo(() => tables.find((table) => table.title.toLowerCase() === "logs"), [tables]);
  const nonLogTables = useMemo(
    () => tables.filter((table) => table.title.toLowerCase() !== "logs"),
    [tables],
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(logsTable?.rows ?? [], punchRows),
    [logsTable, punchRows],
  );
  const anomalyCount = comparisonRows.filter(
    (row) => row.__kind === "conflict" || row.__kind === "missing",
  ).length;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setPunchesLoading(false);
    setError(null);
    setPunchesError(null);
    setResult(null);
    setBadgeNumber("");
    setPunchRows([]);
    setPunchColumns([]);

    try {
      const params = new URLSearchParams({ year, employeeId });
      const res = await fetch(`${apiBaseUrl}/employee-leaves?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const msg = (await res.text()) || `Request failed with ${res.status}`;
        throw new Error(msg);
      }
      const json = (await res.json()) as unknown;
      setResult(json);

      const nextTables = extractTables(json);
      const nextLogsTable = nextTables.find((table) => table.title.toLowerCase() === "logs");
      if (nextLogsTable) {
        const selectedUserLabel = users.find((user) => user.value === employeeId)?.label || "";
        void loadPunches(nextLogsTable.rows, selectedUserLabel);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee leaves");
    } finally {
      setLoading(false);
    }
  };

  const loadPunches = async (logsRows: JsonRecord[], selectedUserLabel: string) => {
    setPunchesLoading(true);
    setPunchesError(null);
    setBadgeNumber("");
    setPunchRows([]);
    setPunchColumns([]);

    try {
      const badge = await resolveBadgeNumber(selectedUserLabel);
      setBadgeNumber(badge);

      const periodDates = getPeriodDates(logsRows);
      if (periodDates.length === 0) {
        throw new Error("No valid Period dates were found in Logs.");
      }

      // Avoid flooding the internal API's bounded SQL connection pool.
      const rowsByDate: JsonRecord[][] = [];
      for (const date of periodDates) {
        const params = new URLSearchParams({ fromDate: date, toDate: date, limit: "2000" });
        const res = await fetch(`/api/attendance?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const msg = (await res.text()) || `Attendance request failed with ${res.status}`;
          throw new Error(msg);
        }
        const json = (await res.json()) as AttendanceResponse;
        rowsByDate.push((json.rows ?? []).map((row) => ({ ...row, "Cross-check Date": date })));
      }

      const allRows = rowsByDate.flat();
      const matchedRows = badge ? filterRowsByBadge(allRows, badge) : allRows;
      setPunchRows(matchedRows);
      setPunchColumns(buildColumns(matchedRows));
    } catch (err) {
      setPunchesError(err instanceof Error ? err.message : "Failed to load punches");
    } finally {
      setPunchesLoading(false);
    }
  };

  return (
    <ModuleGuard moduleKey="attendance">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Data Cross Check</h1>
            <p className="text-sm text-[var(--text)]/70">
              Compare employee leave data from the external leave service.
            </p>
          </div>
          <Link
            href="/attendance"
            className="w-fit rounded-lg border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--glass-strong)] hover:text-(--text)!"
          >
            Back to Attendance
          </Link>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
          <form className="grid gap-4 md:grid-cols-[160px_minmax(240px,1fr)_auto]" onSubmit={handleSubmit}>
            <label className="space-y-1 text-sm text-[var(--text)]/80">
              <span>Year</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(event.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
              />
            </label>

            <label className="space-y-1 text-sm text-[var(--text)]/80">
              <span>Select</span>
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                disabled={usersLoading || users.length === 0}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40 disabled:opacity-60"
              >
                {usersLoading ? (
                  <option value="">Loading users...</option>
                ) : users.length === 0 ? (
                  <option value="">No users found</option>
                ) : (
                  users.map((user) => (
                    <option key={user.value} value={user.value}>
                      {user.label}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading || usersLoading || !employeeId || !year}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {loading ? "Checking..." : "Submit"}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-[color:rgba(255,255,255,0.06)] p-4 text-sm text-red-100 shadow-[var(--shadow-soft)]">
            {error}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-2">
          {tables.length > 0 ? (
            <>
              {logsTable && (
                <>
                  <div className="xl:col-span-2">
                    <ResultTableView
                      title={`Daily Comparison${punchesLoading ? " - loading punches..." : ` - ${anomalyCount} abnormalities`}`}
                      rows={comparisonRows}
                      columns={["Date", "Day", "Leave", "Punches", "Result"]}
                      loading={punchesLoading}
                      emptyMessage={punchesError || "No dates were available to compare."}
                      rowClassName={(row) => comparisonRowClass(row.__kind)}
                    />
                  </div>
                  <ResultTableView
                    title={logsTable.title}
                    rows={logsTable.rows}
                    columns={logsTable.columns}
                    rowClassName={(row) => {
                      const date = parseDateOnly(getValueByKey(row, "Period"));
                      return comparisonRowClass(
                        comparisonRows.find((item) => item.Date === date)?.__kind,
                      );
                    }}
                  />
                  <ResultTableView
                    title={badgeNumber ? `Attendance Punches - Badge ${badgeNumber}` : "Attendance Punches"}
                    rows={punchRows}
                    columns={punchColumns}
                    loading={punchesLoading}
                    emptyMessage={punchesError || "No punch rows found."}
                    rowClassName={(row) =>
                      comparisonRowClass(
                        comparisonRows.find((item) => item.Date === getPunchDate(row))?.__kind,
                      )
                    }
                  />
                </>
              )}
              {nonLogTables.map((table, index) => (
                <ResultTableView
                  key={`${table.title}-${index}`}
                  title={table.title}
                  rows={table.rows}
                  columns={table.columns}
                />
              ))}
            </>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 text-sm text-[var(--text)]/70 shadow-[var(--shadow-soft)] xl:col-span-2">
              Submit the form to load cross-check results.
            </div>
          )}
        </section>
      </div>
    </ModuleGuard>
  );
}

function ResultTableView({
  title,
  rows,
  columns,
  loading = false,
  emptyMessage = "No rows found.",
  rowClassName,
}: ResultTable & {
  loading?: boolean;
  emptyMessage?: string;
  rowClassName?: (row: JsonRecord) => string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        <p className="text-xs text-[var(--text)]/60">{rows.length} rows</p>
      </div>
      <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
        <table className="min-w-full text-sm text-[var(--text)]">
          <thead>
            <tr className="bg-[color:rgba(255,255,255,0.06)] text-left text-[var(--text)]/70">
              {columns.map((column) => (
                <th key={column} className="px-3 py-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-[var(--text)]/70" colSpan={columns.length || 1}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[var(--text)]/70" colSpan={columns.length || 1}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`border-t border-[var(--border)]/80 transition-colors hover:bg-[color:rgba(14,3,219,0.12)] ${rowClassName?.(row) ?? ""}`}
                >
                  {columns.map((column) => (
                    <td key={column} className="px-3 py-2 align-top">
                      {formatValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function resolveBadgeNumber(selectedUserLabel: string) {
  const res = await fetch(`${apiBaseUrl}/pitstop-data`, { cache: "no-store" });
  if (!res.ok) {
    const msg = (await res.text()) || `Pitstop data request failed with ${res.status}`;
    throw new Error(msg);
  }

  const json = (await res.json()) as unknown;
  const rows = findArray(json);
  const columns = getColumns(json);
  const targetName = normalizeName(stripActiveStatus(selectedUserLabel));

  for (const row of rows) {
    const fullName = getPitstopFullName(row, columns);
    if (normalizeName(stripActiveStatus(fullName)) === targetName) {
      const badge = getPitstopBadgeNumber(row, columns);
      if (badge) return badge;
    }
  }

  throw new Error(`No badge number found for ${stripActiveStatus(selectedUserLabel)}.`);
}

function buildComparisonRows(logRows: JsonRecord[], punchRows: JsonRecord[]): ComparisonRow[] {
  const logsByDate = new Map<string, JsonRecord[]>();
  for (const row of logRows) {
    const date = parseDateOnly(getValueByKey(row, "Period"));
    if (!date) continue;
    logsByDate.set(date, [...(logsByDate.get(date) ?? []), row]);
  }

  const punchesByDate = new Map<string, number>();
  for (const row of punchRows) {
    const date = getPunchDate(row);
    if (date) punchesByDate.set(date, (punchesByDate.get(date) ?? 0) + 1);
  }

  return Array.from(logsByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, rows]) => {
      const leaveLabels = rows.map(getLeaveLabel).filter(Boolean);
      const leave = Array.from(new Set(leaveLabels)).join(", ");
      const punches = punchesByDate.get(date) ?? 0;
      const dateValue = new Date(`${date}T00:00:00`);
      const day = dateValue.toLocaleDateString("en-US", { weekday: "short" });
      const isWeekend = dateValue.getDay() === 0 || dateValue.getDay() === 6;

      let kind: ComparisonKind = "ok";
      let result = "OK";
      if (leave && punches > 0) {
        kind = "conflict";
        result = "Abnormal: leave submitted but punches exist";
      } else if (!isWeekend && !leave && punches === 0) {
        kind = "missing";
        result = "Abnormal: no punches and no leave";
      } else if (isWeekend && !leave && punches === 0) {
        kind = "weekend";
        result = "Weekend";
      } else if (leave) {
        result = "Leave - no punches";
      } else {
        result = "Attendance recorded";
      }

      return {
        Date: date,
        Day: day,
        Leave: leave || "None",
        Punches: punches,
        Result: result,
        __kind: kind,
      };
    });
}

function getLeaveLabel(row: JsonRecord) {
  const leaveEntries = Object.entries(row).filter(([key]) => {
    const normalized = normalizeComparable(key);
    return (
      normalized.includes("leave") ||
      normalized.includes("vacation") ||
      normalized.includes("absence") ||
      normalized.includes("timeoff")
    );
  });

  const meaningful = leaveEntries
    .map(([, value]) => formatValue(value).trim())
    .filter((value) => !isEmptyLeaveValue(value));
  if (meaningful.length > 0) return meaningful.join(" - ");

  const knownLeaveValue = Object.values(row)
    .map((value) => formatValue(value).trim())
    .find((value) => /\b(annual leave|vacation|sick leave|personal leave|unpaid leave|time off)\b/i.test(value));
  return knownLeaveValue ?? "";
}

function isEmptyLeaveValue(value: string) {
  return /^(?:-|0|false|none|null|n\/a|no leave|working|present|available)?$/i.test(value);
}

function getPunchDate(row: JsonRecord) {
  const crossCheckDate = parseDateOnly(getValueByKey(row, "Cross-check Date"));
  if (crossCheckDate) return crossCheckDate;

  const likelyDateColumn = Object.keys(row).find((key) => {
    const normalized = normalizeComparable(key);
    return normalized.includes("date") || normalized.includes("time");
  });
  return likelyDateColumn ? parseDateOnly(row[likelyDateColumn]) : "";
}

function comparisonRowClass(kind: unknown) {
  if (kind === "conflict") {
    return "border-l-4 border-l-red-600 bg-[color:rgba(239,68,68,0.24)] text-[var(--text)] hover:bg-[color:rgba(239,68,68,0.32)]!";
  }
  if (kind === "missing") {
    return "border-l-4 border-l-amber-600 bg-[color:rgba(245,158,11,0.28)] text-[var(--text)] hover:bg-[color:rgba(245,158,11,0.36)]!";
  }
  return "";
}

function getPeriodDates(rows: JsonRecord[]) {
  const dates = new Set<string>();

  for (const row of rows) {
    const period = getValueByKey(row, "Period");
    const date = parseDateOnly(period);
    if (date) dates.add(date);
  }

  return Array.from(dates).sort();
}

function filterRowsByBadge(rows: JsonRecord[], badge: string) {
  const normalizedBadge = normalizeComparable(badge);
  if (!normalizedBadge) return rows;

  const badgeColumns = buildColumns(rows).filter((column) => {
    const normalized = normalizeComparable(column);
    return (
      normalized.includes("badge") ||
      normalized.includes("card") ||
      normalized.includes("pin") ||
      normalized.includes("employeeid") ||
      normalized.includes("employeeno") ||
      normalized.includes("empid") ||
      normalized.includes("code")
    );
  });

  const candidateColumns = badgeColumns.length > 0 ? badgeColumns : buildColumns(rows);
  return rows.filter((row) =>
    candidateColumns.some((column) => normalizeComparable(row[column]) === normalizedBadge),
  );
}

function getPitstopFullName(row: unknown, columns: string[]) {
  if (Array.isArray(row)) return formatValue(row[4]);
  if (!isRecord(row)) return "";

  return (
    firstString(row, ["Full name", "Full Name", "fullName", "full_name", "name", "Name"]) ||
    formatValue(getValueByKey(row, columns[4] || ""))
  );
}

function getPitstopBadgeNumber(row: unknown, columns: string[]) {
  if (Array.isArray(row)) {
    const badgeIndex = columns.findIndex((column) => normalizeComparable(column).includes("badge"));
    return formatValue(row[badgeIndex >= 0 ? badgeIndex : 1]);
  }

  if (!isRecord(row)) return "";

  const badge = firstString(row, [
    "badgeNumber",
    "BadgeNumber",
    "Badge Number",
    "badge_number",
    "badge",
    "Badge",
    "cardNumber",
    "Card Number",
  ]);

  return badge || formatValue(getValueByKey(row, columns[0] || ""));
}

function getColumns(json: unknown) {
  if (!isRecord(json)) return [];
  const columns = json.columns ?? json.Columns ?? json.headers ?? json.Headers;
  if (!Array.isArray(columns)) return [];
  return columns.map((column) => String(column));
}

function getValueByKey(record: JsonRecord, key: string) {
  if (!key) return undefined;
  const direct = record[key];
  if (direct !== undefined) return direct;

  const normalizedKey = normalizeComparable(key);
  const match = Object.keys(record).find((candidate) => normalizeComparable(candidate) === normalizedKey);
  return match ? record[match] : undefined;
}

function parseDateOnly(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);

  const text = String(value).trim();
  if (!text) return "";

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    return `${year}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return toDateKey(date);
}

function stripActiveStatus(value: string) {
  return value.replace(/\|\s*Active\b/gi, "").trim();
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeUsers(json: unknown): SelectOption[] {
  const list = findArray(json);
  return list
    .map((item) => {
      if (!isRecord(item)) {
        const value = String(item ?? "");
        return value ? { value, label: value } : null;
      }

      const value = firstString(item, ["employeeId", "EmployeeID", "id", "ID", "value", "userId", "UserID"]);
      if (!value) return null;

      const text = firstString(item, [
        "text",
        "Text",
        "label",
        "Label",
        "displayName",
        "name",
        "fullName",
        "employeeName",
        "EmployeeName",
      ]);
      return {
        value,
        label: text || value,
      };
    })
    .filter((option): option is SelectOption => option !== null)
    .filter((option, index, options) => options.findIndex((candidate) => candidate.value === option.value) === index);
}

function extractTables(json: unknown): ResultTable[] {
  if (!json) return [];

  const namedArrays: Array<{ title: string; value: unknown[] }> = [];

  if (Array.isArray(json)) {
    namedArrays.push({ title: "Table 1", value: json });
  } else if (isRecord(json)) {
    for (const [key, value] of Object.entries(json)) {
      if (Array.isArray(value)) {
        namedArrays.push({ title: toTitle(key), value });
      }
    }
  }

  const tables = namedArrays
    .filter(({ value }) => value.every((row) => isRecord(row)))
    .slice(0, 2)
    .map(({ title, value }, index) => {
      const rows = value.filter(isRecord);
      return {
        title: title || `Table ${index + 1}`,
        rows,
        columns: buildColumns(rows),
      };
    });

  if (tables.length === 1) {
    tables.push({
      title: "Raw Response",
      rows: [isRecord(json) ? json : { value: json }],
      columns: buildColumns([isRecord(json) ? json : { value: json }]),
    });
  }

  return tables;
}

function findArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!isRecord(json)) return [];
  for (const key of ["users", "data", "rows", "result", "items"]) {
    const value = json[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function buildColumns(rows: JsonRecord[]) {
  const columns = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => columns.add(key));
  }
  return Array.from(columns);
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }
  return "";
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTitle(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
