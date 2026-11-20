const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('tr-TR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${moneyFormatter.format(value)} ₺`;
}

export function formatMoneyShort(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return compactFormatter.format(value);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormatter.format(value);
}

export function formatQty(value: number, unit?: string): string {
  const text = Number.isInteger(value) ? formatNumber(value) : numberFormatter.format(value);
  return unit ? `${text} ${unit}` : text;
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '—';
  return `%${(ratio * 100).toFixed(digits).replace('.', ',')}`;
}

export function formatRateInput(rate: number): string {
  return (rate * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/** "12,5" veya "12.5" metnini sayıya çevirir. */
export function parseNumber(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Kullanıcı yazarken ondalık ayırıcıyı koruyan sayı ayrıştırma. */
export function parseDecimal(value: string): number {
  if (!value) return 0;
  const trimmed = value.trim().replace(/\s/g, '');
  const hasComma = trimmed.includes(',');
  const normalized = hasComma ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
