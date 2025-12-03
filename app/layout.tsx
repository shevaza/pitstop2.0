import Providers from "./providers";
import "./globals.css";
import HeaderNav from "@/components/HeaderNav";
import MainContainer from "@/components/MainContainer";

export const metadata = { title: "ITCAN365" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-[var(--foreground)] antialiased">
        <Providers>
          <HeaderNav />
          <MainContainer>{children}</MainContainer>
        </Providers>
      </body>
    </html>
  );
}
