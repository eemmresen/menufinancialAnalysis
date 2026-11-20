/** Görseli tarayıcıda küçültüp data URL'e çevirir (IndexedDB'de az yer kaplar). */
export async function fileToDataUrl(file: File, maxDim = 720, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Sadece görsel dosyası seçilebilir.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Görsel 8 MB’dan büyük olamaz.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Görsel işlenemedi.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}
