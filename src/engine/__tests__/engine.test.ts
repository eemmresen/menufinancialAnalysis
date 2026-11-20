import { describe, expect, it } from 'vitest';
import type { AppSettings, Expense, Material, Product, SalesEntry } from '@/types';
import { computeProductCost } from '@/engine/cost';
import { allocateOverhead, overheadPerUnitMap } from '@/engine/overhead';
import { breakEvenUnits, businessBreakEven } from '@/engine/breakeven';
import { applyWaste, computeRecipeCost } from '@/engine/recipe';
import { simulatePrices, buildScenarioPrices } from '@/engine/simulation';
import { UnitError, convert, pricePerBase, toBase } from '@/engine/units';
import { netFromGross, splitGross, vatFromGross } from '@/engine/vat';
import { round2, roundPriceUp } from '@/engine/money';

const settings: AppSettings = {
  id: 'app',
  businessName: 'Test Kafe',
  vatRates: [0, 0.01, 0.1, 0.2],
  defaultPurchaseVatRate: 0.2,
  defaultSaleVatRate: 0.1,
  targetMargin: 0.6,
  hourlyLaborCost: 300,
  defaultOverheadMethod: 'units',
  businessTaxType: 'none',
  businessTaxRate: 0.25,
  priceRounding: '1',
  demoData: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function material(over: Partial<Material> = {}): Material {
  return {
    id: 'm1',
    name: 'Espresso çekirdek',
    category: 'Kahve',
    purchaseQty: 1,
    purchaseUnit: 'kg',
    purchasePrice: 500,
    vatRate: 0.2,
    purchaseDate: '2026-01-01',
    wasteRate: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Latte',
    category: 'Sıcak Kahve',
    salePrice: 120,
    vatRate: 0.1,
    wasteRate: 0,
    packagingCost: 0,
    laborMode: 'fixed',
    laborCost: 0,
    laborMinutes: 0,
    commissionRate: 0,
    overheadWeight: 1,
    isActive: true,
    recipe: [{ id: 'r1', materialId: 'm1', qty: 100, unit: 'g' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('birim dönüşümleri', () => {
  it('kütle birimlerini çevirir', () => {
    expect(toBase(1, 'kg')).toBe(1000);
    expect(convert(1000, 'g', 'kg')).toBe(1);
    expect(convert(0.25, 'kg', 'g')).toBe(250);
  });

  it('hacim birimlerini çevirir', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(250, 'ml', 'l')).toBe(0.25);
  });

  it('adet ve paket dönüşümü yapar', () => {
    expect(convert(2, 'paket', 'adet', { packageSize: 24, packageUnit: 'adet' })).toBe(48);
    expect(convert(48, 'adet', 'paket', { packageSize: 24, packageUnit: 'adet' })).toBe(2);
  });

  it('paket tanımı yoksa hata verir', () => {
    expect(() => toBase(1, 'paket')).toThrow(UnitError);
  });

  it('farklı aileler arasında dönüşüm yapmaz', () => {
    expect(() => convert(1, 'kg', 'ml')).toThrow(UnitError);
  });

  it('taban birim fiyatını doğru hesaplar', () => {
    expect(pricePerBase(500, 1, 'kg')).toBeCloseTo(0.5, 6);
    expect(pricePerBase(100, 500, 'g')).toBeCloseTo(0.2, 6);
  });
});

describe('KDV hesapları', () => {
  it('%20 KDV dahil 120 TL -> net 100, KDV 20', () => {
    expect(netFromGross(120, 0.2)).toBeCloseTo(100, 6);
    expect(vatFromGross(120, 0.2)).toBeCloseTo(20, 6);
    expect(splitGross(120, 0.2)).toEqual({ net: 100, vat: 20 });
  });

  it('%10 KDV dahil 110 TL -> net 100, KDV 10', () => {
    expect(netFromGross(110, 0.1)).toBeCloseTo(100, 6);
    expect(vatFromGross(110, 0.1)).toBeCloseTo(10, 6);
  });

  it('%0 KDV tutarı değiştirmez', () => {
    expect(netFromGross(99.9, 0)).toBe(99.9);
  });
});

describe('reçete maliyeti', () => {
  it('gramajı kg fiyatından doğru hesaplar', () => {
    const m = material();
    const result = computeRecipeCost(product(), { m1: m });
    expect(result.materialBaseCost).toBeCloseTo(50, 6);
    expect(result.materialFireCost).toBe(0);
  });

  it('malzeme fire oranını bölerek uygular', () => {
    expect(applyWaste(100, 0.2)).toBeCloseTo(125, 6);
    const result = computeRecipeCost(product(), { m1: material({ wasteRate: 0.2 }) });
    expect(result.materialBaseCost).toBeCloseTo(50, 6);
    expect(result.materialFireCost).toBeCloseTo(12.5, 6);
  });

  it('ürün fire oranını toplam maliyete uygular', () => {
    const result = computeRecipeCost(product({ wasteRate: 0.1 }), { m1: material() });
    expect(result.productFireCost).toBeCloseTo(50 / 0.9 - 50, 6);
  });

  it('birden fazla malzemeyi toplar', () => {
    const milk = material({ id: 'm2', name: 'Süt', purchaseQty: 1, purchaseUnit: 'l', purchasePrice: 40 });
    const result = computeRecipeCost(
      product({
        recipe: [
          { id: 'r1', materialId: 'm1', qty: 18, unit: 'g' },
          { id: 'r2', materialId: 'm2', qty: 200, unit: 'ml' },
        ],
      }),
      { m1: material(), m2: milk },
    );
    expect(result.materialBaseCost).toBeCloseTo(9 + 8, 6);
  });

  it('silinmiş malzeme için uyarı üretir', () => {
    const result = computeRecipeCost(product(), {});
    expect(result.materialBaseCost).toBe(0);
    expect(result.warnings.length).toBe(1);
  });

  it('uyumsuz birimde maliyet üretmez ve uyarır', () => {
    const result = computeRecipeCost(
      product({ recipe: [{ id: 'r1', materialId: 'm1', qty: 1, unit: 'l' }] }),
      { m1: material() },
    );
    expect(result.materialBaseCost).toBe(0);
    expect(result.warnings[0]).toContain('dönüştürülemez');
  });
});

describe('ürün maliyeti ve kârlılık', () => {
  it('temel maliyet dökümünü hesaplar', () => {
    const cost = computeProductCost({
      product: product({ salePrice: 132, packagingCost: 2, laborCost: 5, commissionRate: 0.1 }),
      materials: [material()],
      settings,
    });
    expect(cost.grossRevenue).toBe(132);
    expect(cost.netRevenue).toBe(120);
    expect(cost.vatAmount).toBe(12);
    expect(cost.materialCost).toBe(50);
    expect(cost.commissionCost).toBe(12);
    expect(cost.variableCost).toBe(69);
    expect(cost.contribution).toBe(51);
    expect(cost.operatingProfit).toBe(51);
    expect(cost.overheadAvailable).toBe(false);
  });

  it('genel gider payını faaliyet kârından düşer', () => {
    const cost = computeProductCost({
      product: product({ salePrice: 132 }),
      materials: [material()],
      settings,
      overheadPerUnit: 20,
      overheadAvailable: true,
    });
    expect(cost.contribution).toBe(70);
    expect(cost.operatingProfit).toBe(50);
    expect(cost.totalCost).toBe(70);
  });

  it('başabaş fiyatta faaliyet kârı sıfırlanır', () => {
    const base = product({ salePrice: 132, packagingCost: 2, laborCost: 5, commissionRate: 0.1 });
    const initial = computeProductCost({ product: base, materials: [material()], settings, overheadPerUnit: 20, overheadAvailable: true });
    expect(initial.breakEvenPriceGross).not.toBeNull();
    const atBreakEven = computeProductCost({
      product: { ...base, salePrice: initial.breakEvenPriceGross! },
      materials: [material()],
      settings,
      overheadPerUnit: 20,
      overheadAvailable: true,
    });
    expect(atBreakEven.operatingProfit).toBeCloseTo(0, 1);
  });

  it('hedef marj fiyatında marj hedefe yaklaşır', () => {
    const base = product({ salePrice: 200, packagingCost: 2, laborCost: 5, commissionRate: 0.05 });
    const initial = computeProductCost({ product: base, materials: [material()], settings, overheadPerUnit: 10, overheadAvailable: true });
    const atTarget = computeProductCost({
      product: { ...base, salePrice: initial.targetPriceGross! },
      materials: [material()],
      settings,
      overheadPerUnit: 10,
      overheadAvailable: true,
    });
    expect(atTarget.operatingMargin).toBeCloseTo(0.6, 1);
  });

  it('komisyon + hedef marj %100 ise hedef fiyat üretmez', () => {
    const cost = computeProductCost({
      product: product({ commissionRate: 0.5 }),
      materials: [material()],
      settings: { ...settings, targetMargin: 0.6 },
    });
    expect(cost.targetPriceGross).toBeNull();
    expect(cost.warnings.some((w) => w.includes('hedef fiyat'))).toBe(true);
  });

  it('dakika bazlı işçilik maliyeti', () => {
    const cost = computeProductCost({
      product: product({ laborMode: 'minutes', laborMinutes: 6 }),
      materials: [material()],
      settings: { ...settings, hourlyLaborCost: 300 },
    });
    expect(cost.laborCost).toBe(30);
  });
});

describe('gider dağıtımı', () => {
  const expenses: Expense[] = [
    { id: 'e1', name: 'Kira', type: 'fixed', category: 'Kira', amount: 30000, vatRate: 0, period: '2026-01', date: '2026-01-01', createdAt: '', updatedAt: '' },
    { id: 'e2', name: 'Elektrik', type: 'variable', category: 'Elektrik', amount: 10000, vatRate: 0.2, period: '2026-01', date: '2026-01-05', createdAt: '', updatedAt: '' },
  ];
  const sales: SalesEntry[] = [
    { id: 's1', period: '2026-01', productId: 'p1', quantity: 300, updatedAt: '' },
    { id: 's2', period: '2026-01', productId: 'p2', quantity: 100, updatedAt: '' },
  ];
  const products = [
    product({ id: 'p1', name: 'Latte' }),
    product({ id: 'p2', name: 'Espresso', overheadWeight: 2 }),
  ];

  it('adet bazlı dağıtım toplam gidere eşitlenir', () => {
    const result = allocateOverhead({ period: '2026-01', expenses, products, sales, method: 'units' });
    expect(result.totalExpense).toBe(40000);
    expect(result.rows.find((r) => r.productId === 'p1')!.overhead).toBe(30000);
    expect(result.rows.find((r) => r.productId === 'p2')!.overhead).toBe(10000);
    expect(result.rows.reduce((s, r) => s + r.overhead, 0)).toBeCloseTo(40000, 2);
  });

  it('ağırlık bazlı dağıtım kullanıcı oranını uygular', () => {
    const result = allocateOverhead({ period: '2026-01', expenses, products, sales, method: 'weight' });
    expect(result.rows.find((r) => r.productId === 'p1')!.overhead).toBeCloseTo(13333.33, 2);
    expect(result.rows.find((r) => r.productId === 'p2')!.overhead).toBeCloseTo(26666.67, 2);
  });

  it('komisyon kategorisini hariç tutar', () => {
    const withCommission = [...expenses, { ...expenses[0], id: 'e3', name: 'Komisyon', category: 'Komisyon', amount: 5000 }];
    const result = allocateOverhead({ period: '2026-01', expenses: withCommission, products, sales, method: 'units' });
    expect(result.totalExpense).toBe(40000);
  });

  it('satış yoksa gider payı hesaplamaz ve uyarır', () => {
    const result = allocateOverhead({ period: '2026-01', expenses, products, sales: [], method: 'units' });
    expect(result.rows.every((r) => r.overheadPerUnit === 0)).toBe(true);
    expect(result.warnings[0]).toContain('satış adedi');
    expect(overheadPerUnitMap(result)).toEqual({ p1: 0, p2: 0 });
  });

  it('adet yönteminde adet başına pay eşittir', () => {
    const result = allocateOverhead({ period: '2026-01', expenses, products, sales, method: 'units' });
    expect(result.rows[0].overheadPerUnit).toBe(100);
    expect(result.rows[1].overheadPerUnit).toBe(100);
  });
});

describe('başabaş analizi', () => {
  it('sabit gider / katkı payı', () => {
    expect(breakEvenUnits(100000, 50)).toBe(2000);
    expect(breakEvenUnits(100000, 0)).toBeNull();
  });

  it('satış karmasına göre başabaş adet hesaplar', () => {
    const costs = [
      computeProductCost({ product: product({ id: 'p1', salePrice: 132 }), materials: [material()], settings }),
      computeProductCost({ product: product({ id: 'p2', salePrice: 66, recipe: [{ id: 'r', materialId: 'm1', qty: 50, unit: 'g' }] }), materials: [material()], settings }),
    ];
    const expenses: Expense[] = [
      { id: 'e1', name: 'Kira', type: 'fixed', category: 'Kira', amount: 10000, vatRate: 0, period: '2026-01', date: '2026-01-01', createdAt: '', updatedAt: '' },
    ];
    const sales: SalesEntry[] = [
      { id: 's1', period: '2026-01', productId: 'p1', quantity: 100, revenueGross: 13200, updatedAt: '' },
      { id: 's2', period: '2026-01', productId: 'p2', quantity: 100, revenueGross: 6600, updatedAt: '' },
    ];
    const result = businessBreakEven(expenses, costs, sales, '2026-01');
    // p1 katkı 70, p2 katkı 35 -> ortalama 52.5 -> 10000/52.5 = 190.48 -> 191
    expect(result.averageContribution).toBe(52.5);
    expect(result.units).toBe(191);
    expect(result.revenueGross).toBeGreaterThan(0);
  });
});

describe('fiyat simülasyonu', () => {
  it('4 senaryo üretir ve her fiyat için kârlılık hesaplar', () => {
    const p = product({ salePrice: 120 });
    const prices = buildScenarioPrices(120, settings);
    expect(prices.length).toBeGreaterThanOrEqual(3);
    const results = simulatePrices(p, [material()], settings, [80, 100, 120, 150], 10, true);
    expect(results).toHaveLength(4);
    expect(results[0].cost.operatingProfit).toBeLessThan(results[3].cost.operatingProfit);
    expect(results[1].cost.grossRevenue).toBe(100);
  });

  it('fiyat yuvarlama yukarı doğru çalışır', () => {
    expect(roundPriceUp(123.1, '5')).toBe(125);
    expect(roundPriceUp(123.1, '1')).toBe(124);
    expect(roundPriceUp(123.123, 'none')).toBe(123.12);
  });
});

describe('para yuvarlama', () => {
  it('kuruş hassasiyetinde yuvarlar', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
  });
});
