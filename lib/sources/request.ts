// Bound the bytes read even for chunked requests or a dishonest Content-Length.
// Multipart overhead has a separate, small allowance; the file limit is checked too.
export async function readBoundedFormData(request: Request, fileLimit: number): Promise<FormData> {
  const limit = fileLimit + 64 * 1024;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new Error("file-too-large");
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data;") || !request.body) throw new Error("invalid-upload");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("file-too-large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new Response(bytes, { headers: { "Content-Type": type } }).formData();
}
