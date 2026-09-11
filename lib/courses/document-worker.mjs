import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const MAX_UNITS = 40;
const MAX_TEXT = 200000;
const MAX_EXPANDED = 64 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const units = [];
let totalText = 0;
function add(unit) {
  totalText += unit.text.length;
  if (units.length >= MAX_UNITS || totalText > MAX_TEXT) throw new Error('document-limit');
  units.push({ ...unit, hash: hash(unit.image ? Buffer.from(unit.image, 'base64') : unit.text) });
}

async function pdf(bytes) {
  const canvas = await import('@napi-rs/canvas');
  globalThis.DOMMatrix = canvas.DOMMatrix;
  globalThis.ImageData = canvas.ImageData;
  globalThis.Path2D = canvas.Path2D;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({data: bytes, isEvalSupported:false, useSystemFonts:true, disableFontFace:true});
  const doc = await task.promise;
  if (doc.numPages > MAX_UNITS) throw new Error('document-limit');
  try {
    for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex++) {
      const page = await doc.getPage(pageIndex);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str ?? '').join(' ').trim();
      const operators = await page.getOperatorList();
      const hasImage = operators.fnArray.some(op => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(op));
      const needsVision = text.replace(/\W/g, '').length < 40 || hasImage;
      let image;
      if (needsVision) {
        const base = page.getViewport({scale:1});
        const viewport = page.getViewport({scale: Math.min(2, 1800 / Math.max(base.width, base.height))});
        if (!Number.isFinite(viewport.width) || viewport.width <= 0 || viewport.height <= 0) throw new Error('document-invalid');
        const surface = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({canvasContext:surface.getContext('2d'), viewport}).promise;
        image = surface.toBuffer('image/png').toString('base64');
      }
      add({key:`page-${pageIndex}`,label:`Page ${pageIndex}`,text,needsVision,image,mime:'image/png'});
      page.cleanup();
    }
  } finally { await task.destroy(); }
}

function odt(bytes) {
  let expanded = 0;
  const entries = unzipSync(bytes, {filter: file => {
    if (!(file.name === 'content.xml' || file.name.startsWith('Pictures/'))) return false;
    expanded += file.originalSize;
    if (file.originalSize > 16*1024*1024 || expanded > MAX_EXPANDED) throw new Error('document-limit');
    return true;
  }});
  const xml = new TextDecoder().decode(entries['content.xml'] ?? new Uint8Array());
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('document-invalid');
  const tree = new XMLParser({preserveOrder:true,ignoreAttributes:false,processEntities:true}).parse(xml);
  let text = ''; let imageIndex = 0; let block = 0;
  function flush() { if(text.trim()) {block++; add({key:`text-${block}`,label:`Passage ${block}`,text:text.trim(),needsVision:false});text='';} }
  function walk(nodes) {
    for(const node of nodes) {
      if(node['#text'] !== undefined) {text += String(node['#text']) + ' ';continue;}
      for(const [tag, children] of Object.entries(node)) {
        if(tag === ':@') continue;
        if(tag === 'draw:image') {
          flush(); imageIndex++;
          const name = node[':@']?.['@_xlink:href'];
          if(typeof name !== 'string' || !/^Pictures\/[\w .-]+$/.test(name) || !entries[name]) throw new Error('image-unavailable');
          const image = entries[name];
          const isPng = Buffer.from(image.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const isJpg = image[0]===255 && image[1]===216 && image[2]===255;
          if(!isPng && !isJpg) throw new Error('image-format');
          add({key:`image-${imageIndex}`,label:`Image ${imageIndex}`,text:'',needsVision:true,image:Buffer.from(image).toString('base64'),mime:isPng?'image/png':'image/jpeg'});
        } else if(Array.isArray(children)) {walk(children);if(tag==='text:p'||tag==='text:h') text+='\n';}
      }
    }
  }
  walk(tree);flush();
}

try {
  const bytes = new Uint8Array(workerData.bytes);
  if(bytes.length > 26214400) throw new Error('document-limit');
  if(workerData.mime === 'application/pdf') await pdf(bytes);
  else if(workerData.mime === 'application/vnd.oasis.opendocument.text') odt(bytes);
  else throw new Error('document-format');
  parentPort.postMessage({units});
} catch { parentPort.postMessage({error:'Le document ne peut pas être lu entièrement dans les limites prévues (40 pages ou images).'}); }
