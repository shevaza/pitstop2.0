import NextAuth, { getServerSession, type NextAuthOptions } from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";

export const authOptions: NextAuthOptions = {
    session: { strategy: "jwt" },
    pages: {
        signIn: "/login",
    },
    providers: [
        AzureAD({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
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
