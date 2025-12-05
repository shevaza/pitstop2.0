import { ConfidentialClientApplication } from "@azure/msal-node";

let msal: ConfidentialClientApplication | null = null;

function getMsalClient() {
    const clientId = process.env.AZURE_AD_CLIENT_ID;
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

    if (!clientId || !tenantId || !clientSecret) {
        throw new Error("Missing Azure AD env vars: AZURE_AD_CLIENT_ID, AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_SECRET");
    }

    if (!msal) {
        msal = new ConfidentialClientApplication({
            auth: {
                clientId,
                authority: `https://login.microsoftonline.com/${tenantId}`,
                clientSecret,
            },
        });
    }
    return msal;
}

async function getToken() {
    const res = await getMsalClient().acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    if (!res?.accessToken) throw new Error("Graph token acquisition failed");
    return res.accessToken;
}

export async function graphFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Graph ${path} ${res.status}: ${text}`);
    }
    // some PATCH/DELETE endpoints return no content
    try { return await res.json(); } catch { return {} as T; }
}
