import type { AppSettings, Material, Product, ProductCost } from '@/types';
import { computeProductCost } from './cost';
import { round2, roundPriceUp } from './money';

/** Mevcut fiyata göre 4 senaryo üretir (±%20, ±%40 gibi değil; ±%20 ve ±%40). */
export function buildScenarioPrices(
  currentPrice: number,
  settings: AppSettings,
  count = 4,
): number[] {
  const base = currentPrice > 0 ? currentPrice : 100;
  const multipliers = [0.8, 1, 1.2, 1.4];
  const prices = multipliers.slice(0, count).map((m) => roundPriceUp(base * m, settings.priceRounding));
  return [...new Set(prices)];
}

export interface ScenarioResult {
  price: number;
  cost: ProductCost;
}

/** Farklı satış fiyatları için maliyet/kârlılık senaryoları. */
export function simulatePrices(
  product: Product,
  materials: Material[],
  settings: AppSettings,
  prices: number[],
  overheadPerUnit: number,
  overheadAvailable: boolean,
): ScenarioResult[] {
  return prices
    .filter((p) => Number.isFinite(p) && p >= 0)
    .map((price) => ({
      price: round2(price),
      cost: computeProductCost({
        product: { ...product, salePrice: price },
        materials,
        settings,
        overheadPerUnit,
        overheadAvailable,
      }),
    }));
}
