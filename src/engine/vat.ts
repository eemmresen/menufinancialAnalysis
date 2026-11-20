/** KDV hesapları. Oranlar her zaman ondalık olarak tutulur (0.20 = %20). */

export function netFromGross(gross: number, vatRate: number): number {
  if (!Number.isFinite(gross)) return 0;
  if (!vatRate) return gross;
  return gross / (1 + vatRate);
}

export function grossFromNet(net: number, vatRate: number): number {
  if (!Number.isFinite(net)) return 0;
  return net * (1 + vatRate);
}

export function vatFromGross(gross: number, vatRate: number): number {
  return gross - netFromGross(gross, vatRate);
}

export function vatFromNet(net: number, vatRate: number): number {
  return net * vatRate;
}

/** KDV dahil tutarı, hariç tutar + KDV olarak ayırır. */
export function splitGross(gross: number, vatRate: number): { net: number; vat: number } {
  const net = netFromGross(gross, vatRate);
  return { net, vat: gross - net };
}
