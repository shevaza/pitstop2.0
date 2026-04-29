export const assetGroups = ["IT Assets", "Facilities Assets"] as const;

export type AssetGroup = (typeof assetGroups)[number];

export function isAssetGroup(value: string | null | undefined): value is AssetGroup {
    return assetGroups.includes(value as AssetGroup);
}

export function normalizeAssetGroups(values: unknown): AssetGroup[] {
    if (!Array.isArray(values)) return [...assetGroups];

    const allowed = new Set<AssetGroup>();
    for (const value of values) {
        if (typeof value === "string" && isAssetGroup(value)) {
            allowed.add(value);
        }
    }

    return Array.from(allowed);
}

export function canAccessAssetGroup(value: string | null | undefined, allowedGroups: readonly AssetGroup[]) {
    if (allowedGroups.length === assetGroups.length) return true;

    const group = value?.trim();
    if (!group) return false;
    return allowedGroups.includes(group as AssetGroup);
}
