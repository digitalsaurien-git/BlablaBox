import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la page projet expose le lecteur continu sans chemin physique", async () => {
  const source = await readFile("app/projects/[id]/page.tsx", "utf8");
  assert.match(source, /ContinuousAudioPlayer/);
  assert.match(source, /audio\?segment=/);
  assert.doesNotMatch(source, /project\.audioFilePath[^)]*src=/);
});

test("le lecteur enchaîne automatiquement les segments et propose leur téléchargement", async () => {
  const source = await readFile("components/continuous-audio-player.tsx", "utf8");
  assert.match(source, /onEnded=\{handleEnded\}/);
  assert.match(source, /void audio\.play\(\)/);
  assert.match(source, /audio\.src = sources\[nextIndex\]/);
  assert.match(source, /setCurrentIndex\(nextIndex\)/);
  assert.match(source, /Télécharger la partie/);
  assert.match(source, /Aucune concaténation MP3 fragile/);
});

test("la route audio recherche le projet et retourne 404 sans fichier", async () => {
  const source = await readFile("app/api/projects/[id]/audio/route.ts", "utf8");
  assert.match(source, /prisma\.project\.findUnique/);
  assert.match(source, /status: 404/);
  assert.match(source, /getStoredAudioPlayback\(project\.audioFilePath\)/);
  assert.match(source, /resolveStoredAudioPath\(selectedSegment\.fileName\)/);
  assert.match(source, /segmentIndex/);
});

test("la publication audio reste conditionnée à la version et nettoie l'obsolète", async () => {
  const actions = await readFile("app/projects/actions.ts", "utf8");
  const orchestration = await readFile("lib/segmented-audio-generation.ts", "utf8");
  assert.match(actions, /id: project\.id, contentVersion, audioStatus: "PENDING"/);
  assert.match(actions, /return saved\.count > 0/);
  assert.match(orchestration, /if \(!published\)/);
  assert.match(orchestration, /removeStoredAudio\(manifestFileName\)/);
  assert.match(actions, /removeStoredAudio\(project\.audioFilePath\)/);
});

test("la suppression d'un projet supprime aussi la référence audio stockée", async () => {
  const actions = await readFile("app/projects/actions.ts", "utf8");
  assert.match(actions, /prisma\.project\.delete\(\{ where: \{ id: projectId \} \}\)/);
  assert.match(actions, /removeStoredAudio\(project\.audioFilePath\)/);
});
