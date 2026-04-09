const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertSupabaseEnv() {
    if (!supabaseUrl) {
        throw new Error("Missing required env var: SUPABASE_URL");
    }

    if (!supabaseServiceRoleKey) {
        throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
    }
}

type Primitive = string | number | boolean | null;

type SupabaseRequestOptions = {
    method?: "GET" | "POST" | "PATCH";
    query?: Record<string, Primitive>;
    body?: unknown;
    headers?: Record<string, string>;
};

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions = {}) {
    assertSupabaseEnv();

    const url = new URL(`${supabaseUrl}/rest/v1/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
            apikey: supabaseServiceRoleKey!,
            Authorization: `Bearer ${supabaseServiceRoleKey!}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Supabase ${options.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
    }

    if (response.status === 204) {
        return null as T;
    }

    return (await response.json()) as T;
}
