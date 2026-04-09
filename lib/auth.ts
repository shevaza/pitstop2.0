import NextAuth, { getServerSession, type NextAuthOptions } from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";

const nextAuthSecret =
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-secret-please-change" : undefined);

const azureAdClientId = process.env.AZURE_AD_CLIENT_ID;
const azureAdClientSecret = process.env.AZURE_AD_CLIENT_SECRET;
const azureAdTenantId = process.env.AZURE_AD_TENANT_ID;

function assertGuid(value: string | undefined, name: string) {
    const guidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }

    if (!guidPattern.test(value)) {
        throw new Error(`${name} must be an Azure GUID value. Received: "${value}"`);
    }
}

assertGuid(azureAdClientId, "AZURE_AD_CLIENT_ID");
assertGuid(azureAdTenantId, "AZURE_AD_TENANT_ID");

if (!azureAdClientSecret) {
    throw new Error("Missing required env var: AZURE_AD_CLIENT_SECRET");
}

export const authOptions: NextAuthOptions = {
    secret: nextAuthSecret,
    session: { strategy: "jwt" },
    pages: {
        signIn: "/login",
    },
    providers: [
        AzureAD({
            clientId: azureAdClientId,
            clientSecret: azureAdClientSecret,
            tenantId: azureAdTenantId,
            authorization: { params: { scope: "openid profile email offline_access" } },
        }),
    ],
    callbacks: {
        async jwt({ token, profile }) {
            // persist UPN/email for downstream Graph calls
            if (profile && (profile as any).preferred_username) {
                token.upn = (profile as any).preferred_username;
            } else if (profile?.email) {
                token.upn = profile.email;
            }
            return token;
        },
        async session({ session, token }) {
            (session as any).upn = token.upn;
            return session;
        },
    },
};

export const auth = () => getServerSession(authOptions);

const nextAuthHandler = NextAuth(authOptions);
export const handlers = { GET: nextAuthHandler, POST: nextAuthHandler };
