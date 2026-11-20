// Lists the PDFs inside a ZIP (such as the European Patent Register "All documents" archive) without a library.
// Each entry decompresses only when read, so a large archive does not inflate every file at once.
export async function readZipPdfs(file) {
  if (file.size > 120 * 1024 * 1024) throw new Error('ZIP은 120 MiB까지 처리할 수 있습니다.');
  const data = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("ZIP 파일을 읽지 못했습니다. Register에서 ZIP Archive로 받은 파일인지 확인해 주세요.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff) throw new Error("4 GB를 넘는 ZIP(ZIP64)은 지원하지 않습니다.");
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP 목차가 손상되었습니다.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const skip = nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const path = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + skip;
    if (!/\.pdf$/i.test(path) || path.endsWith("/")) continue;
    if (entries.length >= 500) throw new Error('PDF가 500개를 넘습니다. ZIP을 나누어 주세요.');
    const entry = { name: path.split("/").pop(), path, size, encrypted: Boolean(flags & 1) };
    entry.read = () => inflateEntry(data, view, local, compressed, method, entry);
    entries.push(entry);
  }
  return entries;
}

async function inflateEntry(data, view, local, compressed, method, entry) {
  if (entry.encrypted) throw new Error("암호가 걸린 파일은 열 수 없습니다.");
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error("ZIP 항목이 손상되었습니다.");
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  if (start + compressed > data.length || entry.size > 3.5 * 1024 * 1024) throw new Error("PDF 용량 또는 ZIP 항목 크기를 확인해 주세요.");
  const raw = data.subarray(start, start + compressed);
  if (method === 0 && compressed === entry.size) return raw.slice();
  if (method !== 8) throw new Error("지원하지 않는 압축 방식입니다.");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const result = new Uint8Array(entry.size);
  let offset = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > result.length) {
      await reader.cancel();
      throw new Error("ZIP에 표시된 PDF 크기가 실제와 다릅니다.");
    }
    result.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== result.length) throw new Error("PDF가 끝나기 전에 ZIP 항목이 끊어졌습니다.");
  return result;
}
