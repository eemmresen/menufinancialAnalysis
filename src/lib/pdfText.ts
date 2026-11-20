interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

/**
 * PDF metnini tarayıcıda (pdf.js) çıkarır. Satırlar Y koordinatına göre gruplanır;
 * böylece fatura tabloları okunabilir hale gelir.
 */
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const output: string[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    onProgress?.(pageNo, doc.numPages);
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items as PdfTextItem[];

    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of items) {
      if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const x = item.transform[4];
      const list = rows.get(y) ?? [];
      list.push({ x, text: item.str });
      rows.set(y, list);
    }

    const sortedY = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const parts = (rows.get(y) ?? []).sort((a, b) => a.x - b.x).map((p) => p.text.trim());
      const line = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (line) output.push(line);
    }
    output.push('');
  }

  await doc.destroy();
  return output.join('\n').trim();
}
