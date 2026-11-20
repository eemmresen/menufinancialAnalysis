/** Uygulamanın tüm alan tipleri. Hesaplama motoru bu tiplere bağımlıdır. */

export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'adet' | 'paket';

export type ExpenseType = 'fixed' | 'variable';

export interface Material {
  id: string;
  name: string;
  category: string;
  /** Alış miktarı (purchaseUnit cinsinden) */
  purchaseQty: number;
  purchaseUnit: Unit;
  /** Alış fiyatı, KDV hariç toplam tutar */
  purchasePrice: number;
  /** KDV oranı, ondalık (0.20) */
  vatRate: number;
  supplierId?: string;
  /** ISO tarih (YYYY-MM-DD) */
  purchaseDate: string;
  /** Fire oranı, ondalık (0.05 = %5) */
  wasteRate: number;
  /** Paket birimi kullanılıyorsa: 1 paket kaç packageUnit eder */
  packageSize?: number;
  packageUnit?: Unit;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Alış geçmişi kaydı. Fiyat değişimlerinde otomatik oluşur. */
export interface MaterialLot {
  id: string;
  materialId: string;
  date: string;
  purchaseQty: number;
  purchaseUnit: Unit;
  purchasePrice: number;
  vatRate: number;
  supplierId?: string;
  invoiceId?: string;
  notes?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
}

export interface RecipeItem {
  id: string;
  materialId: string;
  qty: number;
  unit: Unit;
}

export type LaborMode = 'fixed' | 'minutes';

export interface Product {
  id: string;
  name: string;
  category: string;
  /** Satış fiyatı, KDV dahil */
  salePrice: number;
  /** Satış KDV oranı, ondalık */
  vatRate: number;
  /** Ürün fire oranı, ondalık */
  wasteRate: number;
  packagingCost: number;
  laborMode: LaborMode;
  /** Sabit modda TL/adet, dakika modunda kullanılmaz */
  laborCost: number;
  /** Dakika modunda üretim süresi */
  laborMinutes: number;
  /** Satış komisyonu oranı, ondalık */
  commissionRate: number;
  /** Gider dağıtımında kullanılan ağırlık */
  overheadWeight: number;
  imageDataUrl?: string;
  description?: string;
  isActive: boolean;
  recipe: RecipeItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  name: string;
  type: ExpenseType;
  category: string;
  /** KDV hariç tutar */
  amount: number;
  vatRate: number;
  /** YYYY-MM */
  period: string;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesEntry {
  id: string;
  /** YYYY-MM */
  period: string;
  productId: string;
  quantity: number;
  /** KDV dahil ciro; boşsa ürün fiyatı × adet kullanılır */
  revenueGross?: number;
  updatedAt: string;
}

export type InvoiceStatus = 'draft' | 'approved' | 'discarded';

export interface InvoiceLine {
  id: string;
  description: string;
  qty: number;
  unit: Unit;
  /** Birim fiyat, KDV hariç */
  unitPrice: number;
  vatRate: number;
  materialId?: string;
  /** 0-1 arası ayrıştırma güveni */
  confidence: number;
}

export interface Invoice {
  id: string;
  fileName: string;
  fileHash: string;
  supplierName: string;
  supplierId?: string;
  date: string;
  totalGross: number;
  vatTotal: number;
  status: InvoiceStatus;
  source: 'pdf' | 'ocr';
  rawText: string;
  lines: InvoiceLine[];
  createdAt: string;
  approvedAt?: string;
}

export interface Period {
  id: string;
  status: 'open' | 'closed';
  closedAt?: string;
  notes?: string;
}

export type BusinessTaxType = 'none' | 'income' | 'corporate';

export interface AppSettings {
  id: 'app';
  businessName: string;
  vatRates: number[];
  defaultPurchaseVatRate: number;
  defaultSaleVatRate: number;
  /** Hedef faaliyet kâr marjı, ondalık */
  targetMargin: number;
  hourlyLaborCost: number;
  defaultOverheadMethod: 'units' | 'weight';
  businessTaxType: BusinessTaxType;
  businessTaxRate: number;
  priceRounding: 'none' | '0.5' | '1' | '5';
  demoData: boolean;
  updatedAt: string;
}

export interface RecipeCostLine {
  materialId: string;
  materialName: string;
  qty: number;
  unit: Unit;
  qtyBase: number;
  baseUnit: Unit;
  unitPrice: number;
  baseCost: number;
  fireRate: number;
  fireCost: number;
  totalCost: number;
  warning?: string;
}

export interface ProductCost {
  productId: string;
  productName: string;
  grossRevenue: number;
  netRevenue: number;
  vatAmount: number;
  materialBaseCost: number;
  materialFireCost: number;
  productFireCost: number;
  fireCost: number;
  materialCost: number;
  packagingCost: number;
  laborCost: number;
  commissionRate: number;
  commissionCost: number;
  variableCost: number;
  overheadPerUnit: number;
  overheadAvailable: boolean;
  totalCost: number;
  contribution: number;
  contributionRatio: number;
  operatingProfit: number;
  operatingMargin: number;
  breakEvenPriceNet: number | null;
  breakEvenPriceGross: number | null;
  targetPriceNet: number | null;
  targetPriceGross: number | null;
  lines: RecipeCostLine[];
  warnings: string[];
}

export interface CostSnapshot {
  id: string;
  period: string;
  productId: string;
  productName: string;
  createdAt: string;
  cost: ProductCost;
}

export interface AllocationRow {
  productId: string;
  productName: string;
  units: number;
  share: number;
  overhead: number;
  overheadPerUnit: number;
}

export interface AllocationResult {
  period: string;
  method: 'units' | 'weight';
  totalExpense: number;
  totalUnits: number;
  rows: AllocationRow[];
  warnings: string[];
}
