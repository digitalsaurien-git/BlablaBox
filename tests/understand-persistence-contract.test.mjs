import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la régénération écrit contenu et sources dans une transaction après succès", async () => {
  const source = await readFile("app/understand/actions.ts", "utf8");
  const providerCall = source.indexOf("generateLearningContent");
  const transaction = source.indexOf("prisma.$transaction", providerCall);
  assert.ok(providerCall >= 0);
  assert.ok(transaction > providerCall);
  assert.match(source, /contentVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(source, /sources:\s*\{[\s\S]*deleteMany:\s*\{\}[\s\S]*create:\s*sourceWrites/);
});

test("l'échec ne remplace ni script, ni version, ni sources, ni audio", async () => {
  const source = await readFile("app/understand/actions.ts", "utf8");
  const failureBlock = source.slice(source.lastIndexOf("} catch (error)"));
  assert.match(failureBlock, /scriptStatus:\s*"SCRIPT_FAILED"/);
  assert.match(failureBlock, /errorMessage:/);
  assert.doesNotMatch(failureBlock, /contentVersion:/);
  assert.doesNotMatch(failureBlock, /sources:/);
  assert.doesNotMatch(failureBlock, /audioStatus:/);
});

test("le versionnement audio protège l'écriture et le lecteur", async () => {
  const action = await readFile("app/projects/actions.ts", "utf8");
  const page = await readFile("app/projects/[id]/page.tsx", "utf8");
  const route = await readFile("app/api/projects/[id]/audio/route.ts", "utf8");
  assert.match(action, /audioContentVersion:\s*contentVersion/);
  assert.match(action, /where:\s*\{\s*id:\s*project\.id,\s*contentVersion\s*\}/);
  assert.match(page, /project\.audioContentVersion\s*!==\s*null/);
  assert.match(page, /project\.audioContentVersion\s*===\s*project\.contentVersion/);
  assert.match(page, /storedAudioExists\(project\.audioFilePath\)/);
  assert.match(route, /project\.audioContentVersion\s*!==\s*project\.contentVersion/);
});
