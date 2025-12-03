"use client";

import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

export default function MainContainer({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const authed = status === "authenticated";

  return (
    <main
      className={`min-h-screen px-4 pt-16 text-[var(--foreground)] md:px-8 md:pt-20 ${
        authed ? "md:pl-64" : ""
      }`}
    >
      {children}
    </main>
  );
}
