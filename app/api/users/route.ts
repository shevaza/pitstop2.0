import { graphFetch } from "@/lib/graph";
import { assertModuleAccess } from "@/lib/module-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/users?top=25&skiptoken=...&search=...
export async function GET(req: Request) {
    try {
        await assertModuleAccess("users");
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }

    const { searchParams } = new URL(req.url);
    const top = Math.min(parseInt(searchParams.get("top") || "25", 10), 500);
    const search = (searchParams.get("search") || "").trim();
    const skiptoken = searchParams.get("skiptoken");

    // Build Graph query
    const select =
        "$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,employeeId,employeeType,usageLocation,accountEnabled";
    let path = `/users?${select}&$top=${top}`;

    if (search) {
        // filter by startswith on displayName or eq on UPN (simple/fast)
        const s = search.replace(/'/g, "''");
        path += `&$filter=startswith(displayName,'${s}') or userPrincipalName eq '${s}'`;
    }
    if (skiptoken) path += `&$skiptoken=${encodeURIComponent(skiptoken)}`;

    const data = await graphFetch<any>(path);
    return Response.json({
        items: data.value || [],
        nextLink: data["@odata.nextLink"] || null, // contains $skiptoken
    });
}
