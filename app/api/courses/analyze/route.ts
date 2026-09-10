import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { buildSmartCourseProposal } from "@/lib/courses/smart-analysis";
import { extractDocumentText } from "@/lib/sources/text-extraction";
import { readBoundedFormData } from "@/lib/sources/request";
import { hasSameBrowserOrigin } from "@/lib/sources/same-origin";
import { getSourceUploadMaxBytes, validateSourceUpload } from "@/lib/sources/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401, headers: privateHeaders });
  if (!hasSameBrowserOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403, headers: privateHeaders });
  try {
    const limit = getSourceUploadMaxBytes();
    const formData = await readBoundedFormData(request, limit);
    const entry = formData.get("file");
    const schoolYearId = typeof formData.get("schoolYearId") === "string" ? String(formData.get("schoolYearId")).trim() : "";
    if (!(entry instanceof File) || !schoolYearId) return NextResponse.json({ error: "Choisis un document et une année scolaire." }, { status: 400, headers: privateHeaders });
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const metadata = validateSourceUpload({ fileName: entry.name, declaredMime: entry.type, bytes });
    const year = await prisma.schoolYear.findFirst({
      where: { id: schoolYearId, userId: user.id },
      select: { subjects: { orderBy: { title: "asc" }, select: { id: true, title: true, themes: { orderBy: { title: "asc" }, select: { id: true, title: true, orderVersion: true, parts: { orderBy: { position: "asc" }, select: { id: true, title: true, referenceLabel: true } } } } } } },
    });
    if (!year) return NextResponse.json({ error: "Année scolaire introuvable." }, { status: 404, headers: privateHeaders });
    const extracted = extractDocumentText(bytes, metadata.mimeType);
    const proposal = buildSmartCourseProposal({ fileName: metadata.fileName, internalTitle: extracted.title, extractedText: extracted.text, readableText: extracted.readable, subjects: year.subjects });
    return NextResponse.json(proposal, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error && /taille/i.test(error.message) ? "Le document dépasse la limite autorisée." : "Le PDF ou ODT n’a pas pu être analysé en sécurité.";
    return NextResponse.json({ error: message }, { status: 400, headers: privateHeaders });
  }
}
