import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoredAudioPlayback, resolveStoredAudioPath } from "@/lib/audio-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      contentVersion: true,
      audioContentVersion: true,
      audioFilePath: true,
      audioFormat: true,
    },
  });
  if (
    !project?.audioFilePath ||
    project.audioContentVersion === null ||
    project.audioContentVersion !== project.contentVersion
  ) {
    return NextResponse.json({ error: "Audio introuvable." }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const playback = await getStoredAudioPlayback(project.audioFilePath);
    if (!playback) throw new Error("missing");
    const requestedSegment = url.searchParams.get("segment");
    const segmentIndex = requestedSegment === null ? 0 : Number(requestedSegment);
    if (
      !Number.isInteger(segmentIndex) ||
      segmentIndex < 0 ||
      segmentIndex >= playback.segments.length
    ) {
      return NextResponse.json({ error: "Segment audio introuvable." }, { status: 404 });
    }
    const selectedSegment = playback.segments[segmentIndex];
    const filePath = resolveStoredAudioPath(selectedSegment.fileName);
    const fileStats = await stat(filePath);
    if (!fileStats.isFile() || fileStats.size === 0) throw new Error("empty");
    const audio = await readFile(filePath);
    const download = url.searchParams.get("download") === "1";
    const segmentSuffix = playback.segmented
      ? `-partie-${String(segmentIndex + 1).padStart(2, "0")}-sur-${String(playback.segments.length).padStart(2, "0")}`
      : "";
    return new Response(new Uint8Array(audio), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="blablabox-${project.id}${segmentSuffix}.mp3"`,
        "Content-Length": String(audio.length),
        "Content-Type": project.audioFormat === "mp3" ? "audio/mpeg" : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio introuvable." }, { status: 404 });
  }
}
