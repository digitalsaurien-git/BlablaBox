import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { importSource, SourceNotFound } from "@/lib/sources/import";
import { getSourceUploadMaxBytes, validateSourceUpload } from "@/lib/sources/validation";
import { readBoundedFormData } from "@/lib/sources/request";
import { hasSameBrowserOrigin } from "@/lib/sources/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

function redirectToCourses(params: Record<string, string>): Response {
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: `/courses?${new URLSearchParams(params)}` } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401, headers: privateHeaders });
  if (!hasSameBrowserOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403, headers: privateHeaders });
  try {
    const limit = getSourceUploadMaxBytes();
    const formData = await readBoundedFormData(request, limit);
    const entry = formData.get("file");
    if (!(entry instanceof File)) return redirectToCourses({ error: "file-required" });
    if (entry.size > limit) return redirectToCourses({ error: "file-too-large" });
    const value = formData.get("coursePartId");
    const partId = typeof value === "string" ? value.trim() : "";
    if (partId && !(await prisma.coursePart.findFirst({ where: { id: partId, userId: user.id }, select: { id: true } }))) return NextResponse.json({ error: "Ressource introuvable." }, { status: 404, headers: privateHeaders });
    const input = { userId: user.id, coursePartId: partId || null, fileName: entry.name, declaredMime: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) };
    try { validateSourceUpload(input); } catch { return redirectToCourses({ error: "format-or-size" }); }
    const result = await importSource(prisma, input);
    return result.duplicate ? redirectToCourses({ duplicate: result.sourceAssetId, part: partId }) : redirectToCourses({ uploaded: "1" });
  } catch (error) {
    if (error instanceof SourceNotFound) return NextResponse.json({ error: "Ressource introuvable." }, { status: 404, headers: privateHeaders });
    return redirectToCourses({ error: error instanceof Error && error.message === "file-too-large" ? "file-too-large" : "upload-failed" });
  }
}
