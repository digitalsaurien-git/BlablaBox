import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { importSmartCourse } from "@/lib/courses/smart-import";
import { parseExpectedVersion, parseOptionalId, readCourseText } from "@/lib/courses/validation";
import { readBoundedFormData } from "@/lib/sources/request";
import { hasSameBrowserOrigin } from "@/lib/sources/same-origin";
import { getSourceUploadMaxBytes } from "@/lib/sources/validation";

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
    const formData = await readBoundedFormData(request, getSourceUploadMaxBytes());
    const file = formData.get("file");
    const subjectId = parseOptionalId(formData.get("subjectId"));
    const courseTitle = readCourseText(formData.get("courseTitle"), "", 160);
    const referenceLabel = readCourseText(formData.get("referenceLabel"), "", 80) || null;
    const partTitle = readCourseText(formData.get("partTitle"), referenceLabel ? `Partie ${referenceLabel}` : courseTitle, 180);
    const themeChoice = formData.get("themeChoice");
    const existingThemeId = typeof themeChoice === "string" && themeChoice !== "new" ? parseOptionalId(themeChoice) : null;
    const expectedOrderVersion = parseExpectedVersion(formData.get("orderVersion"));
    const validThemeChoice = themeChoice === "new" || Boolean(existingThemeId);
    if (!(file instanceof File) || !subjectId || !courseTitle || !partTitle || !validThemeChoice || (existingThemeId && expectedOrderVersion === null)) return redirectToCourses({ error: "smart-invalid" });
    const result = await importSmartCourse(prisma, {
      userId: user.id, subjectId, courseTitle, existingThemeId, expectedOrderVersion, referenceLabel, partTitle,
      fileName: file.name, declaredMime: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return redirectToCourses({ added: "1", duplicate: result.duplicate ? "1" : "0", reused: result.reusedPart ? "1" : "0" });
  } catch (error) {
    const code = error instanceof Error && error.message === "stale-order" ? "stale-order" : "smart-import-failed";
    return redirectToCourses({ error: code });
  }
}
