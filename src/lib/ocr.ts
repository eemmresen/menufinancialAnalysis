/**
 * Tesseract.js ile tamamen yerel OCR. Dil paketi ve çekirdek dosyaları
 * public/ocr altında bulunur; internet bağlantısı gerekmez.
 */
export async function ocrImage(
  file: File,
  onProgress?: (progress: number, status: string) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = import.meta.env.BASE_URL || '/';

  const worker = await createWorker('tur', 1, {
    workerPath: `${base}ocr/worker.min.js`,
    corePath: `${base}ocr/core`,
    langPath: `${base}ocr`,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress?.(message.progress ?? 0, 'Metin okunuyor');
      } else if (message.status) {
        onProgress?.(message.progress ?? 0, 'OCR hazırlanıyor');
      }
    },
  });

  try {
    const result = await worker.recognize(file);
    return result.data.text?.trim() ?? '';
  } finally {
    await worker.terminate();
  }
}
