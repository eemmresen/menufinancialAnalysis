import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  CostSnapshot,
  Expense,
  Invoice,
  Material,
  MaterialLot,
  Period,
  Product,
  SalesEntry,
  Supplier,
} from '@/types';

export class AppDatabase extends Dexie {
  settings!: Table<AppSettings, string>;
  suppliers!: Table<Supplier, string>;
  materials!: Table<Material, string>;
  materialLots!: Table<MaterialLot, string>;
  products!: Table<Product, string>;
  expenses!: Table<Expense, string>;
  sales!: Table<SalesEntry, string>;
  invoices!: Table<Invoice, string>;
  periods!: Table<Period, string>;
  snapshots!: Table<CostSnapshot, string>;

  constructor() {
    super('momo-kafe-analiz');
    this.version(1).stores({
      settings: 'id',
      suppliers: 'id, name',
      materials: 'id, name, category',
      materialLots: 'id, materialId, date',
      products: 'id, name, category, isActive',
      expenses: 'id, type, category, period',
      sales: 'id, period, productId, [period+productId]',
      invoices: 'id, fileHash, date, status',
      periods: 'id, status',
      snapshots: 'id, period, productId, [period+productId]',
    });
  }
}

export const db = new AppDatabase();
