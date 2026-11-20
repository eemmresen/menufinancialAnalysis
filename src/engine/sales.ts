import type { AllocationResult, Expense, Product, ProductCost, SalesEntry } from '@/types';
import { round2 } from './money';
import { netFromGross } from './vat';

export interface PeriodSummary {
  period: string;
  units: number;
  revenueGross: number;
  revenueNet: number;
  vatOutput: number;
  cogs: number;
  contribution: number;
  allocatedOverhead: number;
  operatingResult: number;
  fixedExpenses: number;
  variableExpenses: number;
  hasSales: boolean;
}

/** Satış kaydının KDV dahil cirosu: girilmişse onu, yoksa ürün fiyatı × adet kullanır. */
export function salesRevenueGross(entry: SalesEntry, product?: Product): number {
  if (typeof entry.revenueGross === 'number' && entry.revenueGross >= 0) return entry.revenueGross;
  if (!product) return 0;
  return round2((entry.quantity || 0) * (product.salePrice || 0));
}

export function summarizePeriod(
  period: string,
  sales: SalesEntry[],
  products: Product[],
  costs: ProductCost[],
  allocation: AllocationResult | null,
  expenses: Expense[],
  allocatedOverheadOverride?: number,
): PeriodSummary {
  const productById = new Map(products.map((p) => [p.id, p]));
  const costById = new Map(costs.map((c) => [c.productId, c]));
  const periodSales = sales.filter((s) => s.period === period);

  let units = 0;
  let revenueGross = 0;
  let revenueNet = 0;
  let vatOutput = 0;
  let cogs = 0;
  let contribution = 0;

  for (const entry of periodSales) {
    const product = productById.get(entry.productId);
    if (!product || !entry.quantity) continue;
    const gross = salesRevenueGross(entry, product);
    const net = netFromGross(gross, product.vatRate);
    const cost = costById.get(entry.productId);
    const unitVariable = cost?.variableCost ?? 0;

    units += entry.quantity;
    revenueGross += gross;
    revenueNet += net;
    vatOutput += gross - net;
    cogs += unitVariable * entry.quantity;
    contribution += net - unitVariable * entry.quantity;
  }

  const fixedExpenses = expenses
    .filter((e) => e.period === period && e.type === 'fixed')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const variableExpenses = expenses
    .filter((e) => e.period === period && e.type === 'variable')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const allocatedOverhead =
    allocatedOverheadOverride !== undefined
      ? allocatedOverheadOverride
      : units > 0
        ? allocation?.totalExpense ?? 0
        : 0;

  return {
    period,
    units: round2(units),
    revenueGross: round2(revenueGross),
    revenueNet: round2(revenueNet),
    vatOutput: round2(vatOutput),
    cogs: round2(cogs),
    contribution: round2(contribution),
    allocatedOverhead: round2(allocatedOverhead),
    operatingResult: round2(contribution - allocatedOverhead),
    fixedExpenses: round2(fixedExpenses),
    variableExpenses: round2(variableExpenses),
    hasSales: periodSales.length > 0 && units > 0,
  };
}
