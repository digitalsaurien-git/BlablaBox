import { inflateRawSync, inflateSync } from "node:zlib";
import { ODT_MIME_TYPE, PDF_MIME_TYPE } from "./validation.ts";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_XML_BYTES = 512 * 1024;
const MAX_PDF_PAGES = 5;
const MAX_STREAMS = 24;
const MAX_TEXT_CHARS = 12_000;

export type ExtractedDocumentText = { title: string | null; text: string; readable: boolean };

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}

function decodeXml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function findZipEntry(bytes: Uint8Array, wantedName: string): Uint8Array | null {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, MAX_INPUT_BYTES));
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65_557) && data.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < Math.max(0, data.length - 65_557)) return null;
  const count = Math.min(data.readUInt16LE(end + 10), 256);
  let cursor = data.readUInt32LE(end + 16);
  for (let index = 0; index < count && cursor + 46 <= end; index += 1) {
    if (data.readUInt32LE(cursor) !== 0x02014b50) return null;
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const uncompressedSize = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (name === wantedName) {
      if ((flags & 1) !== 0 || ![0, 8].includes(method) || compressedSize > MAX_XML_BYTES || uncompressedSize > MAX_XML_BYTES) return null;
      const local = data.readUInt32LE(cursor + 42);
      if (local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
      const compressed = data.subarray(start, start + compressedSize);
      if (compressed.length !== compressedSize) return null;
      try {
        const result = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES });
        return result.byteLength <= MAX_XML_BYTES ? result : null;
      } catch { return null; }
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function extractOdt(bytes: Uint8Array): ExtractedDocumentText {
  const content = findZipEntry(bytes, "content.xml");
  const metadata = findZipEntry(bytes, "meta.xml");
  const titleMatch = metadata ? Buffer.from(metadata).toString("utf8").match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i) : null;
  const title = titleMatch ? compact(decodeXml(titleMatch[1])) || null : null;
  const text = content ? compact(decodeXml(Buffer.from(content).toString("utf8"))) : "";
  return { title, text, readable: text.length >= 12 };
}

function decodePdfLiteral(value: string): string {
  return value.replace(/\\([nrtbf()\\])/g, (_, code: string) => ({ n: "\n", r: "\r", t: "\t", b: " ", f: " ", "(": "(", ")": ")", "\\": "\\" })[code] ?? " ")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
}

function pdfStrings(value: string): string[] {
  const strings: string[] = [];
  for (const match of value.matchAll(/\(((?:\\.|[^\\()]){1,1000})\)\s*(?:Tj|'|"|\])/g)) strings.push(decodePdfLiteral(match[1]));
  return strings;
}

function extractPdf(bytes: Uint8Array): ExtractedDocumentText {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, MAX_INPUT_BYTES));
  const source = data.toString("latin1");
  const titleMatch = source.match(/\/Title\s*\(((?:\\.|[^\\()]){1,500})\)/);
  const title = titleMatch ? compact(decodePdfLiteral(titleMatch[1])) || null : null;
  const pageContentIds = new Set([...source.matchAll(/\/Type\s*\/Page\b[\s\S]{0,2000}?\/Contents\s+(?:(\d+)\s+\d+\s+R|\[([^\]]+)\])/g)]
    .slice(0, MAX_PDF_PAGES)
    .flatMap((match) => match[1] ? [match[1]] : [...(match[2] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)].map((reference) => reference[1])));
  const collected: string[] = [];
  let cursor = 0;
  const deadline = Date.now() + 100;
  for (let count = 0; count < MAX_STREAMS; count += 1) {
    if (Date.now() > deadline) break;
    const marker = source.indexOf("stream", cursor);
    if (marker < 0) break;
    const start = marker + 6 + (source.slice(marker + 6, marker + 8) === "\r\n" ? 2 : 1);
    const end = source.indexOf("endstream", start);
    if (end < 0 || end - start > 1024 * 1024) break;
    const dictionary = source.slice(Math.max(0, marker - 400), marker);
    const objectHeaders = [...source.slice(Math.max(0, marker - 1200), marker).matchAll(/(\d+)\s+\d+\s+obj/g)];
    const objectId = objectHeaders.at(-1)?.[1];
    if (pageContentIds.size && (!objectId || !pageContentIds.has(objectId))) { cursor = end + 9; continue; }
    let stream = data.subarray(start, end);
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { stream = inflateSync(stream, { maxOutputLength: 512 * 1024 }); } catch { cursor = end + 9; continue; }
    }
    const decoded = stream.toString("latin1");
    for (const block of decoded.matchAll(/BT([\s\S]{0,100000}?)ET/g)) {
      collected.push(...pdfStrings(block[1]));
      if (Date.now() > deadline) break;
    }
    if (collected.join(" ").length >= MAX_TEXT_CHARS) break;
    cursor = end + 9;
  }
  const text = compact(collected.join(" "));
  return { title, text, readable: text.length >= 12 };
}

export function extractDocumentText(bytes: Uint8Array, mimeType: string): ExtractedDocumentText {
  if (mimeType === PDF_MIME_TYPE) return extractPdf(bytes);
  if (mimeType === ODT_MIME_TYPE) return extractOdt(bytes);
  return { title: null, text: "", readable: false };
}
