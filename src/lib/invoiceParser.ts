import type { Unit } from '@/types';
import { todayISO } from './dates';
import { round2 } from '@/engine/money';

export interface ParsedLine {
  description: string;
  qty: number;
  unit: Unit;
  unitPrice: number;
  vatRate: number;
  confidence: number;
}

export interface ParsedInvoice {
  supplierName: string;
  date: string;
  totalGross: number;
  vatTotal: number;
  lines: ParsedLine[];
  warnings: string[];
}

const NUMBER_RE = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|-?\d+(?:[.,]\d+)?/g;
const DATE_RE = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

export function parseTrNumber(text: string): number {
  const clean = text.trim().replace(/\s|₺|TL/gi, '');
  if (!clean) return 0;
  let normalized: string;
  if (clean.includes(',')) {
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    // "1.500" Türkçe binlik ayırıcı, "12.5" ondalık
    normalized = clean.replace(/\./g, '');
  } else {
    normalized = clean;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function numbersIn(line: string): number[] {
  return [...line.matchAll(NUMBER_RE)].map((m) => parseTrNumber(m[0])).filter((n) => Number.isFinite(n));
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function detectDate(lines: string[]): { date: string; confident: boolean } {
  for (const line of lines.slice(0, 40)) {
    if (!/tarih|düzenleme|fatura/i.test(line) && lines.indexOf(line) > 8) continue;
    const iso = line.match(ISO_DATE_RE);
    if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, confident: true };
    const d = line.match(DATE_RE);
    if (d) {
      const day = d[1].padStart(2, '0');
      const month = d[2].padStart(2, '0');
      const year = d[3].length === 2 ? `20${d[3]}` : d[3];
      return { date: `${year}-${month}-${day}`, confident: true };
    }
  }
  // Tarih anahtar kelimesi olmadan ilk tarih benzeri ifade
  for (const line of lines.slice(0, 25)) {
    const d = line.match(DATE_RE);
    if (d) {
      const day = d[1].padStart(2, '0');
      const month = d[2].padStart(2, '0');
      const year = d[3].length === 2 ? `20${d[3]}` : d[3];
      return { date: `${year}-${month}-${day}`, confident: false };
    }
  }
  return { date: todayISO(), confident: false };
}

function detectSupplier(lines: string[]): { name: string; confident: boolean } {
  const skip =
    /fatura|e-?arşiv|e-?fatura|sayfa|tarih|vkn|tckn|vergi|tel|faks|adres|iban|www\.|@|toplam|kdv|miktar|birim|açıklama|sıra/i;
  const candidates = lines
    .slice(0, 12)
    .filter((line) => !skip.test(line))
    .filter((line) => /[a-zA-ZçğıöşüÇĞİÖŞÜ]{3}/.test(line))
    .filter((line) => !/^\d[\d\s.,/-]*$/.test(line));

  const scored = candidates
    .map((line) => {
      let score = line.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').length;
      if (/a\.?ş|ltd|şti|tic|gıda|market|kahve|petra|roasting/i.test(line)) score += 8;
      if (line.length > 60) score -= 10;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { name: '', confident: false };
  return { name: scored[0].line.slice(0, 80), confident: scored[0].score > 12 };
}

function detectTotal(lines: string[]): { total: number; confident: boolean; vat: number } {
  let total = 0;
  let confident = false;
  let vat = 0;

  for (const line of lines) {
    if (/genel toplam|ödenecek tutar|fatura toplam|toplam tutar/i.test(line)) {
      const nums = numbersIn(line);
      const candidate = nums[nums.length - 1];
      if (candidate && candidate > total) {
        total = candidate;
        confident = true;
      }
    }
  }

  for (const line of lines) {
    if (/toplam\s*kdv|kdv\s*toplam|hesaplanan kdv/i.test(line)) {
      const nums = numbersIn(line);
      const candidate = nums[nums.length - 1];
      if (candidate && candidate > vat) vat = candidate;
    }
  }

  if (!confident) {
    // "toplam" içeren satırlardan en büyük tutar
    for (const line of lines) {
      if (/\btoplam\b/i.test(line)) {
        const nums = numbersIn(line);
        const candidate = nums[nums.length - 1];
        if (candidate && candidate > total) total = candidate;
      }
    }
  }

  if (!total) {
    const all = lines.flatMap(numbersIn).filter((n) => n >= 1);
    total = all.length > 0 ? Math.max(...all) : 0;
  }

  return { total: round2(total), confident, vat: round2(vat) };
}

function detectUnit(line: string): Unit {
  const lower = line.toLocaleLowerCase('tr-TR');
  if (/\bkg\b|kilogram/.test(lower)) return 'kg';
  if (/\bgr?\b|gram/.test(lower)) return 'g';
  if (/\blt?\b|litre/.test(lower)) return 'l';
  if (/\bml\b|mililitre/.test(lower)) return 'ml';
  return 'adet';
}

function detectVatRate(line: string): number {
  const match = line.match(/%\s*(\d{1,2})/);
  if (match) {
    const value = Number(match[1]);
    if ([0, 1, 8, 10, 18, 20].includes(value)) return value / 100;
  }
  return 0.2;
}

const LINE_SKIP =
  /toplam|kdv|ara toplam|fatura|tarih|vkn|tckn|vergi|adres|tel|faks|iban|banka|sayfa|irsaliye|sipariş|açıklama|miktar|birim fiyat|tutar|iskonto|tevkifat|not:|www\.|@/i;

function parseLines(lines: string[]): ParsedLine[] {
  const result: ParsedLine[] = [];
  for (const line of lines) {
    if (LINE_SKIP.test(line)) continue;
    if (line.length < 6) continue;
    const numbers = numbersIn(line);
    if (numbers.length < 2) continue;
    if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]{3}/.test(line)) continue;

    // 2 sayı varsa: "açıklama 2 kg 450,00" -> miktar + birim fiyat
    // 3+ sayı varsa: "... 2 kg 450,00 900,00" -> miktar + birim fiyat + satır toplamı
    const last = numbers[numbers.length - 1];
    const previous = numbers[numbers.length - 2];
    const qtyUnitMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|lt|l|ml|adet|paket)\b/i);

    let qty = 1;
    let unitPrice = previous;
    let total = last;

    if (numbers.length >= 3) {
      const beforePrevious = numbers[numbers.length - 3];
      if (beforePrevious > 0 && beforePrevious < 10000) qty = beforePrevious;
    } else if (qtyUnitMatch) {
      qty = parseTrNumber(qtyUnitMatch[1]);
      unitPrice = last;
      total = qty * unitPrice;
    } else {
      qty = 1;
      unitPrice = previous;
      total = last;
    }

    if (total <= 0 || unitPrice <= 0) continue;

    let description = line;
    // Sondaki sayıları ve birimleri temizle
    for (const n of [total, unitPrice, qty]) {
      const raw = n.toString();
      description = description.replace(raw, ' ');
    }
    description = description
      .replace(/[%₺]?\d+([.,]\d+)?/g, ' ')
      .replace(/\b(adet|kg|g|gr|lt|l|ml|x|\*)\b/gi, ' ')
      .replace(/[|;]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (description.length < 3) continue;
    if (/^\d[\d\s.,]*$/.test(description)) continue;

    // Aynı açıklama iki kez eklenmesin
    if (result.some((r) => r.description.toLocaleLowerCase('tr-TR') === description.toLocaleLowerCase('tr-TR')))
      continue;

    result.push({
      description: description.slice(0, 120),
      qty: qty > 0 ? qty : 1,
      unit: detectUnit(line),
      unitPrice: round2(unitPrice),
      vatRate: detectVatRate(line),
      confidence: numbers.length >= 3 ? 0.6 : 0.4,
    });
    if (result.length >= 40) break;
  }
  return result;
}

/** Fatura metnini en iyi çaba ile ayrıştırır. Sonuç her zaman kullanıcı onayına sunulur. */
export function parseInvoiceText(text: string): ParsedInvoice {
  const warnings: string[] = [];
  const lines = normalizeLines(text);

  if (lines.length === 0) {
    return {
      supplierName: '',
      date: todayISO(),
      totalGross: 0,
      vatTotal: 0,
      lines: [],
      warnings: ['Belgede okunabilir metin bulunamadı. Alanları elle doldurun.'],
    };
  }

  const supplier = detectSupplier(lines);
  const date = detectDate(lines);
  const totals = detectTotal(lines);
  const parsedLines = parseLines(lines);

  if (!supplier.confident) warnings.push('Tedarikçi adı düşük güvenle okundu, kontrol edin.');
  if (!date.confident) warnings.push('Fatura tarihi net okunamadı, kontrol edin.');
  if (!totals.confident) warnings.push('Genel toplam net okunamadı, kontrol edin.');
  if (parsedLines.length === 0) {
    warnings.push('Satır kalemleri okunamadı. Kalemleri elle ekleyebilirsiniz.');
  }
  if (totals.vat > totals.total && totals.total > 0) {
    warnings.push('KDV tutarı toplamdan büyük görünüyor, kontrol edin.');
  }

  return {
    supplierName: supplier.name,
    date: date.date,
    totalGross: totals.total,
    vatTotal: totals.vat,
    lines: parsedLines,
    warnings,
  };
}
