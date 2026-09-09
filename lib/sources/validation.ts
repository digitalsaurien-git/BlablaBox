import { createHash } from "node:crypto";
import path from "node:path";

export const DEFAULT_SOURCE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_MIME_TYPE = "application/pdf";
export const ODT_MIME_TYPE = "application/vnd.oasis.opendocument.text";

export function getSourceUploadMaxBytes(): number {
  const configured = Number(process.env.SOURCE_UPLOAD_MAX_BYTES ?? DEFAULT_SOURCE_UPLOAD_MAX_BYTES);
  if (!Number.isSafeInteger(configured) || configured <= 0 || configured > 2147483647 - 65536) throw new Error("Configuration de taille invalide.");
  return configured;
}

export function normalizeOriginalFileName(fileName: string): string {
  const baseName = path.posix.basename((fileName || "document-source").replace(/\\/g, "/"));
  return baseName.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 255) || "document-source";
}

// Inspect ZIP metadata only. Never inflate or interpret the educational content.
function isOdt(bytes: Uint8Array): boolean {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length < 100 || data.readUInt32LE(0) !== 0x04034b50) return false;
  if ((data.readUInt16LE(6) & ~0x0800) !== 0 || data.readUInt16LE(8) !== 0 || data.readUInt16LE(26) !== 8 || data.readUInt16LE(28) !== 0) return false;
  if (data.readUInt32LE(18) !== ODT_MIME_TYPE.length || data.readUInt32LE(22) !== ODT_MIME_TYPE.length) return false;
  if (data.subarray(30, 38).toString("ascii") !== "mimetype" || data.subarray(38, 38 + ODT_MIME_TYPE.length).toString("ascii") !== ODT_MIME_TYPE) return false;
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && data.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < Math.max(0, data.length - 65557)) return false;
  if (end + 22 + data.readUInt16LE(end + 20) !== data.length || data.readUInt32LE(end + 4) !== 0) return false;
  const count = data.readUInt16LE(end + 10);
  if (count !== data.readUInt16LE(end + 8)) return false;
  let cursor = data.readUInt32LE(end + 16);
  if (cursor + data.readUInt32LE(end + 12) !== end) return false;
  const names = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) return false;
    const length = data.readUInt16LE(cursor + 28);
    const next = cursor + 46 + length + data.readUInt16LE(cursor + 30) + data.readUInt16LE(cursor + 32);
    if (next > end) return false;
    const name = data.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    const offset = data.readUInt32LE(cursor + 42);
    if (offset + 30 > data.readUInt32LE(end + 16) || data.readUInt32LE(offset) !== 0x04034b50 || (data.readUInt16LE(cursor + 8) & 1)) return false;
    const contentEnd = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28) + data.readUInt32LE(cursor + 20);
    if (contentEnd > data.readUInt32LE(end + 16) || names.has(name)) return false;
    if (data.subarray(offset + 30, offset + 30 + data.readUInt16LE(offset + 26)).toString("utf8") !== name) return false;
    if (data.readUInt16LE(cursor + 10) !== data.readUInt16LE(offset + 8) || data.readUInt16LE(cursor + 8) !== data.readUInt16LE(offset + 6)) return false;
    if (name === "mimetype" && offset !== 0) return false;
    names.add(name);
    cursor = next;
  }
  return cursor === end && ["mimetype", "content.xml", "META-INF/manifest.xml"].every((name) => names.has(name));
}

export function detectSourceMime(fileName: string, declaredMime: string, bytes: Uint8Array): string {
  const extension = path.extname(fileName).toLowerCase();
  const declared = declaredMime.trim().toLowerCase();
  if (extension === ".pdf" && ["", PDF_MIME_TYPE, "application/octet-stream"].includes(declared) && /^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(Buffer.from(bytes.slice(0, 12)).toString("ascii")) && /%%EOF\s*$/.test(Buffer.from(bytes.slice(-1024)).toString("ascii"))) return PDF_MIME_TYPE;
  if (extension === ".odt" && ["", ODT_MIME_TYPE, "application/octet-stream", "application/zip"].includes(declared) && isOdt(bytes)) return ODT_MIME_TYPE;
  throw new Error("Format de source refusé.");
}

export function validateSourceUpload(input: {
  fileName: string;
  declaredMime: string;
  bytes: Uint8Array;
}): { fileName: string; mimeType: string; byteSize: number; sha256: string } {
  const fileName = normalizeOriginalFileName(input.fileName);
  const byteSize = input.bytes.byteLength;
  if (byteSize === 0) throw new Error("Le fichier source est vide.");
  if (byteSize > getSourceUploadMaxBytes()) throw new Error("Le fichier source dépasse la taille autorisée.");
  const mimeType = detectSourceMime(fileName, input.declaredMime, input.bytes);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  return { fileName, mimeType, byteSize, sha256 };
}
