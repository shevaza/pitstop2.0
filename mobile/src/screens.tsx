import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useAuth } from "./auth";
import { theme } from "./theme";
import { AppModuleKey, AssetRecord, AttendanceResponse, Metrics, UserRecord } from "./types";
import { csvEscape, displayValue, formatDate, normalizeText } from "./utils";
import {
  AppButton,
  Badge,
  Card,
  EmptyBlock,
  Field,
  InlineLabel,
  LoadingBlock,
  Screen,
  SectionTitle,
  AppInput,
} from "./ui";

export type RootStackParamList = {
  AppDrawer: undefined;
  UserDetail: { id: string };
  AssetDetail: { id: string };
};

function MessageCard({ label, tone }: { label: string; tone: "danger" | "success" }) {
  return (
    <Card>
      <Badge label={tone === "danger" ? "Error" : "Success"} tone={tone} />
      <Text style={[styles.metaText, { marginTop: 10 }]}>{label}</Text>
    </Card>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <Text style={styles.metaText}>{title}</Text>
      <Text style={styles.bigNumber}>{value}</Text>
    </Card>
  );
}

export function LoginScreen() {
  const { signIn } = useAuth();

  return (
    <Screen title="PitStop 2.0" subtitle="Use your Microsoft 365 account to continue from Expo Go." scroll={false}>
      <Card style={{ marginTop: 12 }}>
        <Text style={styles.heroText}>
          This mobile workspace keeps the current modules and API workflows, while delegating the server-side work to the existing backend.
        </Text>
        <AppButton label="Continue with Microsoft" variant="primary" onPress={() => void signIn()} style={{ marginTop: 16 }} />
      </Card>
    </Screen>
  );
}

export function DashboardScreen() {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiFetch("/api/metrics");
        if (!response.ok) throw new Error((await response.text()) || "Failed to load metrics");
        setData((await response.json()) as Metrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [apiFetch]);

  return (
    <Screen title="Dashboard" subtitle="Metrics and recent activity preserved from the current dashboard.">
      {loading ? <LoadingBlock label="Loading metrics..." /> : null}
      {error ? <MessageCard label={error} tone="danger" /> : null}
      {data ? (
        <>
          <View style={styles.grid}>
            <StatCard title="Employees" value={data.totals.employees} />
            <StatCard title="Active" value={data.totals.active} />
            <StatCard title="Disabled" value={data.totals.disabled} />
            <StatCard title="Guests" value={data.totals.guests} />
          </View>

          <Card>
            <SectionTitle>Top Departments</SectionTitle>
            {data.departments.slice(0, 10).map((department) => (
              <View key={department.name} style={styles.departmentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{department.name}</Text>
                  <Text style={styles.metaText}>
                    Active {department.active} | Disabled {department.disabled}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(8, Math.min(100, (department.count / Math.max(data.totals.employees, 1)) * 100))}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.itemTitle}>{department.count}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <SectionTitle>Recent Bulk Runs</SectionTitle>
            {data.recentRuns.length ? (
              data.recentRuns.map((run) => (
                <View key={run.id} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{formatDate(run.createdAt)}</Text>
                    <Text style={styles.metaText}>
                      {run.actorUpn} | total {run.total} | changed {run.changed} | failed {run.failed}
                    </Text>
                  </View>
                  <Badge label={run.dryRun ? "DRY RUN" : "APPLIED"} tone={run.dryRun ? "warning" : "success"} />
                </View>
              ))
            ) : (
              <Text style={styles.metaText}>No recent runs</Text>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function UsersScreen({ navigation }: any) {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const load = useCallback(async (reset = true, cursor?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ top: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (cursor) params.set("skiptoken", cursor);
      const response = await apiFetch(`/api/users?${params.toString()}`);
      if (!response.ok) throw new Error((await response.text()) || "Failed to load users");
      const json = await response.json();
      const incoming = Array.isArray(json.items) ? (json.items as UserRecord[]) : [];
      const next = json.nextLink ? new URL(json.nextLink).searchParams.get("$skiptoken") : null;
      setItems((current) => (reset ? incoming : [...current, ...incoming]));
      setNextToken(next);
    } catch (error) {
      Alert.alert("Users", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search]);

  useEffect(() => {
    void load(true);
  }, [load]);

  const filtered = useMemo(() => {
    const term = normalizeText(filter);
    return items.filter((user) => {
      const matchesText =
        !term ||
        normalizeText(user.displayName).includes(term) ||
        normalizeText(user.userPrincipalName).includes(term) ||
        normalizeText(user.jobTitle).includes(term) ||
        normalizeText(user.department).includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" ? user.accountEnabled : !user.accountEnabled);
      return matchesText && matchesStatus;
    });
  }, [filter, items, statusFilter]);

  const shareUsers = async () => {
    const csv = [
      ["Name", "UPN", "Title", "Department", "Office", "Status"].join(","),
      ...filtered.map((user) =>
        [
          csvEscape(user.displayName || `${user.givenName ?? ""} ${user.surname ?? ""}`.trim() || "(no name)"),
          csvEscape(user.userPrincipalName),
          csvEscape(user.jobTitle ?? ""),
          csvEscape(user.department ?? ""),
          csvEscape(user.officeLocation ?? ""),
          csvEscape(user.accountEnabled ? "Enabled" : "Disabled"),
        ].join(","),
      ),
    ].join("\n");

    const fileUri = `${FileSystem.cacheDirectory}users.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csv);
    await Sharing.shareAsync(fileUri);
  };

  return (
    <Screen title="Users" subtitle="Directory search, filtering, and drill-in editing." right={<AppButton label="Refresh" onPress={() => void load(true)} disabled={loading} />}>
      <Card>
        <Field label="Directory search">
          <AppInput value={search} onChangeText={setSearch} placeholder="Search display name or exact UPN" />
        </Field>
        <View style={styles.row}>
          <AppButton label={loading ? "Loading..." : "Search"} onPress={() => void load(true)} variant="primary" style={{ flex: 1 }} />
          <AppButton label="Share CSV" onPress={() => void shareUsers()} style={{ flex: 1 }} />
        </View>
        <Field label="Filter loaded results">
          <AppInput value={filter} onChangeText={setFilter} placeholder="Filter by title, department, or name" />
        </Field>
        <Field label="Status">
          <Picker selectedValue={statusFilter} style={styles.picker} dropdownIconColor={theme.colors.text} onValueChange={(value) => setStatusFilter(value)}>
            <Picker.Item label="All" value="all" />
            <Picker.Item label="Enabled" value="enabled" />
            <Picker.Item label="Disabled" value="disabled" />
          </Picker>
        </Field>
      </Card>

      {filtered.length ? filtered.map((user) => (
        <Pressable key={user.id} onPress={() => navigation.navigate("UserDetail", { id: user.id })}>
          <Card>
            <View style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{user.displayName || user.userPrincipalName}</Text>
                <Text style={styles.metaText}>{user.userPrincipalName}</Text>
                <Text style={styles.metaText}>
                  {displayValue(user.jobTitle, "-")} | {displayValue(user.department, "-")}
                </Text>
              </View>
              <Badge label={user.accountEnabled ? "Enabled" : "Disabled"} tone={user.accountEnabled ? "success" : "danger"} />
            </View>
          </Card>
        </Pressable>
      )) : loading ? <LoadingBlock label="Loading users..." /> : <EmptyBlock label="No users match the current filters." />}

      <AppButton label={loading ? "Loading..." : nextToken ? "Load more" : "No more users"} onPress={() => void load(false, nextToken)} disabled={!nextToken || loading} />
    </Screen>
  );
}

export function UserDetailScreen({ route }: any) {
  const { apiFetch } = useAuth();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [manager, setManager] = useState<{ userPrincipalName?: string; displayName?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/users/${encodeURIComponent(route.params.id)}`);
    if (!response.ok) throw new Error((await response.text()) || "Failed to load user");
    const json = await response.json();
    const nextUser = json.user as UserRecord;
    setUser(nextUser);
    setManager(json.manager ?? null);
    setForm({
      displayName: nextUser.displayName ?? "",
      givenName: nextUser.givenName ?? "",
      surname: nextUser.surname ?? "",
      jobTitle: nextUser.jobTitle ?? "",
      department: nextUser.department ?? "",
      officeLocation: nextUser.officeLocation ?? "",
      mobilePhone: nextUser.mobilePhone ?? "",
      employeeId: nextUser.employeeId ?? "",
      employeeType: nextUser.employeeType ?? "",
      usageLocation: nextUser.usageLocation ?? "",
      managerUPN: json.manager?.userPrincipalName ?? "",
    });
  }, [apiFetch, route.params.id]);

  useEffect(() => {
    void load().catch((error) => Alert.alert("User", error instanceof Error ? error.message : "Unknown error"));
  }, [load]);

  const toggleAccount = async () => {
    if (!user) return;
    const response = await apiFetch(`/api/users/${encodeURIComponent(route.params.id)}/account`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountEnabled: !user.accountEnabled }),
    });
    if (!response.ok) {
      Alert.alert("Account", (await response.text()) || "Failed to update account state");
      return;
    }
    await load();
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(route.params.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error((await response.text()) || "Failed to save user");
      await load();
      Alert.alert("User", "Changes saved");
    } catch (error) {
      Alert.alert("User", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <Screen title="User" subtitle="Loading user details...">
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen title={user.displayName || user.userPrincipalName} subtitle={user.userPrincipalName} right={<Badge label={user.accountEnabled ? "Enabled" : "Disabled"} tone={user.accountEnabled ? "success" : "danger"} />}>
      <Card>
        <View style={styles.row}>
          <AppButton label={user.accountEnabled ? "Disable account" : "Enable account"} onPress={() => void toggleAccount()} variant={user.accountEnabled ? "danger" : "success"} style={{ flex: 1 }} />
          <AppButton label={saving ? "Saving..." : "Save"} onPress={() => void save()} variant="primary" disabled={saving} style={{ flex: 1 }} />
        </View>
      </Card>

      {[
        ["displayName", "Display Name"],
        ["givenName", "Given Name"],
        ["surname", "Surname"],
        ["jobTitle", "Job Title"],
        ["department", "Department"],
        ["officeLocation", "Office Location"],
        ["mobilePhone", "Mobile Phone"],
        ["employeeId", "Employee ID"],
        ["employeeType", "Employee Type"],
        ["usageLocation", "Usage Location"],
        ["managerUPN", "Manager UPN"],
      ].map(([key, label]) => (
        <Card key={key}>
          <Field label={label}>
            <AppInput value={form[key] ?? ""} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} />
          </Field>
        </Card>
      ))}

      <Card>
        <SectionTitle>Current Manager</SectionTitle>
        <Text style={styles.metaText}>
          {manager?.displayName ? `${manager.displayName} (${manager.userPrincipalName})` : manager?.userPrincipalName || "No manager assigned"}
        </Text>
      </Card>
    </Screen>
  );
}

export function BulkScreen() {
  const { apiFetch } = useAuth();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preflight, setPreflight] = useState<any | null>(null);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [canary, setCanary] = useState("5");
  const [loading, setLoading] = useState(false);

  const selectCsv = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const content = await FileSystem.readAsStringAsync(asset.uri);
    const parsed = Papa.parse<Record<string, unknown>>(content, { header: true, skipEmptyLines: true });
    setRows(parsed.data);
    setPreflight(null);
    setApplyResult(null);
  };

  const shareTemplate = async () => {
    const response = await apiFetch("/api/template");
    if (!response.ok) {
      Alert.alert("Bulk", (await response.text()) || "Failed to download template");
      return;
    }
    const csv = await response.text();
    const uri = `${FileSystem.cacheDirectory}m365-bulk-template.csv`;
    await FileSystem.writeAsStringAsync(uri, csv);
    await Sharing.shareAsync(uri);
  };

  const runPreflight = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Preflight failed");
      setPreflight(await response.json());
      setApplyResult(null);
    } catch (error) {
      Alert.alert("Bulk", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          canary: Number(canary || "0"),
          items: preflight?.items ?? [],
        }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Apply failed");
      setApplyResult(await response.json());
    } catch (error) {
      Alert.alert("Bulk", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Bulk Updater" subtitle="Upload a CSV, validate it against Graph, then apply it with dry-run and canary controls.">
      <Card>
        <View style={styles.row}>
          <AppButton label="Select CSV" onPress={() => void selectCsv()} variant="primary" style={{ flex: 1 }} />
          <AppButton label="Share template" onPress={() => void shareTemplate()} style={{ flex: 1 }} />
        </View>
        <Text style={[styles.metaText, { marginTop: 12 }]}>Loaded rows: {rows.length}</Text>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <InlineLabel>Dry run</InlineLabel>
          <Switch value={dryRun} onValueChange={setDryRun} />
        </View>
        <Field label="Canary">
          <AppInput value={canary} onChangeText={setCanary} keyboardType="numeric" />
        </Field>
        <AppButton label={loading ? "Working..." : "Run preflight"} onPress={() => void runPreflight()} disabled={!rows.length || loading} variant="primary" />
      </Card>

      {preflight ? (
        <Card>
          <SectionTitle>Preflight Summary</SectionTitle>
          <Text style={styles.metaText}>
            Rows {preflight.summary.rows} | Will change {preflight.summary.willChange} | Errors {preflight.summary.errors}
          </Text>
          <AppButton label={loading ? "Working..." : "Apply"} onPress={() => void runApply()} disabled={loading} variant="success" style={{ marginTop: 12 }} />
          {(preflight.items ?? []).slice(0, 20).map((item: any, index: number) => (
            <View key={`${item.upn}-${index}`} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.upn}</Text>
                <Text style={styles.metaText}>
                  {(item.changes ?? []).map((change: any) => change.field).join(", ") || "No changes"}
                </Text>
              </View>
              <Badge label={(item.errors ?? []).length ? "Error" : "Ready"} tone={(item.errors ?? []).length ? "danger" : "success"} />
            </View>
          ))}
        </Card>
      ) : null}

      {applyResult ? (
        <Card>
          <SectionTitle>Apply Result</SectionTitle>
          <Text style={styles.metaText}>
            Changed {applyResult.summary.changed} | Failed {applyResult.summary.failed}
          </Text>
          {(applyResult.results ?? []).slice(0, 20).map((result: any, index: number) => (
            <View key={`${result.upn}-${index}`} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{result.upn}</Text>
                <Text style={styles.metaText}>
                  {(result.details?.ops ?? []).map((op: any) => op.type).join(", ") || result.details?.error || "No changes"}
                </Text>
              </View>
              <Badge label={result.status} tone={result.status === "error" ? "danger" : "success"} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

export function OrgChartScreen() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiFetch("/api/orgchart");
        if (!response.ok) throw new Error((await response.text()) || "Failed to load org chart");
        const json = await response.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      } catch (error) {
        Alert.alert("Org Chart", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [apiFetch]);

  const roots = useMemo(() => {
    const map = new Map<string, any>();
    items.forEach((item) => map.set(item.id, { ...item, children: [] as any[] }));
    const baseRoots: any[] = [];
    items.forEach((item) => {
      const node = map.get(item.id);
      if (item.managerId && map.has(item.managerId)) map.get(item.managerId).children.push(node);
      else baseRoots.push(node);
    });

    const term = normalizeText(filter);
    if (!term) return baseRoots;

    const includeNode = (node: any): any | null => {
      const children = node.children.map(includeNode).filter(Boolean);
      const matches =
        normalizeText(node.displayName).includes(term) ||
        normalizeText(node.jobTitle).includes(term) ||
        normalizeText(node.department).includes(term);
      return matches || children.length ? { ...node, children } : null;
    };

    return baseRoots.map(includeNode).filter(Boolean);
  }, [filter, items]);

  return (
    <Screen title="Org Chart" subtitle="Hierarchy adapted into expandable mobile cards.">
      <Card>
        <Field label="Filter">
          <AppInput value={filter} onChangeText={setFilter} placeholder="Filter by name, title, or department" />
        </Field>
      </Card>
      {loading ? <LoadingBlock label="Loading org chart..." /> : null}
      {roots.map((root) => (
        <OrgNode key={root.id} node={root} depth={0} />
      ))}
      {!loading && !roots.length ? <EmptyBlock label="No org chart data available." /> : null}
    </Screen>
  );
}

function OrgNode({ node, depth }: { node: any; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <View style={{ marginLeft: depth * 12 }}>
      <Pressable onPress={() => setOpen((current) => !current)}>
        <Card>
          <View style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{node.displayName}</Text>
              <Text style={styles.metaText}>
                {displayValue(node.jobTitle, "-")} | {displayValue(node.department, "-")}
              </Text>
              <Text style={styles.metaText}>{node.upn}</Text>
            </View>
            <Badge label={node.children.length ? (open ? "Collapse" : "Expand") : "Leaf"} tone="info" />
          </View>
        </Card>
      </Pressable>
      {open ? node.children.map((child: any) => <OrgNode key={child.id} node={child} depth={depth + 1} />) : null}
    </View>
  );
}

export function HrScreen() {
  const leaveBalances = [
    ["Annual Leave", 14, "success"],
    ["Sick Leave", 6, "warning"],
    ["Personal Leave", 3, "info"],
  ] as const;

  return (
    <Screen title="HR" subtitle="Current HR placeholder data preserved in a mobile layout.">
      <View style={styles.grid}>
        {leaveBalances.map(([label, value, tone]) => (
          <Card key={label} style={{ flex: 1 }}>
            <Text style={styles.metaText}>{label}</Text>
            <Text style={styles.bigNumber}>{value}</Text>
            <Badge label="days left" tone={tone as any} />
          </Card>
        ))}
      </View>

      <Card>
        <SectionTitle>Upcoming Holidays</SectionTitle>
        {[
          ["Spring Holiday", "2026-04-10", "Company-wide"],
          ["Founders Day", "2026-04-21", "Lebanon Office"],
          ["Labor Day", "2026-05-01", "Company-wide"],
        ].map(([name, date, scope]) => (
          <View key={name} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{name}</Text>
              <Text style={styles.metaText}>{date}</Text>
            </View>
            <Badge label={scope} tone="info" />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

export function AttendanceScreen() {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("200");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reportId, setReportId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextReportId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: limit || "200" });
      if (nextReportId || reportId) params.set("reportId", nextReportId || reportId);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);

      const response = await apiFetch(`/api/attendance?${params.toString()}`);
      if (!response.ok) throw new Error((await response.text()) || "Failed to load attendance");
      const json = (await response.json()) as AttendanceResponse;
      setData(json);
      setReportId(json.report?.id ?? nextReportId ?? "");
    } catch (error) {
      Alert.alert("Attendance", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, fromDate, limit, reportId, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!search.trim()) return data?.rows ?? [];
    const term = search.toLowerCase();
    return (data?.rows ?? []).filter((row) => (data?.columns ?? []).some((column) => String(row[column] ?? "").toLowerCase().includes(term)));
  }, [data, search]);

  return (
    <Screen title="Attendance" subtitle="Live MSSQL report execution with report selection and filters.">
      <Card>
        <Field label="Report">
          <Picker selectedValue={reportId} style={styles.picker} dropdownIconColor={theme.colors.text} onValueChange={(value) => { setReportId(value); void load(value); }}>
            {(data?.availableReports ?? []).map((report) => (
              <Picker.Item key={report.id} label={report.name} value={report.id} />
            ))}
          </Picker>
        </Field>
        <Field label="From date">
          <AppInput value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" />
        </Field>
        <Field label="To date">
          <AppInput value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" />
        </Field>
        <Field label="Limit">
          <AppInput value={limit} onChangeText={setLimit} keyboardType="numeric" />
        </Field>
        <AppButton label={loading ? "Refreshing..." : "Refresh"} onPress={() => void load()} variant="primary" />
      </Card>

      <Card>
        <Text style={styles.metaText}>Source {data?.source || "Not connected"} | Updated {formatDate(data?.fetchedAt)}</Text>
        <Field label="Search rows">
          <AppInput value={search} onChangeText={setSearch} placeholder="Search attendance rows" />
        </Field>
      </Card>

      {rows.length ? rows.slice(0, 100).map((row, index) => (
        <Card key={index}>
          {(data?.columns ?? []).map((column) => (
            <View key={column} style={styles.rowBetween}>
              <InlineLabel>{column}</InlineLabel>
              <Text style={[styles.metaText, { flex: 1, textAlign: "right", marginLeft: 12 }]}>{String(row[column] ?? "-")}</Text>
            </View>
          ))}
        </Card>
      )) : loading ? <LoadingBlock label="Loading attendance..." /> : <EmptyBlock label="No attendance rows found." />}
    </Screen>
  );
}

export function AssetsScreen({ navigation }: any) {
  const { apiFetch } = useAuth();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserRecord[]>([]);
  const [form, setForm] = useState({
    assetTag: "",
    name: "",
    assetGroup: "",
    assetType: "",
    status: "active",
    serialNumber: "",
    manufacturer: "",
    model: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/assets");
      if (!response.ok) throw new Error((await response.text()) || "Failed to load assets");
      const json = await response.json();
      setAssets(Array.isArray(json.items) ? json.items : []);
    } catch (error) {
      Alert.alert("Assets", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formOpen || !userSearch.trim()) {
      setUserResults(selectedUser ? [selectedUser] : []);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/assets/users?search=${encodeURIComponent(userSearch.trim())}`);
        if (!response.ok) throw new Error((await response.text()) || "Failed to search users");
        const json = await response.json();
        setUserResults(Array.isArray(json.items) ? json.items : []);
      } catch (error) {
        Alert.alert("Assets", error instanceof Error ? error.message : "Unknown error");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [apiFetch, formOpen, selectedUser, userSearch]);

  const filtered = useMemo(() => {
    const term = normalizeText(search);
    return assets.filter((asset) =>
      [
        asset.name,
        asset.asset_tag,
        asset.asset_group,
        asset.asset_type,
        asset.serial_number,
        asset.manufacturer,
        asset.model,
        asset.assigned_user?.display_name,
        asset.assigned_user?.user_principal_name,
      ].some((value) => normalizeText(value).includes(term)),
    );
  }, [assets, search]);

  const createAsset = async () => {
    try {
      const response = await apiFetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, assignedUser: selectedUser }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Failed to create asset");
      setFormOpen(false);
      setSelectedUser(null);
      setUserSearch("");
      setForm({
        assetTag: "",
        name: "",
        assetGroup: "",
        assetType: "",
        status: "active",
        serialNumber: "",
        manufacturer: "",
        model: "",
        notes: "",
      });
      await load();
    } catch (error) {
      Alert.alert("Assets", error instanceof Error ? error.message : "Unknown error");
    }
  };

  return (
    <Screen title="Assets" subtitle="Inventory search, assignment, and asset creation." right={<AppButton label="New" variant="primary" onPress={() => setFormOpen((current) => !current)} />}>
      <Card>
        <Field label="Search assets">
          <AppInput value={search} onChangeText={setSearch} placeholder="Search tags, names, users, serials..." />
        </Field>
        <AppButton label={loading ? "Refreshing..." : "Refresh"} onPress={() => void load()} />
      </Card>

      {formOpen ? (
        <Card>
          <SectionTitle>Create Asset</SectionTitle>
          <Field label="Asset Tag">
            <AppInput value={form.assetTag} onChangeText={(value) => setForm((current) => ({ ...current, assetTag: value }))} />
          </Field>
          <Field label="Name">
            <AppInput value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} />
          </Field>
          <Field label="Group">
            <AppInput value={form.assetGroup} onChangeText={(value) => setForm((current) => ({ ...current, assetGroup: value }))} />
          </Field>
          <Field label="Type">
            <AppInput value={form.assetType} onChangeText={(value) => setForm((current) => ({ ...current, assetType: value }))} />
          </Field>
          <Field label="Status">
            <Picker selectedValue={form.status} style={styles.picker} dropdownIconColor={theme.colors.text} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
              {["active", "in-stock", "repair", "retired"].map((status) => (
                <Picker.Item key={status} label={status} value={status} />
              ))}
            </Picker>
          </Field>
          <Field label="Serial Number">
            <AppInput value={form.serialNumber} onChangeText={(value) => setForm((current) => ({ ...current, serialNumber: value }))} />
          </Field>
          <Field label="Manufacturer">
            <AppInput value={form.manufacturer} onChangeText={(value) => setForm((current) => ({ ...current, manufacturer: value }))} />
          </Field>
          <Field label="Model">
            <AppInput value={form.model} onChangeText={(value) => setForm((current) => ({ ...current, model: value }))} />
          </Field>
          <Field label="Assign To User">
            <AppInput value={userSearch} onChangeText={setUserSearch} placeholder="Search by name or UPN" />
          </Field>
          {userResults.map((user) => (
            <Pressable key={user.id} onPress={() => { setSelectedUser(user); setUserSearch(user.displayName || user.userPrincipalName); setUserResults([user]); }}>
              <View style={styles.userLookupRow}>
                <Text style={styles.itemTitle}>{user.displayName || user.userPrincipalName}</Text>
                <Text style={styles.metaText}>{user.userPrincipalName}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={styles.metaText}>Selected: {selectedUser ? `${selectedUser.displayName || selectedUser.userPrincipalName}` : "Unassigned"}</Text>
          <Field label="Notes">
            <AppInput value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} multiline />
          </Field>
          <AppButton label="Create Asset" onPress={() => void createAsset()} variant="primary" />
        </Card>
      ) : null}

      {filtered.length ? filtered.map((asset) => (
        <Pressable key={asset.id} onPress={() => navigation.navigate("AssetDetail", { id: asset.id })}>
          <Card>
            <View style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{asset.name}</Text>
                <Text style={styles.metaText}>{asset.asset_tag}</Text>
                <Text style={styles.metaText}>
                  {displayValue(asset.asset_type, "-")} | {displayValue(asset.assigned_user?.display_name || asset.assigned_user?.user_principal_name, "Unassigned")}
                </Text>
              </View>
              <Badge label={asset.status} tone="info" />
            </View>
          </Card>
        </Pressable>
      )) : loading ? <LoadingBlock label="Loading assets..." /> : <EmptyBlock label="No assets found." />}
    </Screen>
  );
}

export function AssetDetailScreen({ route, navigation }: any) {
  const { apiFetch } = useAuth();
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [form, setForm] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserRecord[]>([]);

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/assets/${encodeURIComponent(route.params.id)}`);
    if (!response.ok) throw new Error((await response.text()) || "Failed to load asset");
    const json = await response.json();
    const nextAsset = json.asset as AssetRecord;
    setAsset(nextAsset);
    setForm({
      assetTag: nextAsset.asset_tag,
      name: nextAsset.name,
      assetGroup: nextAsset.asset_group ?? "",
      assetType: nextAsset.asset_type,
      status: nextAsset.status,
      serialNumber: nextAsset.serial_number ?? "",
      manufacturer: nextAsset.manufacturer ?? "",
      model: nextAsset.model ?? "",
      notes: nextAsset.notes ?? "",
    });
    const assigned = nextAsset.assigned_user ? {
      id: nextAsset.assigned_user.azure_user_id || nextAsset.assigned_user.id || nextAsset.assigned_user.user_principal_name,
      userPrincipalName: nextAsset.assigned_user.user_principal_name,
      displayName: nextAsset.assigned_user.display_name ?? undefined,
      jobTitle: nextAsset.assigned_user.job_title ?? undefined,
      department: nextAsset.assigned_user.department ?? undefined,
    } : null;
    setSelectedUser(assigned);
    setUserSearch(assigned?.displayName || assigned?.userPrincipalName || "");
  }, [apiFetch, route.params.id]);

  useEffect(() => {
    void load().catch((error) => Alert.alert("Asset", error instanceof Error ? error.message : "Unknown error"));
  }, [load]);

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults(selectedUser ? [selectedUser] : []);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/assets/users?search=${encodeURIComponent(userSearch.trim())}`);
        if (!response.ok) throw new Error((await response.text()) || "Failed to search users");
        const json = await response.json();
        setUserResults(Array.isArray(json.items) ? json.items : []);
      } catch (error) {
        Alert.alert("Asset", error instanceof Error ? error.message : "Unknown error");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [apiFetch, selectedUser, userSearch]);

  const save = async () => {
    const response = await apiFetch(`/api/assets/${encodeURIComponent(route.params.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, assignedUser: selectedUser }),
    });
    if (!response.ok) {
      Alert.alert("Asset", (await response.text()) || "Failed to save asset");
      return;
    }
    await load();
    Alert.alert("Asset", "Changes saved");
  };

  const remove = async () => {
    const response = await apiFetch(`/api/assets/${encodeURIComponent(route.params.id)}`, { method: "DELETE" });
    if (!response.ok) {
      Alert.alert("Asset", (await response.text()) || "Failed to delete asset");
      return;
    }
    navigation.goBack();
  };

  if (!asset || !form) {
    return (
      <Screen title="Asset" subtitle="Loading asset details...">
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen title={asset.name} subtitle={`${asset.asset_tag} | Created ${formatDate(asset.created_at)}`}>
      <Card>
        <View style={styles.row}>
          <AppButton label="Save Changes" onPress={() => void save()} variant="primary" style={{ flex: 1 }} />
          <AppButton label="Delete Asset" onPress={() => void remove()} variant="danger" style={{ flex: 1 }} />
        </View>
      </Card>

      {[
        ["assetTag", "Asset Tag"],
        ["name", "Name"],
        ["assetGroup", "Group"],
        ["assetType", "Type"],
        ["serialNumber", "Serial Number"],
        ["manufacturer", "Manufacturer"],
        ["model", "Model"],
      ].map(([key, label]) => (
        <Card key={key}>
          <Field label={label}>
            <AppInput value={form[key] ?? ""} onChangeText={(value) => setForm((current: any) => ({ ...current, [key]: value }))} />
          </Field>
        </Card>
      ))}

      <Card>
        <Field label="Status">
          <Picker selectedValue={form.status} style={styles.picker} dropdownIconColor={theme.colors.text} onValueChange={(value) => setForm((current: any) => ({ ...current, status: value }))}>
            {["active", "in-stock", "repair", "retired"].map((status) => (
              <Picker.Item key={status} label={status} value={status} />
            ))}
          </Picker>
        </Field>
      </Card>

      <Card>
        <Field label="Assign To User">
          <AppInput value={userSearch} onChangeText={setUserSearch} placeholder="Search by name or UPN" />
        </Field>
        {userResults.map((user) => (
          <Pressable key={user.id} onPress={() => { setSelectedUser(user); setUserSearch(user.displayName || user.userPrincipalName); setUserResults([user]); }}>
            <View style={styles.userLookupRow}>
              <Text style={styles.itemTitle}>{user.displayName || user.userPrincipalName}</Text>
              <Text style={styles.metaText}>{user.userPrincipalName}</Text>
            </View>
          </Pressable>
        ))}
        <Text style={styles.metaText}>Selected: {selectedUser ? selectedUser.displayName || selectedUser.userPrincipalName : "Unassigned"}</Text>
      </Card>

      <Card>
        <Field label="Notes">
          <AppInput value={form.notes ?? ""} onChangeText={(value) => setForm((current: any) => ({ ...current, notes: value }))} multiline />
        </Field>
      </Card>
    </Screen>
  );
}

export function UserAccessScreen() {
  const { apiFetch } = useAuth();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [access, setAccess] = useState<Record<AppModuleKey, boolean>>({
    dashboard: false,
    users: false,
    bulk: false,
    orgchart: false,
    hr: false,
    attendance: false,
    assets: false,
    "user-access": false,
    settings: false,
  });

  useEffect(() => {
    if (!search.trim()) {
      setUsers(selectedUser ? [selectedUser] : []);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ top: "50", search: search.trim() });
        const response = await apiFetch(`/api/user-access/users?${params.toString()}`);
        if (!response.ok) throw new Error((await response.text()) || "Failed to search users");
        const json = await response.json();
        setUsers(Array.isArray(json.items) ? json.items : []);
      } catch (error) {
        Alert.alert("User Access", error instanceof Error ? error.message : "Unknown error");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [apiFetch, search, selectedUser]);

  const loadAccess = async (user: UserRecord) => {
    const response = await apiFetch(`/api/user-access?userPrincipalName=${encodeURIComponent(user.userPrincipalName)}`);
    if (!response.ok) {
      Alert.alert("User Access", (await response.text()) || "Failed to load access");
      return;
    }
    const json = await response.json();
    setAccess(json.access ?? access);
  };

  const save = async () => {
    if (!selectedUser) return;
    const response = await apiFetch("/api/user-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPrincipalName: selectedUser.userPrincipalName,
        displayName: selectedUser.displayName,
        access,
      }),
    });
    if (!response.ok) {
      Alert.alert("User Access", (await response.text()) || "Failed to save access");
      return;
    }
    Alert.alert("User Access", "User access saved");
  };

  return (
    <Screen title="User Access" subtitle="Search a user and update the module matrix from mobile.">
      <Card>
        <Field label="Search users">
          <AppInput value={search} onChangeText={setSearch} placeholder="Search by name or exact UPN" />
        </Field>
        {users.map((user) => (
          <Pressable
            key={user.id}
            onPress={() => {
              setSelectedUser(user);
              setSearch(user.displayName || user.userPrincipalName);
              void loadAccess(user);
            }}
          >
            <View style={styles.userLookupRow}>
              <Text style={styles.itemTitle}>{user.displayName || user.userPrincipalName}</Text>
              <Text style={styles.metaText}>{user.userPrincipalName}</Text>
            </View>
          </Pressable>
        ))}
      </Card>

      {selectedUser ? (
        <Card>
          <SectionTitle>{selectedUser.displayName || selectedUser.userPrincipalName}</SectionTitle>
          {(Object.keys(access) as AppModuleKey[]).map((moduleKey) => (
            <View key={moduleKey} style={styles.rowBetween}>
              <Text style={styles.itemTitle}>{moduleKey}</Text>
              <Switch value={access[moduleKey]} onValueChange={(value) => setAccess((current) => ({ ...current, [moduleKey]: value }))} />
            </View>
          ))}
          <AppButton label="Save Access" onPress={() => void save()} variant="primary" style={{ marginTop: 12 }} />
        </Card>
      ) : null}
    </Screen>
  );
}

export function SettingsScreen() {
  const { apiFetch } = useAuth();
  const [state, setState] = useState({
    server: "",
    database: "",
    user: "",
    password: "",
    encrypt: true,
    trustServerCertificate: true,
    reports: [{ id: "attendance-default", name: "Attendance", query: "" }],
  });

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiFetch("/api/settings/mssql");
        if (!response.ok) throw new Error((await response.text()) || "Failed to load settings");
        const json = await response.json();
        setState({
          server: json.settings?.server ?? "",
          database: json.settings?.database ?? "",
          user: json.settings?.user ?? "",
          password: "",
          encrypt: json.settings?.encrypt ?? true,
          trustServerCertificate: json.settings?.trustServerCertificate ?? true,
          reports:
            json.settings?.reports?.length
              ? json.settings.reports
              : [{ id: "attendance-default", name: "Attendance", query: json.defaultQuery ?? "" }],
        });
      } catch (error) {
        Alert.alert("Settings", error instanceof Error ? error.message : "Unknown error");
      }
    };

    void load();
  }, [apiFetch]);

  const save = async () => {
    const response = await apiFetch("/api/settings/mssql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) {
      Alert.alert("Settings", (await response.text()) || "Failed to save settings");
      return;
    }
    Alert.alert("Settings", "MSSQL settings saved");
  };

  return (
    <Screen title="Settings" subtitle="Configure the MSSQL connection and attendance report query set.">
      <Card>
        <Field label="Server">
          <AppInput value={state.server} onChangeText={(value) => setState((current) => ({ ...current, server: value }))} />
        </Field>
        <Field label="Database">
          <AppInput value={state.database} onChangeText={(value) => setState((current) => ({ ...current, database: value }))} />
        </Field>
        <Field label="User">
          <AppInput value={state.user} onChangeText={(value) => setState((current) => ({ ...current, user: value }))} />
        </Field>
        <Field label="Password">
          <AppInput value={state.password} onChangeText={(value) => setState((current) => ({ ...current, password: value }))} secureTextEntry />
        </Field>
        <View style={styles.rowBetween}>
          <Text style={styles.itemTitle}>Encrypt</Text>
          <Switch value={state.encrypt} onValueChange={(value) => setState((current) => ({ ...current, encrypt: value }))} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.itemTitle}>Trust Server Certificate</Text>
          <Switch value={state.trustServerCertificate} onValueChange={(value) => setState((current) => ({ ...current, trustServerCertificate: value }))} />
        </View>
      </Card>

      {state.reports.map((report, index) => (
        <Card key={report.id}>
          <Field label="Report name">
            <AppInput value={report.name} onChangeText={(value) => setState((current) => ({ ...current, reports: current.reports.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: value } : entry) }))} />
          </Field>
          <Field label="Report query">
            <AppInput value={report.query} onChangeText={(value) => setState((current) => ({ ...current, reports: current.reports.map((entry, entryIndex) => entryIndex === index ? { ...entry, query: value } : entry) }))} multiline />
          </Field>
        </Card>
      ))}

      <AppButton label="Save Settings" onPress={() => void save()} variant="primary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroText: { color: "rgba(255,255,255,0.78)", lineHeight: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  itemTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
  metaText: { color: "rgba(255,255,255,0.66)", lineHeight: 20 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigNumber: { color: theme.colors.text, fontSize: 34, fontWeight: "700", marginVertical: 8 },
  departmentRow: { gap: 10, marginTop: 12 },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999, backgroundColor: "rgba(14,3,219,0.8)" },
  picker: { color: theme.colors.text, backgroundColor: theme.colors.glassStrong },
  userLookupRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)", paddingVertical: 10 },
});
