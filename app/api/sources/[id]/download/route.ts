import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { readSourceFile, sourceContentDisposition } from "@/lib/sources/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  const source = await prisma.sourceAsset.findFirst({
    where: { id, userId: user.id },
    select: { storageKey: true, mimeType: true, imports: { orderBy: { createdAt: "asc" }, take: 1, select: { originalFileName: true } } },
  });
  if (!source) return NextResponse.json({ error: "Source introuvable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const bytes = await readSourceFile(source.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": sourceContentDisposition(source.imports[0]?.originalFileName ?? "document-source"),
        "Content-Length": String(bytes.length),
        "Content-Type": source.mimeType === "application/pdf" || source.mimeType === "application/vnd.oasis.opendocument.text" ? source.mimeType : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Source introuvable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
