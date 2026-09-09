import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createSourceWriteTarget, finalizeSourceFile, getSourceStorageRoot, readSourceFile, removeSourceFile, resolveSourcePath, safeDownloadFileName, sourceContentDisposition, writeSourceTemporary } from "../lib/sources/storage.ts";
import { syntheticPdf, syntheticOdt } from "./helpers/source-fixtures.mjs";
import { readBoundedFormData } from "../lib/sources/request.ts";
import { ODT_MIME_TYPE, PDF_MIME_TYPE, validateSourceUpload } from "../lib/sources/validation.ts";

test("les uploads acceptent les signatures PDF et ODT, pas leur extension seule", () => {
  const pdf = syntheticPdf();
  assert.equal(validateSourceUpload({ fileName: "cours.pdf", declaredMime: PDF_MIME_TYPE, bytes: pdf }).mimeType, PDF_MIME_TYPE);
  const odt = syntheticOdt();
  assert.equal(validateSourceUpload({ fileName: "cours.odt", declaredMime: ODT_MIME_TYPE, bytes: odt }).mimeType, ODT_MIME_TYPE);
  assert.throws(() => validateSourceUpload({ fileName: "cours.pdf", declaredMime: PDF_MIME_TYPE, bytes: new Uint8Array([1, 2]) }), /refusé/i);
});

test("les formats croisés et le faux ZIP contenant seulement le MIME sont refusés", () => {
  for (const [fileName, declaredMime, bytes] of [
    ["x.odt", ODT_MIME_TYPE, syntheticPdf()], ["x.pdf", PDF_MIME_TYPE, syntheticOdt()],
    ["x.odt", ODT_MIME_TYPE, Buffer.from(`PK\u0003\u0004${ODT_MIME_TYPE}`)],
    ["x.pdf", "text/html", syntheticPdf()], ["x.pdf", PDF_MIME_TYPE, Buffer.from("%PDF-1.7 invalid")],
    ["x.pdf", PDF_MIME_TYPE, Buffer.from("%PDF-fake\n%%EOF")],
    ["x.odt", ODT_MIME_TYPE, syntheticOdt().subarray(0, 90)],
  ]) assert.throws(() => validateSourceUpload({ fileName, declaredMime, bytes }), /refusé/);
});

test("la limite s'applique sans Content-Length et annule la réception", async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8192)); }, cancel() { cancelled = true; } });
  const request = new Request("http://127.0.0.1/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" });
  await assert.rejects(readBoundedFormData(request, 1024), /file-too-large/);
  assert.equal(cancelled, true);
});

test("la taille du fichier reste plafonnée indépendamment de l'enveloppe multipart", () => {
  const previous = process.env.SOURCE_UPLOAD_MAX_BYTES;
  process.env.SOURCE_UPLOAD_MAX_BYTES = "100";
  try { assert.throws(() => validateSourceUpload({ fileName: "x.pdf", declaredMime: PDF_MIME_TYPE, bytes: syntheticPdf() }), /taille/); }
  finally { if (previous === undefined) delete process.env.SOURCE_UPLOAD_MAX_BYTES; else process.env.SOURCE_UPLOAD_MAX_BYTES = previous; }
});

test("un téléchargement Unicode produit uniquement des octets d'en-tête sûrs", () => {
  const header = sourceContentDisposition('../cours"\r\n世界 🦎.pdf');
  assert.doesNotMatch(header, /[\r\n]/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.match(header, /%E4%B8%96/);
  assert.doesNotThrow(() => new Headers({ "Content-Disposition": header }));
});

test("publication exclusive, absence d'écrasement et refus des liens", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-source-exclusive-"));
  const previous = process.env.SOURCE_STORAGE_ROOT;
  process.env.SOURCE_STORAGE_ROOT = directory;
  try {
    const target = await createSourceWriteTarget();
    await writeSourceTemporary(target.temporaryPath, syntheticPdf("first"));
    await writeFile(target.finalPath, "existing");
    await assert.rejects(finalizeSourceFile(target.temporaryPath, target.finalPath));
    assert.equal(await readFile(target.finalPath, "utf8"), "existing");
    const alias = path.join(directory, "alias");
    await symlink(directory, alias, "junction");
    process.env.SOURCE_STORAGE_ROOT = alias;
    await assert.rejects(createSourceWriteTarget(), /liens/);
    await assert.rejects(readSourceFile(target.storageKey), /liens/);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_STORAGE_ROOT; else process.env.SOURCE_STORAGE_ROOT = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("la production exige un stockage absolu explicitement configuré", () => {
  const environment = process.env.NODE_ENV, root = process.env.SOURCE_STORAGE_ROOT;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SOURCE_STORAGE_ROOT;
    assert.throws(getSourceStorageRoot, /persistant/);
    process.env.SOURCE_STORAGE_ROOT = "./storage/sources";
    assert.throws(getSourceStorageRoot, /persistant/);
    process.env.NODE_ENV = "test";
    process.env.SOURCE_STORAGE_ROOT = path.resolve("public/sources");
    assert.throws(getSourceStorageRoot, /public/);
  } finally {
    if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
    if (root === undefined) delete process.env.SOURCE_STORAGE_ROOT; else process.env.SOURCE_STORAGE_ROOT = root;
  }
});

test("le stockage source publie atomiquement une clé interne et reste hors public", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-source-"));
  process.env.SOURCE_STORAGE_ROOT = directory;
  try {
    const target = await createSourceWriteTarget();
    await writeSourceTemporary(target.temporaryPath, new Uint8Array([37, 80, 68, 70, 45]));
    await finalizeSourceFile(target.temporaryPath, target.finalPath);
    assert.equal(getSourceStorageRoot(), path.resolve(directory));
    assert.deepEqual([...await readFile(resolveSourcePath(target.storageKey))], [37, 80, 68, 70, 45]);
    assert.match(target.storageKey, /^[0-9a-f-]{36}$/i);
    await removeSourceFile(target.storageKey);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    delete process.env.SOURCE_STORAGE_ROOT;
    await rm(directory, { recursive: true, force: true });
  }
});

test("le nom de téléchargement neutralise les chemins et contrôles", () => {
  assert.equal(safeDownloadFileName("..\\secret\r\n.pdf"), "secret .pdf");
  assert.throws(() => resolveSourcePath("../secret"), /invalide/i);
});
