import { headers } from "next/headers";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { auth } from "@/lib/auth";

export type RequestIdentity = {
    upn: string;
    email?: string;
    name?: string;
    source: "session" | "bearer";
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function requireEnv(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

function getJwks() {
    if (!jwks) {
        const tenantId = requireEnv("AZURE_AD_TENANT_ID");
        jwks = createRemoteJWKSet(
            new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
        );
    }
    return jwks;
}

function getIdentityFromPayload(payload: JWTPayload): RequestIdentity | null {
    const upn =
        typeof payload.preferred_username === "string"
            ? payload.preferred_username
            : typeof payload.upn === "string"
                ? payload.upn
                : typeof payload.email === "string"
                    ? payload.email
                    : null;

    if (!upn) return null;

    return {
        upn,
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
        source: "bearer",
    };
}

async function getBearerIdentity() {
    const requestHeaders = await headers();
    const authorization = requestHeaders.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
        return { identity: null as RequestIdentity | null, hadBearer: false };
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token) {
        return { identity: null as RequestIdentity | null, hadBearer: true };
    }

    try {
        const tenantId = requireEnv("AZURE_AD_TENANT_ID");
        const clientId = requireEnv("AZURE_AD_CLIENT_ID");
        const { payload } = await jwtVerify(token, getJwks(), {
            issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
            audience: clientId,
        });

        return { identity: getIdentityFromPayload(payload), hadBearer: true };
    } catch (error) {
        console.error("Bearer token verification failed", error);
        return { identity: null as RequestIdentity | null, hadBearer: true };
    }
}

export async function getRequestIdentity(): Promise<RequestIdentity | null> {
    const bearer = await getBearerIdentity();
    if (bearer.hadBearer) {
        return bearer.identity;
    }

    const session = await auth();
    const upn = (session as { upn?: string } | null)?.upn;
    if (!upn) return null;

    return {
        upn,
        email: session?.user?.email ?? undefined,
        name: session?.user?.name ?? undefined,
        source: "session",
    };
}
