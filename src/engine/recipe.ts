import type { Material, Product, RecipeCostLine } from '@/types';
import { UnitError, baseUnitOf, convert, pricePerBase } from './units';

/** Malzemenin taban birim başına KDV hariç fiyatı (TL/g, TL/ml veya TL/adet). */
export function materialPricePerBase(material: Material): number {
  return pricePerBase(
    material.purchasePrice,
    material.purchaseQty,
    material.purchaseUnit,
    material,
  );
}

/** Fire oranını maliyete uygular: %10 fire -> maliyet / 0.9 */
export function applyWaste(cost: number, wasteRate: number): number {
  const rate = Math.min(Math.max(wasteRate || 0, 0), 0.99);
  return cost / (1 - rate);
}

export interface RecipeCostResult {
  lines: RecipeCostLine[];
  materialBaseCost: number;
  materialFireCost: number;
  /** Ürün geneli fire oranının maliyeti */
  productFireCost: number;
  warnings: string[];
}

/**
 * Reçetedeki her satırın maliyetini hesaplar.
 * Malzeme fiyatları her çağrıda güncel malzeme kaydından okunur; böylece
 * fiyat değişince tüm ürün maliyetleri kendiliğinden güncellenir.
 */
export function computeRecipeCost(
  product: Product,
  materialsById: Record<string, Material | undefined>,
): RecipeCostResult {
  const lines: RecipeCostLine[] = [];
  const warnings: string[] = [];

  for (const item of product.recipe) {
    const material = materialsById[item.materialId];
    if (!material) {
      warnings.push(`Reçetedeki bir malzeme silinmiş (${item.materialId}). Satır atlandı.`);
      continue;
    }

    let qtyBase = 0;
    let unitPrice = 0;
    let warning: string | undefined;
    const materialBaseUnit = baseUnitOf(material.purchaseUnit, material);

    try {
      qtyBase = convert(item.qty, item.unit, materialBaseUnit, material);
      unitPrice = materialPricePerBase(material);
    } catch (err) {
      warning = err instanceof UnitError ? err.message : 'Birim dönüşümü yapılamadı.';
      warnings.push(`${material.name}: ${warning}`);
    }

    if (qtyBase <= 0) {
      warning = warning ?? 'Miktar sıfır veya negatif.';
    }

    const baseCost = qtyBase * unitPrice;
    const fireRate = Math.min(Math.max(material.wasteRate || 0, 0), 0.99);
    const fireCost = baseCost / (1 - fireRate) - baseCost;
    const totalCost = baseCost + fireCost;

    lines.push({
      materialId: material.id,
      materialName: material.name,
      qty: item.qty,
      unit: item.unit,
      qtyBase,
      baseUnit: materialBaseUnit,
      unitPrice,
      baseCost,
      fireRate,
      fireCost,
      totalCost,
      warning,
    });
  }

  const materialBaseCost = lines.reduce((sum, l) => sum + l.baseCost, 0);
  const materialFireCost = lines.reduce((sum, l) => sum + l.fireCost, 0);
  const beforeProductWaste = materialBaseCost + materialFireCost;
  const productWasteRate = Math.min(Math.max(product.wasteRate || 0, 0), 0.99);
  const productFireCost = beforeProductWaste / (1 - productWasteRate) - beforeProductWaste;

  return { lines, materialBaseCost, materialFireCost, productFireCost, warnings };
}
