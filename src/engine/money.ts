/** Para ve yuvarlama yardımcıları. Tüm parasal sonuçlar kuruş hassasiyetinde yuvarlanır. */

/** 2 ondalığa yuvarlar (kuruş). Float hatalarına karşı epsilon düzeltmesi içerir. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * 100) / 100;
}

/** Oranları 4 ondalığa yuvarlar (gösterim ve karşılaştırma için). */
export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * 10000) / 10000;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeDiv(a: number, b: number): number {
  if (!b || !Number.isFinite(b)) return 0;
  return a / b;
}

export type RoundingStep = 'none' | '0.5' | '1' | '5';

/** Önerilen satış fiyatını yukarı doğru adıma yuvarlar (asla aşağı yuvarlamaz). */
export function roundPriceUp(value: number, step: RoundingStep): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const size = step === 'none' ? 0 : Number(step);
  if (!size) return round2(value);
  return round2(Math.ceil(value / size - 1e-9) * size);
}

/** Oranı yüzde metnine çevirir: 0.2 -> "%20" */
export function formatRate(rate: number): string {
  const pct = round4(rate * 100);
  return `%${pct.toString().replace('.', ',')}`;
}
