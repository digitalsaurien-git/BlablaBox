import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  segmentTTSScript,
  validateTTSScript,
} from "../lib/audio-generation.ts";
import {
  createAudioWriteTarget,
  createStoredAudioManifest,
  finalizeAudioFile,
  getStoredAudioPlayback,
  removeStoredAudio,
  resolveStoredAudioPath,
  storedAudioExists,
} from "../lib/audio-storage.ts";
import { generateSegmentedStoredAudio } from "../lib/segmented-audio-generation.ts";
import { OpenAITTSProvider } from "../lib/providers/tts/openai-provider.ts";

test("refuse un script TTS vide", () => {
  assert.throws(() => validateTTSScript("   "), /script est vide/i);
});

test("un texte inférieur à 4096 caractères reste un segment inchangé", () => {
  process.env.TTS_MAX_SCRIPT_CHARACTERS = "4096";
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "3500";
  const script = "Une réponse courte et complète.";
  assert.deepEqual(segmentTTSScript(script), [script]);
  delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
  delete process.env.TTS_MAX_SCRIPT_CHARACTERS;
});

test("un texte d'environ 5500 caractères est découpé sans perte et dans l'ordre", () => {
  const script = "Une phrase pédagogique complète. ".repeat(170).trim();
  const segments = segmentTTSScript(script);
  assert.equal(segments.length, 2);
  assert.equal(segments.join(""), script);
  assert.ok(segments.every((segment) => segment.length <= 3500));
});

test("un texte beaucoup plus long produit autant de segments sûrs que nécessaire", () => {
  const script = "Cette phrase doit rester entière autant que possible. ".repeat(900).trim();
  const segments = segmentTTSScript(script);
  assert.ok(segments.length > 10);
  assert.equal(segments.join(""), script);
  assert.ok(segments.every((segment) => segment.length <= 3500));
});

test("la segmentation préfère un paragraphe à une coupure plus tardive", () => {
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "100";
  const firstParagraph = "Premier paragraphe volontairement court.";
  const script = `${firstParagraph}\n\n${"Suite sans ponctuation ".repeat(8)}`.trimEnd();
  const segments = segmentTTSScript(script);
  assert.equal(segments[0], `${firstParagraph}\n\n`);
  assert.equal(segments.join(""), script);
  delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
});

test("la segmentation utilise une fin de phrase sans séparation de paragraphe", () => {
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "90";
  const script = "Première phrase assez longue pour le test. Deuxième phrase également utile. Troisième phrase qui complète le texte sans aucune séparation de paragraphe.";
  const segments = segmentTTSScript(script);
  assert.match(segments[0], /\. $/);
  assert.equal(segments.join(""), script);
  assert.ok(segments.every((segment) => segment.length <= 90));
  delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
});

test("la segmentation refuse de couper un mot démesuré", () => {
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "20";
  assert.throws(() => segmentTTSScript("a".repeat(21)), /refuse de le couper au milieu/i);
  delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
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

test("le manifeste ordonne les segments dans le stockage existant", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-manifest-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  try {
    const first = await createAudioWriteTarget();
    const second = await createAudioWriteTarget();
    await writeFile(first.temporaryPath, new Uint8Array([1]));
    await writeFile(second.temporaryPath, new Uint8Array([2]));
    await finalizeAudioFile(first.temporaryPath, first.finalPath);
    await finalizeAudioFile(second.temporaryPath, second.finalPath);
    const manifest = await createStoredAudioManifest([
      { fileName: first.fileName },
      { fileName: second.fileName },
    ]);
    assert.match(manifest, /^[0-9a-f-]{36}\.json$/);
    assert.deepEqual(
      (await getStoredAudioPlayback(manifest))?.segments.map((segment) => segment.fileName),
      [first.fileName, second.fileName],
    );
    assert.equal((await getStoredAudioPlayback(manifest))?.segmented, true);
    assert.equal(await storedAudioExists(manifest), true);
    await removeStoredAudio(manifest);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});

test("un manifeste à un segment reste un téléchargement MP3 unique", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-single-manifest-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  try {
    const target = await createAudioWriteTarget();
    await writeFile(target.temporaryPath, new Uint8Array([1]));
    await finalizeAudioFile(target.temporaryPath, target.finalPath);
    const manifest = await createStoredAudioManifest([{ fileName: target.fileName }]);
    assert.equal((await getStoredAudioPlayback(manifest))?.segmented, false);
    await removeStoredAudio(manifest);
  } finally {
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});

test("le remplacement d'un audio supprime l'ancien manifeste et tous ses segments", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-replacement-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  try {
    const oldFirst = await createAudioWriteTarget();
    const oldSecond = await createAudioWriteTarget();
    const replacement = await createAudioWriteTarget();
    for (const target of [oldFirst, oldSecond, replacement]) {
      await writeFile(target.temporaryPath, new Uint8Array([1]));
      await finalizeAudioFile(target.temporaryPath, target.finalPath);
    }
    const oldManifest = await createStoredAudioManifest([
      { fileName: oldFirst.fileName },
      { fileName: oldSecond.fileName },
    ]);
    const newManifest = await createStoredAudioManifest([{ fileName: replacement.fileName }]);

    await removeStoredAudio(oldManifest);
    await assert.rejects(readFile(resolveStoredAudioPath(oldFirst.fileName)));
    await assert.rejects(readFile(resolveStoredAudioPath(oldSecond.fileName)));
    assert.equal(await storedAudioExists(newManifest), true);
    assert.deepEqual(
      (await getStoredAudioPlayback(newManifest))?.segments.map((segment) => segment.fileName),
      [replacement.fileName],
    );

    await removeStoredAudio(newManifest);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});

test("un échec du segment 2 nettoie tous les nouveaux fichiers", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-segment-failure-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "45";
  let callCount = 0;
  const provider = {
    async generateSpeech({ outputFilePath }) {
      callCount += 1;
      if (callCount === 2) throw new Error("Échec simulé du segment 2");
      await writeFile(outputFilePath, new Uint8Array([callCount]), { flag: "wx" });
      return { format: "mp3" };
    },
  };
  try {
    await assert.rejects(
      generateSegmentedStoredAudio({
        script: "Première phrase suffisamment longue. Deuxième phrase suffisamment longue. Troisième phrase suffisamment longue.",
        provider,
        publish: async () => true,
      }),
      /segment 2/i,
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});

test("une version devenue obsolète ne publie aucun segment", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-obsolete-audio-"));
  process.env.AUDIO_STORAGE_PATH = directory;
  process.env.TTS_SEGMENT_TARGET_CHARACTERS = "50";
  const spokenSegments = [];
  const provider = {
    async generateSpeech({ script, outputFilePath }) {
      spokenSegments.push(script);
      await writeFile(outputFilePath, new Uint8Array([spokenSegments.length]), { flag: "wx" });
      return { format: "mp3" };
    },
  };
  const script = "Première partie bien ordonnée. Deuxième partie bien ordonnée. Troisième partie finale.";
  try {
    const result = await generateSegmentedStoredAudio({
      script,
      provider,
      publish: async () => false,
    });
    assert.equal(result.published, false);
    assert.equal(spokenSegments.join(""), script);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    delete process.env.TTS_SEGMENT_TARGET_CHARACTERS;
    delete process.env.AUDIO_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});
