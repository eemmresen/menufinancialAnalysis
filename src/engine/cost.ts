import type { AppSettings, Material, Product, ProductCost } from '@/types';
import { round2, round4, safeDiv } from './money';
import { computeRecipeCost } from './recipe';
import { netFromGross } from './vat';

export interface CostInput {
  product: Product;
  materials: Material[];
  settings: AppSettings;
  /** Ürüne düşen aylık genel gider payı (TL/adet) */
  overheadPerUnit?: number;
  /** Satış verisi var mı? Yoksa genel gider payı hesaplanamaz. */
  overheadAvailable?: boolean;
}

/**
 * Tek bir ürünün tam maliyet ve kârlılık dökümünü üretir.
 * Saf fonksiyondur: aynı girdi her zaman aynı sonucu verir.
 */
export function computeProductCost(input: CostInput): ProductCost {
  const { product, materials, settings } = input;
  const materialsById = Object.fromEntries(materials.map((m) => [m.id, m]));
  const recipe = computeRecipeCost(product, materialsById);
  const warnings = [...recipe.warnings];

  const grossRevenue = round2(Math.max(product.salePrice || 0, 0));
  const netRevenue = round2(netFromGross(grossRevenue, product.vatRate));
  const vatAmount = round2(grossRevenue - netRevenue);

  const materialBaseCost = round2(recipe.materialBaseCost);
  const materialFireCost = round2(recipe.materialFireCost);
  const productFireCost = round2(recipe.productFireCost);
  const fireCost = round2(materialFireCost + productFireCost);
  const materialCost = round2(materialBaseCost + fireCost);

  const packagingCost = round2(Math.max(product.packagingCost || 0, 0));

  const laborCost = round2(
    product.laborMode === 'minutes'
      ? (Math.max(product.laborMinutes || 0, 0) / 60) * Math.max(settings.hourlyLaborCost || 0, 0)
      : Math.max(product.laborCost || 0, 0),
  );

  const commissionRate = Math.min(Math.max(product.commissionRate || 0, 0), 0.99);
  const commissionCost = round2(netRevenue * commissionRate);

  const variableCost = round2(materialCost + packagingCost + laborCost + commissionCost);

  const overheadAvailable = Boolean(input.overheadAvailable);
  const overheadPerUnit = overheadAvailable ? round2(Math.max(input.overheadPerUnit || 0, 0)) : 0;

  const totalCost = round2(variableCost + overheadPerUnit);
  const contribution = round2(netRevenue - variableCost);
  const contributionRatio = round4(safeDiv(contribution, netRevenue));
  const operatingProfit = round2(contribution - overheadPerUnit);
  const operatingMargin = round4(safeDiv(operatingProfit, netRevenue));

  const otherVariableCost = round2(materialCost + packagingCost + laborCost + overheadPerUnit);
  const breakEvenPriceNet =
    commissionRate < 1 ? round2(otherVariableCost / (1 - commissionRate)) : null;
  const breakEvenPriceGross =
    breakEvenPriceNet === null ? null : round2(breakEvenPriceNet * (1 + product.vatRate));

  const targetMargin = Math.min(Math.max(settings.targetMargin || 0, 0), 0.95);
  const targetDenominator = 1 - commissionRate - targetMargin;
  const targetPriceNet = targetDenominator > 0 ? round2(otherVariableCost / targetDenominator) : null;
  const targetPriceGross =
    targetPriceNet === null ? null : round2(targetPriceNet * (1 + product.vatRate));

  if (product.recipe.length === 0) warnings.push('Reçete boş; hammadde maliyeti 0 görünüyor.');
  if (grossRevenue <= 0) warnings.push('Satış fiyatı girilmemiş.');
  if (!overheadAvailable) warnings.push('Satış verisi olmadığı için genel gider payı hesaplanmadı.');
  if (targetDenominator <= 0) {
    warnings.push('Komisyon oranı + hedef kâr marjı %100 veya üzeri; hedef fiyat hesaplanamıyor.');
  }
  if (contribution < 0) warnings.push('Katkı payı negatif: satış fiyatı değişken maliyetin altında.');
  if (operatingProfit < 0 && overheadAvailable) {
    warnings.push('Faaliyet kârı negatif: genel gider payı karşılanmıyor.');
  }

  return {
    productId: product.id,
    productName: product.name,
    grossRevenue,
    netRevenue,
    vatAmount,
    materialBaseCost,
    materialFireCost,
    productFireCost,
    fireCost,
    materialCost,
    packagingCost,
    laborCost,
    commissionRate,
    commissionCost,
    variableCost,
    overheadPerUnit,
    overheadAvailable,
    totalCost,
    contribution,
    contributionRatio,
    operatingProfit,
    operatingMargin,
    breakEvenPriceNet,
    breakEvenPriceGross,
    targetPriceNet,
    targetPriceGross,
    lines: recipe.lines.map((l) => ({ ...l, baseCost: round2(l.baseCost), fireCost: round2(l.fireCost), totalCost: round2(l.totalCost), unitPrice: round2(l.unitPrice * 10000) / 10000 })),
    warnings,
  };
}

/** Birden fazla ürün için maliyet dökümü üretir. */
export function computeProductCosts(
  products: Product[],
  materials: Material[],
  settings: AppSettings,
  overheadByProduct: Record<string, number> = {},
  overheadAvailable = false,
): ProductCost[] {
  return products.map((product) =>
    computeProductCost({
      product,
      materials,
      settings,
      overheadPerUnit: overheadByProduct[product.id] ?? 0,
      overheadAvailable,
    }),
  );
}
