export const appModules = [
    { key: "dashboard", label: "Dashboard", href: "/" },
    { key: "users", label: "Users", href: "/users" },
    { key: "bulk", label: "Bulk", href: "/bulk" },
    { key: "orgchart", label: "Org Chart", href: "/orgchart" },
    { key: "hr", label: "HR", href: "/hr" },
    { key: "attendance", label: "Attendance", href: "/attendance" },
    { key: "assets", label: "Assets Management", href: "/assets" },
    { key: "it-tickets", label: "IT Tickets", href: "/it-tickets" },
    { key: "it-tickets-admin", label: "IT Tickets Admin", href: "/it-tickets/admin" },
    { key: "user-access", label: "User Access", href: "/user-access" },
    { key: "settings", label: "Settings", href: "/settings" },
] as const;

export type AppModuleKey = (typeof appModules)[number]["key"];
export type ModuleAccessLevel = "none" | "read" | "modify";

export function getDefaultModuleAccess(): Record<AppModuleKey, boolean> {
    return Object.fromEntries(appModules.map((module) => [module.key, false])) as Record<AppModuleKey, boolean>;
}

export function getDefaultModuleAccessLevels(): Record<AppModuleKey, ModuleAccessLevel> {
    return Object.fromEntries(appModules.map((module) => [module.key, "none"])) as Record<AppModuleKey, ModuleAccessLevel>;
}

export function isAppModuleKey(value: string): value is AppModuleKey {
    return appModules.some((module) => module.key === value);
}

export function normalizeModuleAccessLevel(value: unknown): ModuleAccessLevel {
    return value === "read" || value === "modify" ? value : "none";
}

export function moduleAccessLevelAllows(current: ModuleAccessLevel, required: Exclude<ModuleAccessLevel, "none">) {
    return current === "modify" || (required === "read" && current === "read");
}
