"use client";
import RequiredPolicies from "@/components/RequiredPolicies";
import { SessionProvider } from "next-auth/react";
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><RequiredPolicies>{children}</RequiredPolicies></SessionProvider>;
}
