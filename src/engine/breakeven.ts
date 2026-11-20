import type { Expense, ProductCost, SalesEntry } from '@/types';
import { round2, safeDiv } from './money';

/** Başabaş adet: sabit giderler / birim katkı payı. Katkı payı <= 0 ise ulaşılamaz. */
export function breakEvenUnits(fixedCosts: number, contributionPerUnit: number): number | null {
  if (contributionPerUnit <= 0) return null;
  if (fixedCosts <= 0) return 0;
  return Math.ceil(fixedCosts / contributionPerUnit);
}

/** Satış karmasına göre ağırlıklı ortalama katkı payı. */
export function weightedAverageContribution(
  costs: ProductCost[],
  sales: SalesEntry[],
  period: string,
): number {
  const costById = new Map(costs.map((c) => [c.productId, c]));
  let totalUnits = 0;
  let totalContribution = 0;
  for (const entry of sales.filter((s) => s.period === period)) {
    const cost = costById.get(entry.productId);
    if (!cost || !entry.quantity) continue;
    totalUnits += entry.quantity;
    totalContribution += cost.contribution * entry.quantity;
  }
  return totalUnits > 0 ? safeDiv(totalContribution, totalUnits) : 0;
}

export interface BusinessBreakEven {
  fixedCosts: number;
  averageContribution: number;
  averageGrossPrice: number;
  units: number | null;
  revenueGross: number | null;
  totalUnits: number;
  warnings: string[];
}

/** İşletme geneli başabaş miktarı ve ciro tahmini. */
export function businessBreakEven(
  expenses: Expense[],
  costs: ProductCost[],
  sales: SalesEntry[],
  period: string,
): BusinessBreakEven {
  const fixedCosts = round2(
    expenses
      .filter((e) => e.period === period && e.type === 'fixed')
      .reduce((sum, e) => sum + (e.amount || 0), 0),
  );
  const periodSales = sales.filter((s) => s.period === period);
  const totalUnits = periodSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const avgContribution = round2(weightedAverageContribution(costs, sales, period));
  const grossRevenue = periodSales.reduce((sum, s) => sum + (s.revenueGross ?? 0), 0);
  const avgGrossPrice = totalUnits > 0 ? round2(grossRevenue / totalUnits) : 0;

  const warnings: string[] = [];
  let units: number | null = null;
  if (totalUnits <= 0) {
    warnings.push('Başabaş miktarı için bu dönemde satış adedi girilmeli.');
  } else if (avgContribution <= 0) {
    warnings.push('Ortalama katkı payı sıfır veya negatif; başabaş noktasına ulaşılamaz.');
  } else {
    units = breakEvenUnits(fixedCosts, avgContribution);
  }

  return {
    fixedCosts,
    averageContribution: avgContribution,
    averageGrossPrice: avgGrossPrice,
    units,
    revenueGross: units !== null && avgGrossPrice > 0 ? round2(units * avgGrossPrice) : null,
    totalUnits,
    warnings,
  };
}
