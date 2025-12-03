import { graphFetch } from "./graph";

let skuMap: Record<string, string> | null = null;
export async function skuPartToId(part: string) {
    if (!skuMap) {
        const data = await graphFetch<{ value: any[] }>(`/subscribedSkus`);
        skuMap = {};
        for (const s of data.value ?? []) {
            if (s.skuPartNumber && s.skuId) skuMap[s.skuPartNumber.toUpperCase()] = s.skuId;
        }
    }
    return skuMap[part.toUpperCase()] || null;
}
