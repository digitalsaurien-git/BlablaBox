import type { Metadata } from "next";
import Link from "next/link";
import { AccountNavigation } from "@/components/account-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlablaBox",
  description: "Comprendre, lire et écouter des contenus pédagogiques adaptés.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <header className="border-b border-ink/10 bg-paper/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-wide text-ink">
              BlablaBox
            </Link>
            <AccountNavigation />
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
