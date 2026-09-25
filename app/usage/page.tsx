import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ProviderRow = {
  provider: string;
  operation: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
  inputTokens: number | null;
  outputTokens: number | null;
  avgDurationMs: number | null;
};

async function getUsageStats(userId: string): Promise<ProviderRow[]> {
  const rows = await prisma.providerUsage.groupBy({
    by: ["provider", "operation", "status"],
    where: { userId },
    _count: { id: true },
    _sum: { inputTokens: true, outputTokens: true, durationMs: true },
    _avg: { durationMs: true },
    orderBy: [{ provider: "asc" }, { operation: "asc" }],
  });

  // Agrège par provider+operation (toutes les statuts fusionnés)
  const map = new Map<string, ProviderRow>();
  for (const row of rows) {
    const key = `${row.provider}|${row.operation}`;
    const count = row._count.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        provider: row.provider,
        operation: row.operation,
        total: count,
        done: row.status === "DONE" ? count : 0,
        failed: row.status === "FAILED" ? count : 0,
        pending: row.status === "PENDING" ? count : 0,
        inputTokens: row._sum.inputTokens ?? null,
        outputTokens: row._sum.outputTokens ?? null,
        avgDurationMs: row.status === "DONE" ? (row._avg.durationMs ?? null) : null,
      });
    } else {
      existing.total += count;
      if (row.status === "DONE") {
        existing.done += count;
        const sumMs = row._sum.durationMs;
        if (sumMs !== null) {
          const prev = existing.avgDurationMs ?? 0;
          existing.avgDurationMs =
            existing.done > 0 ? Math.round((prev * (existing.done - count) + sumMs) / existing.done) : null;
        }
      }
      if (row.status === "FAILED") existing.failed += count;
      if (row.status === "PENDING") existing.pending += count;
      if (row._sum.inputTokens) existing.inputTokens = (existing.inputTokens ?? 0) + row._sum.inputTokens;
      if (row._sum.outputTokens) existing.outputTokens = (existing.outputTokens ?? 0) + row._sum.outputTokens;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.provider.localeCompare(b.provider) || a.operation.localeCompare(b.operation),
  );
}

function fmt(n: number | null, unit = ""): string {
  if (n === null) return "—";
  if (unit === "ms" && n >= 1000) return `${(n / 1000).toFixed(1)} s`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M${unit}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k${unit}`;
  return `${n}${unit ? " " + unit : ""}`;
}

function ErrorRate({ done, failed }: { done: number; failed: number }) {
  const total = done + failed;
  if (total === 0) return <span className="text-ink/40">—</span>;
  const rate = Math.round((failed / total) * 100);
  return (
    <span className={rate >= 20 ? "font-semibold text-red-600" : rate >= 5 ? "text-amber-600" : "text-ink/60"}>
      {rate} %
    </span>
  );
}

export default async function UsagePage() {
  const user = await requireCurrentUser();
  const rows = await getUsageStats(user.id);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Compte</p>
        <h1 className="text-3xl font-bold text-ink">Utilisation des providers</h1>
        <p className="leading-7 text-ink/70">
          Historique de tes opérations LLM et TTS. Les données sont cumulées depuis la création du compte.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-ink/60">
          Aucune opération enregistrée pour l'instant.{" "}
          <Link href="/courses" className="text-moss underline">
            Prépare ton premier cours
          </Link>{" "}
          pour voir apparaître les données ici.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Opération</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Réussies</th>
                <th className="px-4 py-3 text-right">Échecs</th>
                <th className="px-4 py-3 text-right">En cours</th>
                <th className="px-4 py-3 text-right">Tokens entrants</th>
                <th className="px-4 py-3 text-right">Tokens sortants</th>
                <th className="px-4 py-3 text-right">Durée moy.</th>
                <th className="px-4 py-3 text-right">Taux d'erreur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((row) => (
                <tr key={`${row.provider}|${row.operation}`} className="transition hover:bg-paper/60">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-moss">{row.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/70">{row.operation}</td>
                  <td className="px-4 py-3 text-right font-medium">{row.total.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right text-green-700">{row.done.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right text-red-600">{row.failed > 0 ? row.failed.toLocaleString("fr-FR") : <span className="text-ink/30">0</span>}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{row.pending > 0 ? row.pending.toLocaleString("fr-FR") : <span className="text-ink/30">0</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.inputTokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.outputTokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(row.avgDurationMs, "ms")}</td>
                  <td className="px-4 py-3 text-right">
                    <ErrorRate done={row.done} failed={row.failed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink/40">
        Les opérations &laquo;&nbsp;En cours&nbsp;&raquo; correspondent à des préparations démarrées mais pas encore
        terminées ou échouées. Les tokens ne sont disponibles que pour les providers LLM.
      </p>
    </div>
  );
}
