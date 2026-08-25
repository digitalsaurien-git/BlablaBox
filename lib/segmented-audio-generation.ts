import { segmentTTSScript } from "./audio-generation.ts";
import {
  createAudioWriteTarget,
  createStoredAudioManifest,
  finalizeAudioFile,
  removeStoredAudio,
  removeTemporaryAudio,
} from "./audio-storage.ts";
import type { TTSProvider } from "./providers/tts/types";

export type SegmentedAudioPublication = {
  manifestFileName: string;
  durationSeconds: number | null;
  segmentCount: number;
};

export async function generateSegmentedStoredAudio({
  script,
  provider,
  publish,
}: {
  script: string;
  provider: TTSProvider;
  publish: (publication: SegmentedAudioPublication) => Promise<boolean>;
}): Promise<{ published: boolean; manifestFileName: string | null }> {
  const segments = segmentTTSScript(script);
  const targets: Array<
    Awaited<ReturnType<typeof createAudioWriteTarget>> & { finalized: boolean }
  > = [];
  let manifestFileName: string | null = null;

  try {
    const generatedSegments: Array<{ fileName: string; durationSeconds?: number }> = [];
    for (const segment of segments) {
      const createdTarget = await createAudioWriteTarget();
      const target = { ...createdTarget, finalized: false };
      targets.push(target);
      const result = await provider.generateSpeech({
        script: segment,
        outputFilePath: target.temporaryPath,
      });
      await finalizeAudioFile(target.temporaryPath, target.finalPath);
      target.finalized = true;
      generatedSegments.push({
        fileName: target.fileName,
        durationSeconds: result.durationSeconds,
      });
    }

    manifestFileName = await createStoredAudioManifest(generatedSegments);
    const durationSeconds = generatedSegments.every(
      (segment) => segment.durationSeconds !== undefined,
    )
      ? generatedSegments.reduce(
          (total, segment) => total + (segment.durationSeconds ?? 0),
          0,
        )
      : null;
    const published = await publish({
      manifestFileName,
      durationSeconds,
      segmentCount: generatedSegments.length,
    });

    if (!published) {
      await removeStoredAudio(manifestFileName);
      return { published: false, manifestFileName: null };
    }
    return { published: true, manifestFileName };
  } catch (error) {
    for (const target of targets) {
      await removeTemporaryAudio(target.temporaryPath);
    }
    if (manifestFileName) {
      await removeStoredAudio(manifestFileName).catch(() => undefined);
    } else {
      await Promise.all(
        targets
          .filter((target) => target.finalized)
          .map((target) => removeStoredAudio(target.fileName).catch(() => undefined)),
      );
    }
    throw error;
  }
}
