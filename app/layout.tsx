import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/app-providers";

import "./globals.css";

const themeBootScript = `(() => { const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; let theme = preferred; try { const saved = localStorage.getItem('notion-clone-theme'); if (saved === 'light' || saved === 'dark') theme = saved; } catch (_) {} document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; })();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  applicationName: "Notion Clone",
  title: {
    default: "Notion Clone — startup beleške i zadaci",
    template: "%s · Notion Clone",
  },
  description: "Privatni zajednički prostor za startup beleške, odluke i zadatke.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#151821" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sr-Latn"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-svh bg-background font-sans text-foreground antialiased"
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
