import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlablaBox",
  description: "Creation de scripts audio pedagogiques memorisables.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <header className="border-b border-ink/10 bg-paper/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-wide text-ink">
              BlablaBox
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/projects"
                className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink"
              >
                Bibliotheque
              </Link>
              <Link
                href="/projects/new"
                className="rounded-md bg-ink px-3 py-2 font-medium text-paper transition hover:bg-moss"
              >
                Nouveau
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
