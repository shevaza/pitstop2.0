import { z } from "zod";
import { assertModuleAccess } from "@/lib/module-auth";
import { deleteAsset, getAssetById, updateAsset, type DirectoryUser } from "@/lib/assets";
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

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const actorUpn = await assertAuthorized();
        const { assetGroups: allowedAssetGroups } = await getModuleAccessDetails(actorUpn);
        const { id } = await ctx.params;
        const asset = await getAssetById(decodeURIComponent(id));

        if (!asset) {
            return new Response("Asset not found", { status: 404 });
        }

        if (!canAccessAssetGroup(asset.asset_group, allowedAssetGroups)) {
            return new Response("Asset not found", { status: 404 });
        }

        return Response.json({ asset, assetGroups: allowedAssetGroups });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/assets/[id] failed", error);
        return new Response("Failed to load asset", { status: 500 });
    }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const actorUpn = await assertAuthorized();
        const { assetGroups: allowedAssetGroups } = await getModuleAccessDetails(actorUpn);
        const { id } = await ctx.params;
        const parsed = assetPayloadSchema.parse(await req.json());
        const existing = await getAssetById(decodeURIComponent(id));

        if (!existing) {
            return new Response("Asset not found", { status: 404 });
        }

        if (
            !canAccessAssetGroup(existing.asset_group, allowedAssetGroups) ||
            !canAccessAssetGroup(parsed.assetGroup, allowedAssetGroups)
        ) {
            return new Response("You do not have access to this asset group.", { status: 403 });
        }

        const asset = await updateAsset(decodeURIComponent(id), {
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

        return Response.json({ asset });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("PATCH /api/assets/[id] failed", error);
        return new Response("Failed to update asset", { status: 500 });
    }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const actorUpn = await assertAuthorized();
        const { assetGroups: allowedAssetGroups } = await getModuleAccessDetails(actorUpn);
        const { id } = await ctx.params;
        const asset = await getAssetById(decodeURIComponent(id));
        if (!asset) {
            return new Response("Asset not found", { status: 404 });
        }
        if (!canAccessAssetGroup(asset.asset_group, allowedAssetGroups)) {
            return new Response("Asset not found", { status: 404 });
        }
        await deleteAsset(decodeURIComponent(id));
        return new Response(null, { status: 204 });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("DELETE /api/assets/[id] failed", error);
        return new Response("Failed to delete asset", { status: 500 });
    }
}
