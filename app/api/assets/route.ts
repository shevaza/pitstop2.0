import { z } from "zod";
import { createAsset, listAssets, type DirectoryUser } from "@/lib/assets";
import { assertModuleAccess } from "@/lib/module-auth";
import { assetGroups, canAccessAssetGroup } from "@/lib/asset-groups";
import { getModuleAccessDetails } from "@/lib/module-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nullishString = z.string().nullable().optional();

const assetPayloadSchema = z.object({
    assetTag: z.string().trim().min(1),
    name: z.string().trim().min(1),
    assetGroup: z.enum(assetGroups),
    assetType: z.string().trim().min(1),
    status: z.string().trim().min(1).default("active"),
    quantity: z.coerce.number().int().min(1).default(1),
    location: nullishString,
    serialNumber: nullishString,
    manufacturer: nullishString,
    model: nullishString,
    notes: nullishString,
    assignedUser: z.object({
        id: nullishString,
        userPrincipalName: z.string().email(),
        displayName: nullishString,
        givenName: nullishString,
        surname: nullishString,
        jobTitle: nullishString,
        department: nullishString,
        officeLocation: nullishString,
        mobilePhone: nullishString,
        employeeId: nullishString,
        employeeType: nullishString,
        usageLocation: nullishString,
        accountEnabled: z.boolean().nullable().optional(),
    }).nullable().optional(),
});

async function assertAuthorized() {
    return assertModuleAccess("assets");
}

function normalizeAssignedUser(
    assignedUser: z.infer<typeof assetPayloadSchema>["assignedUser"],
): Partial<DirectoryUser> | null {
    if (!assignedUser) return null;

    return {
        id: assignedUser.id ?? undefined,
        userPrincipalName: assignedUser.userPrincipalName,
        displayName: assignedUser.displayName ?? undefined,
        givenName: assignedUser.givenName ?? undefined,
        surname: assignedUser.surname ?? undefined,
        jobTitle: assignedUser.jobTitle ?? undefined,
        department: assignedUser.department ?? undefined,
        officeLocation: assignedUser.officeLocation ?? undefined,
        mobilePhone: assignedUser.mobilePhone ?? undefined,
        employeeId: assignedUser.employeeId ?? undefined,
        employeeType: assignedUser.employeeType ?? undefined,
        usageLocation: assignedUser.usageLocation ?? undefined,
        accountEnabled: assignedUser.accountEnabled ?? undefined,
    };
}

export async function GET() {
    try {
        const actorUpn = await assertAuthorized();
        const { assetGroups: allowedAssetGroups } = await getModuleAccessDetails(actorUpn);
        const items = await listAssets(allowedAssetGroups);
        return Response.json({ items, assetGroups: allowedAssetGroups });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/assets failed", error);
        return new Response("Failed to load assets", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const actorUpn = await assertAuthorized();
        const { assetGroups: allowedAssetGroups } = await getModuleAccessDetails(actorUpn);
        const parsed = assetPayloadSchema.parse(await req.json());

        if (!canAccessAssetGroup(parsed.assetGroup, allowedAssetGroups)) {
            return new Response("You do not have access to this asset group.", { status: 403 });
        }

        const asset = await createAsset({
            assetTag: parsed.assetTag,
            name: parsed.name,
            assetGroup: parsed.assetGroup,
            assetType: parsed.assetType,
            status: parsed.status,
            quantity: parsed.quantity,
            location: parsed.location,
            serialNumber: parsed.serialNumber,
            manufacturer: parsed.manufacturer,
            model: parsed.model,
            notes: parsed.notes,
            assignedUser: normalizeAssignedUser(parsed.assignedUser),
            actorUpn,
        });

        return Response.json({ asset }, { status: 201 });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("POST /api/assets failed", error);
        return new Response("Failed to create asset", { status: 500 });
    }
}
