import type { Metadata } from "next";
import Link from "next/link";
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
            <div className="flex items-center gap-1 text-sm sm:gap-2">
              <Link
                href="/projects"
                className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink"
              >
                Bibliothèque
              </Link>
              <Link
                href="/understand/new"
                className="rounded-md bg-ink px-3 py-2 font-medium text-paper transition hover:bg-moss"
              >
                Comprendre
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
