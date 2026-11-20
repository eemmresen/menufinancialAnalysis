/** Dosyanın SHA-256 özeti. Mükerrer fatura kontrolünde kullanılır. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // SubtleCrypto yoksa (http üzerinden açılmış sayfa) dosya boyutu + adı tabanlı zayıf özet
  const bytes = new Uint8Array(buffer.slice(0, 4096));
  let hash = 0;
  for (const byte of bytes) hash = (hash * 31 + byte) >>> 0;
  return `fallback-${buffer.byteLength}-${hash.toString(16)}`;
}

export async function hashFile(file: File): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}
