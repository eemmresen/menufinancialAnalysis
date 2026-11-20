import type { AllocationResult, AllocationRow, Expense, Product, SalesEntry } from '@/types';
import { round2, round4, safeDiv } from './money';

export interface OverheadParams {
  period: string;
  expenses: Expense[];
  products: Product[];
  sales: SalesEntry[];
  method: 'units' | 'weight';
  /** Değişken giderler de dağıtılsın mı? Varsayılan: evet */
  includeVariable?: boolean;
  /** Komisyon kategorisindeki giderleri hariç tut (ürün komisyonu ile çift sayımı önler) */
  excludeCommission?: boolean;
}

/**
 * Dönem giderlerini ürünlere dağıtır.
 * - "units": satılan adet oranında
 * - "weight": kullanıcının belirlediği ağırlık oranında
 */
export function allocateOverhead(params: OverheadParams): AllocationResult {
  const {
    period,
    expenses,
    products,
    sales,
    method,
    includeVariable = true,
    excludeCommission = true,
  } = params;

  const warnings: string[] = [];
  const periodExpenses = expenses.filter((e) => e.period === period);
  const usedExpenses = periodExpenses.filter((e) => {
    if (!includeVariable && e.type === 'variable') return false;
    if (excludeCommission && e.category.trim().toLocaleLowerCase('tr-TR') === 'komisyon') return false;
    return true;
  });

  const totalExpense = round2(usedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0));

  const unitsByProduct: Record<string, number> = {};
  for (const entry of sales.filter((s) => s.period === period)) {
    unitsByProduct[entry.productId] = (unitsByProduct[entry.productId] ?? 0) + (entry.quantity || 0);
  }
  const totalUnits = Object.values(unitsByProduct).reduce((a, b) => a + b, 0);

  if (totalUnits <= 0) {
    warnings.push(
      'Bu dönem için satış adedi girilmemiş. Genel gider payı hesaplanamıyor, ürün başına gider 0 gösteriliyor.',
    );
  }
  if (totalExpense <= 0) {
    warnings.push('Bu dönemde dağıtılacak gider kaydı yok.');
  }

  const rows: AllocationRow[] = products.map((product) => ({
    productId: product.id,
    productName: product.name,
    units: unitsByProduct[product.id] ?? 0,
    share: 0,
    overhead: 0,
    overheadPerUnit: 0,
  }));

  if (totalUnits > 0 && totalExpense > 0) {
    if (method === 'units') {
      const perUnit = totalExpense / totalUnits;
      for (const row of rows) {
        const share = safeDiv(row.units, totalUnits);
        row.share = round4(share);
        row.overhead = round2(totalExpense * share);
        row.overheadPerUnit = row.units > 0 ? round2(perUnit) : 0;
      }
      warnings.push(
        `Dağıtım yöntemi: satılan adet. Toplam ${round2(totalUnits)} adet üzerinden adet başına ${round2(perUnit)} TL gider payı varsayıldı.`,
      );
    } else {
      const eligible = rows.filter((r) => r.units > 0);
      const weightOf = (productId: string) => {
        const w = products.find((p) => p.id === productId)?.overheadWeight;
        return w && w > 0 ? w : 1;
      };
      const totalWeight = eligible.reduce((sum, r) => sum + weightOf(r.productId), 0);
      if (totalWeight <= 0) {
        warnings.push('Ağırlık toplamı sıfır; dağıtım yapılamadı.');
      } else {
        for (const row of eligible) {
          const share = safeDiv(weightOf(row.productId), totalWeight);
          row.share = round4(share);
          row.overhead = round2(totalExpense * share);
          row.overheadPerUnit = round2(row.overhead / row.units);
        }
        const zeroUnit = rows.filter((r) => r.units <= 0);
        if (zeroUnit.length > 0) {
          warnings.push(
            `Ağırlık yönteminde satışı olmayan ${zeroUnit.length} ürüne pay verilmedi: ${zeroUnit
              .map((r) => r.productName)
              .join(', ')}`,
          );
        }
        warnings.push(
          'Dağıtım yöntemi: kullanıcı ağırlıkları. Giderler ürün ağırlıklarına göre paylaştırıldı; bu bir varsayımdır.',
        );
      }
    }
  }

  return { period, method, totalExpense, totalUnits: round2(totalUnits), rows, warnings };
}

export function overheadPerUnitMap(result: AllocationResult): Record<string, number> {
  return Object.fromEntries(result.rows.map((r) => [r.productId, r.overheadPerUnit]));
}
