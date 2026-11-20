import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { computeProductCosts } from '@/engine/cost';
import { allocateOverhead, overheadPerUnitMap } from '@/engine/overhead';
import { businessBreakEven, type BusinessBreakEven } from '@/engine/breakeven';
import { summarizePeriod, type PeriodSummary } from '@/engine/sales';
import type {
  AllocationResult,
  AppSettings,
  Expense,
  Material,
  Product,
  ProductCost,
  SalesEntry,
} from '@/types';
import { useSettings } from './useSettings';

export interface CostModel {
  loading: boolean;
  settings?: AppSettings;
  period: string;
  products: Product[];
  materials: Material[];
  expenses: Expense[];
  sales: SalesEntry[];
  allocation: AllocationResult | null;
  costs: ProductCost[];
  costById: Map<string, ProductCost>;
  overheadByProduct: Record<string, number>;
  overheadAvailable: boolean;
  breakEven: BusinessBreakEven | null;
  summary: PeriodSummary | null;
}

/** Dönem bazlı maliyet, gider dağıtımı ve kârlılık modeli. */
export function useCostModel(period: string): CostModel {
  const settings = useSettings();
  const products = useLiveQuery(() => db.products.toArray(), []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const sales = useLiveQuery(() => db.sales.toArray(), []);

  return useMemo(() => {
    const loading = !settings || !products || !materials || !expenses || !sales;
    if (loading || !settings) {
      return {
        loading: true,
        settings,
        period,
        products: [],
        materials: [],
        expenses: [],
        sales: [],
        allocation: null,
        costs: [],
        costById: new Map(),
        overheadByProduct: {},
        overheadAvailable: false,
        breakEven: null,
        summary: null,
      };
    }

    const allocation = allocateOverhead({
      period,
      expenses,
      products,
      sales,
      method: settings.defaultOverheadMethod,
    });
    const overheadByProduct = overheadPerUnitMap(allocation);
    const overheadAvailable = allocation.totalUnits > 0;
    const costs = computeProductCosts(
      products,
      materials,
      settings,
      overheadByProduct,
      overheadAvailable,
    );
    const costById = new Map(costs.map((c) => [c.productId, c]));
    const breakEven = businessBreakEven(expenses, costs, sales, period);
    const summary = summarizePeriod(period, sales, products, costs, allocation, expenses);

    return {
      loading: false,
      settings,
      period,
      products,
      materials,
      expenses,
      sales,
      allocation,
      costs,
      costById,
      overheadByProduct,
      overheadAvailable,
      breakEven,
      summary,
    };
  }, [settings, products, materials, expenses, sales, period]);
}
