// lib/prisma.ts
import path from "node:path";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const dbUrl = process.env.DATABASE_URL;
if (dbUrl?.startsWith("file:")) {
    const filePath = dbUrl.replace(/^file:/, "");
    // Skip URLs that already contain a host (e.g. file://) or absolute paths
    if (!filePath.startsWith("//") && !path.isAbsolute(filePath)) {
        const absolute = path.resolve(process.cwd(), filePath).replace(/\\/g, "/");
        process.env.DATABASE_URL = `file:${absolute}`;
    }
}

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
