import type { AppSettings, ExpenseType, Unit } from '@/types';

export const APP_ID = 'app' as const;

export const DEFAULT_SETTINGS: AppSettings = {
  id: APP_ID,
  businessName: 'momo',
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
  updatedAt: new Date().toISOString(),
};

export const MATERIAL_CATEGORIES = [
  'Kahve',
  'Süt Ürünleri',
  'Çay',
  'İçecek Tozu',
  'Şurup',
  'Meyve',
  'Temel Gıda',
  'Paketli İçecek',
  'Tatlı',
  'Atıştırmalık',
  'Ambalaj',
  'Diğer',
];

export const PRODUCT_CATEGORIES = [
  'Sıcak Kahve',
  'Soğuk Kahve',
  'Sıcak İçecek',
  'Çay',
  'Mocktail',
  'Soğuk İçecek',
  'Tatlı & Atıştırmalık',
];

export const FIXED_EXPENSE_CATEGORIES = ['Kira', 'Personel', 'Muhasebe', 'İnternet', 'Diğer'];

export const VARIABLE_EXPENSE_CATEGORIES = [
  'Elektrik',
  'Su',
  'Temizlik',
  'Paketleme',
  'Komisyon',
  'Diğer',
];

export function expenseCategories(type: ExpenseType): string[] {
  return type === 'fixed' ? FIXED_EXPENSE_CATEGORIES : VARIABLE_EXPENSE_CATEGORIES;
}

export const UNIT_OPTIONS: Unit[] = ['kg', 'g', 'l', 'ml', 'adet', 'paket'];


