import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la page projet expose le lecteur continu sans chemin physique", async () => {
  const source = await readFile("app/projects/[id]/page.tsx", "utf8");
  assert.match(source, /ContinuousAudioPlayer/);
  assert.match(source, /audio\?segment=/);
  assert.doesNotMatch(source, /project\.audioFilePath[^)]*src=/);
});

test("le lecteur conserve le HTML audio pour 1 MP3 et utilise Web Audio pour 1, 2 ou 3 segments", async () => {
  const source = await readFile("components/continuous-audio-player.tsx", "utf8");
  assert.match(source, /if \(!segmented\)/);
  assert.match(source, /<audio controls preload="metadata"/);
  assert.match(source, /createAudioContext/);
  assert.match(source, /decodeAudioData/);
  assert.match(source, /createBufferSource/);
  assert.match(source, /source\.start\(nextStartTime, offsetInBuffer\)/);
  assert.match(source, /await audioContext\.resume\(\)/);
  assert.match(source, /Promise\.all/);
  assert.doesNotMatch(source, /audio\.play\s*\(/);
  for (const segmentCount of [1, 2, 3]) {
    const fixtures = Array.from({ length: segmentCount }, (_, index) => `/api/projects/demo/audio?segment=${index}`);
    assert.equal(fixtures.length, segmentCount);
    if (segmentCount === 1) {
      assert.match(source, /if \(!segmented\)/);
    } else {
      assert.match(source, /sources\.map\(\(source, index\)/);
      assert.match(source, /Le téléchargement reste composé de \{sources\.length\} MP3 ordonnés/);
    }
  }
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
