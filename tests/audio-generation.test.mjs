import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateTTSScript } from "../lib/audio-generation.ts";
import {
  createAudioWriteTarget,
  finalizeAudioFile,
  removeStoredAudio,
  resolveStoredAudioPath,
} from "../lib/audio-storage.ts";
import { OpenAITTSProvider } from "../lib/providers/tts/openai-provider.ts";

test("refuse un script TTS vide", () => {
  assert.throws(() => validateTTSScript("   "), /script est vide/i);
});

test("refuse un script au-dessus de la limite sans le tronquer", () => {
  process.env.TTS_MAX_SCRIPT_CHARACTERS = "5";
  assert.throws(() => validateTTSScript("123456"), /limite de 5/i);
  delete process.env.TTS_MAX_SCRIPT_CHARACTERS;
});

test("OpenAI TTS échoue clairement sans clé", async () => {
  const provider = new OpenAITTSProvider({ apiKey: "" });
  await assert.rejects(
    provider.generateSpeech({ script: "Bonjour", outputFilePath: "unused.mp3" }),
    /TTS_API_KEY/,
  );
});

test("OpenAI TTS écrit les octets MP3 retournés sans appel réel", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-tts-"));
  const outputFilePath = path.join(directory, "audio.tmp");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([73, 68, 51, 3]));
  try {
    const provider = new OpenAITTSProvider({ apiKey: "test-key" });
    const result = await provider.generateSpeech({ script: "Bonjour", outputFilePath });
    assert.equal(result.format, "mp3");
    assert.deepEqual([...await readFile(outputFilePath)], [73, 68, 51, 3]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test("le stockage crée un nom non devinable et finalise atomiquement", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-storage-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  try {
    const target = await createAudioWriteTarget();
    assert.match(target.fileName, /^[0-9a-f-]{36}\.mp3$/);
    await writeFile(target.temporaryPath, new Uint8Array([73, 68, 51]));
    await finalizeAudioFile(target.temporaryPath, target.finalPath);
    assert.deepEqual([...await readFile(resolveStoredAudioPath(target.fileName))], [73, 68, 51]);
    await removeStoredAudio(target.fileName);
    await assert.rejects(readFile(target.finalPath));
    assert.throws(() => resolveStoredAudioPath("../secret.mp3"), /invalide/i);
  } finally {
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});
