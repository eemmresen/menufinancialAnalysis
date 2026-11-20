import type { Expense, Material, MaterialLot, Product, SalesEntry, Supplier, Unit } from '@/types';
import { addMonths, currentPeriod, previousPeriod } from '@/lib/dates';
import { DEFAULT_SETTINGS } from './defaults';
import { db } from './schema';

const DEMO_PREFIX = 'dm-';

export function isDemoId(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

interface MaterialSeed {
  key: string;
  name: string;
  category: string;
  qty: number;
  unit: Unit;
  price: number;
  vat: number;
  waste?: number;
  packageSize?: number;
  packageUnit?: Unit;
  supplier: string;
}

const SUPPLIERS: Supplier[] = [
  { id: 'dm-sup-petra', name: 'Petra Roasting Co. (örnek)', notes: 'Kahve çekirdeği' },
  { id: 'dm-sup-metro', name: 'Metro Toptan (örnek)', notes: 'Kuru gıda ve şurup' },
  { id: 'dm-sup-sut', name: 'Yerel Süt Tedarikçisi (örnek)', notes: 'Süt ve süt ürünleri' },
  { id: 'dm-sup-icecek', name: 'İçecek Distribütörü (örnek)', notes: 'Paketli içecekler' },
];

const MATERIALS: MaterialSeed[] = [
  { key: 'espresso', name: 'Espresso çekirdeği', category: 'Kahve', qty: 1, unit: 'kg', price: 900, vat: 0.2, waste: 0.01, supplier: 'dm-sup-petra' },
  { key: 'filter', name: 'Filtre kahve çekirdeği', category: 'Kahve', qty: 1, unit: 'kg', price: 800, vat: 0.2, waste: 0.01, supplier: 'dm-sup-petra' },
  { key: 'turk', name: 'Türk kahvesi', category: 'Kahve', qty: 1, unit: 'kg', price: 850, vat: 0.2, supplier: 'dm-sup-petra' },
  { key: 'menengic', name: 'Menengiç kahve', category: 'Kahve', qty: 1, unit: 'kg', price: 700, vat: 0.2, supplier: 'dm-sup-petra' },
  { key: 'coldbrew', name: 'Cold brew konsantre', category: 'Kahve', qty: 1, unit: 'l', price: 400, vat: 0.2, supplier: 'dm-sup-petra' },
  { key: 'milk', name: 'Süt (tam yağlı)', category: 'Süt Ürünleri', qty: 1, unit: 'l', price: 42, vat: 0.1, supplier: 'dm-sup-sut' },
  { key: 'lactose', name: 'Laktozsuz süt', category: 'Süt Ürünleri', qty: 1, unit: 'l', price: 58, vat: 0.1, supplier: 'dm-sup-sut' },
  { key: 'sugar', name: 'Toz şeker', category: 'Temel Gıda', qty: 1, unit: 'kg', price: 32, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'cocoa', name: 'Kakao', category: 'Temel Gıda', qty: 1, unit: 'kg', price: 400, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'hotchoc', name: 'Sıcak çikolata tozu', category: 'İçecek Tozu', qty: 1, unit: 'kg', price: 380, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'salep', name: 'Salep tozu', category: 'İçecek Tozu', qty: 1, unit: 'kg', price: 900, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'matcha', name: 'Matcha tozu', category: 'İçecek Tozu', qty: 500, unit: 'g', price: 1200, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'blacktea', name: 'Siyah çay', category: 'Çay', qty: 1, unit: 'kg', price: 320, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'greentea', name: 'Yeşil çay', category: 'Çay', qty: 1, unit: 'kg', price: 600, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'herbal', name: 'Bitki çayı karışımı', category: 'Çay', qty: 1, unit: 'kg', price: 700, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'wintertea', name: 'Kış çayı', category: 'Çay', qty: 1, unit: 'kg', price: 650, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'hibiscus', name: 'Hibiscus şurubu', category: 'Şurup', qty: 1, unit: 'l', price: 300, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'lime', name: 'Lime şurubu', category: 'Şurup', qty: 1, unit: 'l', price: 280, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'lemonade', name: 'Limonata', category: 'İçecek', qty: 1, unit: 'l', price: 90, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'coconut', name: 'Coconut püresi', category: 'Şurup', qty: 1, unit: 'l', price: 250, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'mango', name: 'Mango püresi', category: 'Şurup', qty: 1, unit: 'l', price: 260, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'blue', name: 'Mavi şurup', category: 'Şurup', qty: 1, unit: 'l', price: 240, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'soda', name: 'Soda', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 12, vat: 0.2, supplier: 'dm-sup-icecek' },
  { key: 'cola', name: 'Kola / zero', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 22, vat: 0.2, supplier: 'dm-sup-icecek' },
  { key: 'redbull', name: 'Red Bull', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 45, vat: 0.2, supplier: 'dm-sup-icecek' },
  { key: 'gazoz', name: 'Gazoz', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 15, vat: 0.2, supplier: 'dm-sup-icecek' },
  { key: 'water', name: 'Su 0,5 L', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 5, vat: 0.1, supplier: 'dm-sup-icecek' },
  { key: 'tonic', name: 'Tonik', category: 'Paketli İçecek', qty: 1, unit: 'adet', price: 20, vat: 0.2, supplier: 'dm-sup-icecek' },
  { key: 'lemon', name: 'Limon', category: 'Meyve', qty: 1, unit: 'kg', price: 40, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'mint', name: 'Nane', category: 'Meyve', qty: 1, unit: 'paket', price: 20, vat: 0.1, packageSize: 50, packageUnit: 'g', supplier: 'dm-sup-metro' },
  { key: 'ice', name: 'Buz', category: 'Temel Gıda', qty: 1, unit: 'kg', price: 8, vat: 0.2, supplier: 'dm-sup-metro' },
  { key: 'brownie', name: 'Brownie (porsiyon)', category: 'Tatlı', qty: 1, unit: 'adet', price: 45, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'cookie', name: 'Cookie', category: 'Tatlı', qty: 1, unit: 'adet', price: 25, vat: 0.1, supplier: 'dm-sup-metro' },
  { key: 'bueno', name: 'Bueno bar', category: 'Atıştırmalık', qty: 1, unit: 'adet', price: 30, vat: 0.2, supplier: 'dm-sup-metro' },
];

interface ProductSeed {
  key: string;
  name: string;
  category: string;
  price: number;
  vat?: number;
  waste?: number;
  packaging?: number;
  laborMinutes?: number;
  active?: boolean;
  description?: string;
  recipe: Array<[string, number, Unit]>;
}

const PRODUCTS: ProductSeed[] = [
  { key: 'espresso', name: 'Espresso', category: 'Sıcak Kahve', price: 140, recipe: [['espresso', 18, 'g']] },
  { key: 'americano', name: 'Americano', category: 'Sıcak Kahve', price: 170, recipe: [['espresso', 18, 'g']] },
  { key: 'latte', name: 'Latte', category: 'Sıcak Kahve', price: 190, recipe: [['espresso', 18, 'g'], ['milk', 200, 'ml']] },
  { key: 'cappuccino', name: 'Cappuccino', category: 'Sıcak Kahve', price: 190, recipe: [['espresso', 18, 'g'], ['milk', 150, 'ml']] },
  { key: 'cortado', name: 'Cortado', category: 'Sıcak Kahve', price: 180, recipe: [['espresso', 18, 'g'], ['milk', 60, 'ml']] },
  { key: 'flatwhite', name: 'Flat White', category: 'Sıcak Kahve', price: 190, recipe: [['espresso', 18, 'g'], ['milk', 180, 'ml']] },
  { key: 'filter', name: 'Filtre Kahve', category: 'Sıcak Kahve', price: 170, recipe: [['filter', 25, 'g']] },
  { key: 'v60', name: 'V60', category: 'Sıcak Kahve', price: 190, recipe: [['filter', 22, 'g']] },
  { key: 'turk-tek', name: 'Türk Kahvesi (tek)', category: 'Sıcak Kahve', price: 110, recipe: [['turk', 7, 'g']] },
  { key: 'turk-double', name: 'Türk Kahvesi (double)', category: 'Sıcak Kahve', price: 160, recipe: [['turk', 14, 'g']] },
  { key: 'menengic', name: 'Menengiç Kahvesi', category: 'Sıcak Kahve', price: 140, recipe: [['menengic', 8, 'g']] },
  { key: 'coldbrew', name: 'Cold Brew', category: 'Soğuk Kahve', price: 240, packaging: 4, recipe: [['coldbrew', 100, 'ml'], ['ice', 100, 'g']] },
  { key: 'hotchoc', name: 'Sıcak Çikolata', category: 'Sıcak İçecek', price: 210, recipe: [['hotchoc', 25, 'g'], ['cocoa', 5, 'g'], ['milk', 200, 'ml']] },
  { key: 'salep', name: 'Salep', category: 'Sıcak İçecek', price: 190, recipe: [['salep', 30, 'g'], ['milk', 200, 'ml']] },
  { key: 'matcha', name: 'Matcha Latte', category: 'Sıcak İçecek', price: 240, recipe: [['matcha', 4, 'g'], ['milk', 200, 'ml']] },
  { key: 'cay', name: 'Çay', category: 'Çay', price: 45, laborMinutes: 1.5, recipe: [['blacktea', 5, 'g']] },
  { key: 'fincan-cay', name: 'Fincan Çay', category: 'Çay', price: 80, laborMinutes: 1.5, recipe: [['blacktea', 8, 'g']] },
  { key: 'yesilcay', name: 'Yeşil Çay', category: 'Çay', price: 190, recipe: [['greentea', 5, 'g']] },
  { key: 'adacayi', name: 'Adaçayı', category: 'Çay', price: 0, active: false, description: 'Menüde fiyat okunamadı — doğrulanmalı.', recipe: [['herbal', 5, 'g']] },
  { key: 'papatya', name: 'Papatya', category: 'Çay', price: 0, active: false, description: 'Menüde fiyat okunamadı — doğrulanmalı.', recipe: [['herbal', 5, 'g']] },
  { key: 'ihlamur', name: 'Ihlamur', category: 'Çay', price: 0, active: false, description: 'Menüde fiyat okunamadı — doğrulanmalı.', recipe: [['herbal', 5, 'g']] },
  { key: 'kiscayi', name: 'Kış Çayı', category: 'Çay', price: 0, active: false, description: 'Menüde fiyat okunamadı — doğrulanmalı.', recipe: [['wintertea', 5, 'g']] },
  { key: 'dibek', name: 'Dibek Kahvesi', category: 'Sıcak Kahve', price: 0, active: false, description: 'Menüde fiyat okunamadı — doğrulanmalı.', recipe: [['turk', 8, 'g']] },
  { key: 'hibiscus', name: 'Hibiscus', category: 'Mocktail', price: 180, packaging: 3.5, recipe: [['hibiscus', 60, 'ml'], ['soda', 1, 'adet'], ['lemon', 20, 'g'], ['ice', 80, 'g']] },
  { key: 'coollime', name: 'Cool Lime', category: 'Mocktail', price: 160, packaging: 3.5, recipe: [['lime', 60, 'ml'], ['soda', 1, 'adet'], ['mint', 2, 'g'], ['ice', 80, 'g']] },
  { key: 'limonata', name: 'Limonata', category: 'Mocktail', price: 160, packaging: 3.5, recipe: [['lemonade', 200, 'ml'], ['lemon', 15, 'g'], ['ice', 80, 'g']] },
  { key: 'coconutmango', name: 'Coconut Mango', category: 'Mocktail', price: 180, packaging: 3.5, recipe: [['coconut', 60, 'ml'], ['mango', 60, 'ml'], ['soda', 1, 'adet'], ['ice', 80, 'g']] },
  { key: 'mangolimonata', name: 'Mango Limonata', category: 'Mocktail', price: 180, packaging: 3.5, recipe: [['mango', 80, 'ml'], ['lemonade', 150, 'ml'], ['ice', 80, 'g']] },
  { key: 'mormocktail', name: 'Mor Mocktail', category: 'Mocktail', price: 180, packaging: 3.5, recipe: [['blue', 50, 'ml'], ['soda', 1, 'adet'], ['lemon', 20, 'g'], ['ice', 80, 'g']] },
  { key: 'su', name: 'Su', category: 'Soğuk İçecek', price: 35, laborMinutes: 0.5, recipe: [['water', 1, 'adet']] },
  { key: 'madensuyu', name: 'Maden Suyu', category: 'Soğuk İçecek', price: 60, laborMinutes: 0.5, vat: 0.2, recipe: [['soda', 1, 'adet']] },
  { key: 'churchill', name: 'Churchill', category: 'Soğuk İçecek', price: 100, packaging: 2, vat: 0.2, recipe: [['tonic', 1, 'adet'], ['lemon', 20, 'g'], ['ice', 60, 'g']] },
  { key: 'kola', name: 'Kola / Zero', category: 'Soğuk İçecek', price: 100, laborMinutes: 0.5, vat: 0.2, recipe: [['cola', 1, 'adet']] },
  { key: 'redbull', name: 'Red Bull', category: 'Soğuk İçecek', price: 140, laborMinutes: 0.5, vat: 0.2, recipe: [['redbull', 1, 'adet']] },
  { key: 'gazoz', name: 'Gazoz', category: 'Soğuk İçecek', price: 100, laborMinutes: 0.5, vat: 0.2, recipe: [['gazoz', 1, 'adet']] },
  { key: 'brownie', name: 'Brownie', category: 'Tatlı & Atıştırmalık', price: 260, packaging: 2, laborMinutes: 1, recipe: [['brownie', 1, 'adet']] },
  { key: 'cookie', name: 'Cookie', category: 'Tatlı & Atıştırmalık', price: 110, packaging: 1.5, laborMinutes: 0.5, recipe: [['cookie', 1, 'adet']] },
  { key: 'bueno', name: 'Bueno', category: 'Tatlı & Atıştırmalık', price: 70, laborMinutes: 0.5, vat: 0.2, recipe: [['bueno', 1, 'adet']] },
];

/** Önceki ay için örnek satış adetleri */
const SALES_QTY: Record<string, number> = {
  espresso: 180,
  americano: 160,
  latte: 320,
  cappuccino: 260,
  cortado: 90,
  flatwhite: 150,
  filter: 140,
  v60: 70,
  'turk-tek': 220,
  'turk-double': 90,
  menengic: 60,
  coldbrew: 120,
  hotchoc: 90,
  salep: 70,
  matcha: 60,
  cay: 700,
  'fincan-cay': 150,
  yesilcay: 80,
  hibiscus: 90,
  coollime: 110,
  limonata: 120,
  coconutmango: 80,
  mangolimonata: 80,
  mormocktail: 70,
  su: 400,
  madensuyu: 180,
  churchill: 60,
  kola: 200,
  redbull: 70,
  gazoz: 60,
  brownie: 90,
  cookie: 120,
  bueno: 80,
};

function buildMaterial(seed: MaterialSeed, index: number): Material {
  const now = new Date().toISOString();
  return {
    id: `${DEMO_PREFIX}m-${seed.key}`,
    name: seed.name,
    category: seed.category,
    purchaseQty: seed.qty,
    purchaseUnit: seed.unit,
    purchasePrice: seed.price,
    vatRate: seed.vat,
    supplierId: seed.supplier,
    purchaseDate: `2026-11-${String(2 + (index % 20)).padStart(2, '0')}`,
    wasteRate: seed.waste ?? 0,
    packageSize: seed.packageSize,
    packageUnit: seed.packageUnit,
    notes: 'Örnek alış fiyatı — gerçek tedarikçi fiyatı değildir.',
    createdAt: now,
    updatedAt: now,
  };
}

function buildProduct(seed: ProductSeed): Product {
  const now = new Date().toISOString();
  return {
    id: `${DEMO_PREFIX}p-${seed.key}`,
    name: seed.name,
    category: seed.category,
    salePrice: seed.price,
    vatRate: seed.vat ?? 0.1,
    wasteRate: seed.waste ?? 0.02,
    packagingCost: seed.packaging ?? 0,
    laborMode: 'minutes',
    laborCost: 0,
    laborMinutes: seed.laborMinutes ?? 3,
    commissionRate: 0,
    overheadWeight: 1,
    description: seed.description,
    isActive: seed.active ?? true,
    recipe: seed.recipe.map(([materialKey, qty, unit], i) => ({
      id: `${DEMO_PREFIX}r-${seed.key}-${i}`,
      materialId: `${DEMO_PREFIX}m-${materialKey}`,
      qty,
      unit,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function buildExpenses(period: string): Expense[] {
  const rows: Array<[string, string, 'fixed' | 'variable', number, number]> = [
    ['Kira', 'Kira', 'fixed', 45000, 0],
    ['Personel', 'Personel', 'fixed', 55000, 0],
    ['Muhasebe', 'Muhasebe', 'fixed', 4000, 0.2],
    ['İnternet', 'İnternet', 'fixed', 1200, 0.2],
    ['Elektrik', 'Elektrik', 'variable', 9000, 0.2],
    ['Su', 'Su', 'variable', 1500, 0.2],
    ['Temizlik', 'Temizlik', 'variable', 3000, 0.2],
    ['Paketleme', 'Paketleme', 'variable', 2500, 0.2],
  ];
  const now = new Date().toISOString();
  return rows.map(([key, category, type, amount, vat], i) => ({
    id: `${DEMO_PREFIX}e-${period}-${i}`,
    name: key,
    type,
    category,
    amount,
    vatRate: vat,
    period,
    date: `${period}-05`,
    notes: 'Örnek gider kaydı',
    createdAt: now,
    updatedAt: now,
  }));
}

/** Örnek veriyi yükler. Aynı kimliklerle tekrar çalıştırılabilir (üzerine yazar). */
export async function seedDemoData(): Promise<void> {
  const now = new Date().toISOString();
  const prev = previousPeriod();
  const current = currentPeriod();

  const materials = MATERIALS.map(buildMaterial);
  const products = PRODUCTS.map(buildProduct);

  const lots: MaterialLot[] = materials.map((m, i) => ({
    id: `${DEMO_PREFIX}lot-${i}`,
    materialId: m.id,
    date: m.purchaseDate,
    purchaseQty: m.purchaseQty,
    purchaseUnit: m.purchaseUnit,
    purchasePrice: m.purchasePrice,
    vatRate: m.vatRate,
    supplierId: m.supplierId,
    notes: 'Açılış fiyatı (örnek)',
    createdAt: now,
  }));

  // Fiyat değişim grafiği için geçmiş alışlar (örnek)
  const HISTORY: Array<[string, number, number]> = [
    ['espresso', 2, 0.85],
    ['espresso', 1, 0.94],
    ['milk', 2, 0.88],
    ['milk', 1, 0.95],
    ['blacktea', 2, 0.9],
    ['blacktea', 1, 0.96],
    ['lemon', 2, 0.8],
    ['lemon', 1, 0.9],
    ['matcha', 2, 0.87],
    ['matcha', 1, 0.93],
    ['cola', 2, 0.9],
    ['cola', 1, 0.95],
  ];
  for (const [key, monthsAgo, factor] of HISTORY) {
    const material = materials.find((m) => m.id === `${DEMO_PREFIX}m-${key}`);
    if (!material) continue;
    lots.push({
      id: `${DEMO_PREFIX}lot-h-${key}-${monthsAgo}`,
      materialId: material.id,
      date: `${addMonths(current, -monthsAgo)}-05`,
      purchaseQty: material.purchaseQty,
      purchaseUnit: material.purchaseUnit,
      purchasePrice: Math.round(material.purchasePrice * factor * 100) / 100,
      vatRate: material.vatRate,
      supplierId: material.supplierId,
      notes: 'Geçmiş alış (örnek)',
      createdAt: now,
    });
  }

  const sales: SalesEntry[] = [];
  for (const product of products) {
    const qty = SALES_QTY[product.id.replace(`${DEMO_PREFIX}p-`, '')] ?? 0;
    if (!qty || product.salePrice <= 0) continue;
    sales.push({
      id: `${DEMO_PREFIX}s-${prev}-${product.id}`,
      period: prev,
      productId: product.id,
      quantity: qty,
      revenueGross: Math.round(qty * product.salePrice * 100) / 100,
      updatedAt: now,
    });
    sales.push({
      id: `${DEMO_PREFIX}s-${current}-${product.id}`,
      period: current,
      productId: product.id,
      quantity: Math.round(qty * 0.62),
      revenueGross: Math.round(qty * 0.62 * product.salePrice * 100) / 100,
      updatedAt: now,
    });
  }

  await db.transaction(
    'rw',
    [db.settings, db.suppliers, db.materials, db.materialLots, db.products, db.expenses, db.sales, db.periods],
    async () => {
      await db.suppliers.bulkPut(SUPPLIERS);
      await db.materials.bulkPut(materials);
      await db.materialLots.bulkPut(lots);
      await db.products.bulkPut(products);
      await db.expenses.bulkPut([...buildExpenses(prev), ...buildExpenses(current)]);
      await db.sales.bulkPut(sales);
      await db.periods.bulkPut([
        { id: prev, status: 'open' },
        { id: current, status: 'open' },
      ]);
    },
  );
}

/** Sadece demo kayıtlarını siler; kullanıcı verisine dokunmaz. */
export async function clearDemoData(): Promise<void> {
  const isDemo = (row: { id: string }) => isDemoId(row.id);
  await db.transaction(
    'rw',
    [db.suppliers, db.materials, db.materialLots, db.products, db.expenses, db.sales, db.periods, db.invoices, db.snapshots],
    async () => {
      await db.suppliers.filter(isDemo).delete();
      await db.materials.filter(isDemo).delete();
      await db.materialLots.filter(isDemo).delete();
      await db.products.filter(isDemo).delete();
      await db.expenses.filter(isDemo).delete();
      await db.sales.filter(isDemo).delete();
      await db.periods.filter(isDemo).delete();
      await db.invoices.filter(isDemo).delete();
      await db.snapshots.filter(isDemo).delete();
    },
  );
  await db.settings.update('app', { demoData: false, updatedAt: new Date().toISOString() });
}

/** İlk açılışta ayarları ve örnek veriyi oluşturur. */
export async function ensureInitialized(): Promise<void> {
  const existing = await db.settings.get('app');
  if (existing) return;
  await db.settings.put({
    ...DEFAULT_SETTINGS,
    demoData: true,
    updatedAt: new Date().toISOString(),
  });
  await seedDemoData();
}

/** Tüm verileri siler, ayarları varsayılana döndürür. */
export async function resetAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.settings, db.suppliers, db.materials, db.materialLots, db.products, db.expenses, db.sales, db.invoices, db.periods, db.snapshots],
    async () => {
      await Promise.all([
        db.suppliers.clear(),
        db.materials.clear(),
        db.materialLots.clear(),
        db.products.clear(),
        db.expenses.clear(),
        db.sales.clear(),
        db.invoices.clear(),
        db.periods.clear(),
        db.snapshots.clear(),
        db.settings.clear(),
      ]);
      await db.settings.put({
        ...DEFAULT_SETTINGS,
        demoData: false,
        updatedAt: new Date().toISOString(),
      });
    },
  );
}

