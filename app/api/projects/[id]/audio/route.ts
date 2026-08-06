import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStoredAudioPath } from "@/lib/audio-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, audioFilePath: true, audioFormat: true },
  });
  if (!project?.audioFilePath) return NextResponse.json({ error: "Audio introuvable." }, { status: 404 });

  try {
    const filePath = resolveStoredAudioPath(project.audioFilePath);
    const fileStats = await stat(filePath);
    if (!fileStats.isFile() || fileStats.size === 0) throw new Error("empty");
    const audio = await readFile(filePath);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(audio), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="blablabox-${project.id}.mp3"`,
        "Content-Length": String(audio.length),
        "Content-Type": project.audioFormat === "mp3" ? "audio/mpeg" : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio introuvable." }, { status: 404 });
  }
}
