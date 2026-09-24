import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSourceStorageRoot } from "@/lib/sources/storage";
import { getAudioStorageRoot } from "@/lib/audio-storage";
import { access, constants } from "node:fs/promises";

async function checkDirectory(label: string, dir: string): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    await access(dir, constants.R_OK | constants.W_OK);
    return { ok: true, path: dir };
  } catch (err) {
    return { ok: false, path: dir, error: err instanceof Error ? err.message : "inaccessible" };
  }
}

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string; path?: string }> = {};

  // Database connectivity
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: err instanceof Error ? err.message : "unreachable" };
  }

  // Storage directories
  const [sources, audio] = await Promise.all([
    checkDirectory("sources", getSourceStorageRoot()),
    checkDirectory("audio", getAudioStorageRoot()),
  ]);
  checks.sourceStorage = sources;
  checks.audioStorage = audio;

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, service: "blablabox", checks }, { status: ok ? 200 : 503 });
}
