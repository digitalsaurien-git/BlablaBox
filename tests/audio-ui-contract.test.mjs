import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la page projet expose le lecteur et le téléchargement sans chemin physique", async () => {
  const source = await readFile("app/projects/[id]/page.tsx", "utf8");
  assert.match(source, /<audio controls/);
  assert.match(source, /audio\?download=1/);
  assert.doesNotMatch(source, /project\.audioFilePath[^)]*src=/);
});

test("la route audio recherche le projet et retourne 404 sans fichier", async () => {
  const source = await readFile("app/api/projects/[id]/audio/route.ts", "utf8");
  assert.match(source, /prisma\.project\.findUnique/);
  assert.match(source, /status: 404/);
  assert.match(source, /resolveStoredAudioPath\(project\.audioFilePath\)/);
});
