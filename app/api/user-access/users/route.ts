import { graphFetch } from "@/lib/graph";
import { assertModuleAccess } from "@/lib/module-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GraphUserSearchResponse = {
    value?: Array<{
        id: string;
        displayName?: string;
        givenName?: string;
        surname?: string;
        userPrincipalName: string;
        jobTitle?: string;
        department?: string;
        accountEnabled?: boolean;
    }>;
};

export async function GET(req: Request) {
    try {
        await assertModuleAccess("user-access");

        const { searchParams } = new URL(req.url);
        const top = Math.min(parseInt(searchParams.get("top") || "25", 10), 100);
        const search = (searchParams.get("search") || "").trim();

        const select =
            "$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,accountEnabled";
        let path = `/users?${select}&$top=${top}&$filter=accountEnabled eq true`;

        if (search) {
            const escaped = search.replace(/'/g, "''");
            path += ` and (startswith(displayName,'${escaped}') or userPrincipalName eq '${escaped}')`;
        }

        const data = await graphFetch<GraphUserSearchResponse>(path);
        return Response.json({ items: data.value || [] });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/user-access/users failed", error);
        return new Response("Failed to search users", { status: 500 });
    }
}
