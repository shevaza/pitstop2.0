import Providers from "./providers";
import "./globals.css";
import HeaderNav from "@/components/HeaderNav";
import MainContainer from "@/components/MainContainer";

export const metadata = { title: "PitStop 2.0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem("pitstop-theme");
                  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
                } catch (_) {
                  document.documentElement.dataset.theme = "dark";
                }
              })();
            `,
          }}
        />
      </head>
      <body className="text-[var(--foreground)] antialiased">
        <Providers>
          <HeaderNav />
          <MainContainer>{children}</MainContainer>
        </Providers>
      </body>
    </html>
  );
}
