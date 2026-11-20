import type {
  AppSettings,
  CostSnapshot,
  Expense,
  Invoice,
  Material,
  MaterialLot,
  Product,
  SalesEntry,
  Supplier,
} from '@/types';
import { uid } from '@/lib/id';
import { round2 } from '@/engine/money';
import { computeProductCosts } from '@/engine/cost';
import { allocateOverhead, overheadPerUnitMap } from '@/engine/overhead';
import { db } from './schema';

export async function getSettings(): Promise<AppSettings | undefined> {
  return db.settings.get('app');
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await db.settings.get('app');
  if (!current) return;
  await db.settings.put({ ...current, ...patch, id: 'app', updatedAt: new Date().toISOString() });
}

/* ------------------------------- Malzemeler ------------------------------- */

export async function saveMaterial(material: Material): Promise<void> {
  const existing = await db.materials.get(material.id);
  const priceChanged =
    !existing ||
    existing.purchasePrice !== material.purchasePrice ||
    existing.purchaseQty !== material.purchaseQty ||
    existing.purchaseUnit !== material.purchaseUnit ||
    existing.vatRate !== material.vatRate;

  await db.transaction('rw', [db.materials, db.materialLots], async () => {
    await db.materials.put(material);
    if (priceChanged) {
      const lot: MaterialLot = {
        id: uid('lot'),
        materialId: material.id,
        date: material.purchaseDate,
        purchaseQty: material.purchaseQty,
        purchaseUnit: material.purchaseUnit,
        purchasePrice: material.purchasePrice,
        vatRate: material.vatRate,
        supplierId: material.supplierId,
        notes: existing ? 'Fiyat güncellemesi' : 'İlk alış',
        createdAt: new Date().toISOString(),
      };
      await db.materialLots.put(lot);
    }
  });
}

export async function deleteMaterial(id: string): Promise<void> {
  await db.transaction('rw', [db.materials, db.materialLots], async () => {
    await db.materials.delete(id);
    await db.materialLots.where('materialId').equals(id).delete();
  });
}

export async function productsUsingMaterial(materialId: string): Promise<string[]> {
  const products = await db.products.toArray();
  return products.filter((p) => p.recipe.some((r) => r.materialId === materialId)).map((p) => p.name);
}

export async function addMaterialLot(lot: MaterialLot): Promise<void> {
  await db.transaction('rw', [db.materials, db.materialLots], async () => {
    await db.materialLots.put(lot);
    await db.materials.update(lot.materialId, {
      purchaseQty: lot.purchaseQty,
      purchaseUnit: lot.purchaseUnit,
      purchasePrice: lot.purchasePrice,
      vatRate: lot.vatRate,
      purchaseDate: lot.date,
      supplierId: lot.supplierId,
      updatedAt: new Date().toISOString(),
    });
  });
}

/* -------------------------------- Ürünler -------------------------------- */

export async function saveProduct(product: Product): Promise<void> {
  await db.products.put(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await db.transaction('rw', [db.products, db.sales], async () => {
    await db.products.delete(id);
    await db.sales.where('productId').equals(id).delete();
  });
}

/* -------------------------------- Giderler ------------------------------- */

export async function saveExpense(expense: Expense): Promise<void> {
  await db.expenses.put(expense);
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id);
}

/* -------------------------------- Satışlar ------------------------------- */

export async function setSalesForPeriod(
  period: string,
  rows: Array<{ productId: string; quantity: number; revenueGross?: number }>,
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.sales, async () => {
    await db.sales.where('period').equals(period).delete();
    const entries: SalesEntry[] = rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        id: uid('sale'),
        period,
        productId: r.productId,
        quantity: r.quantity,
        revenueGross: r.revenueGross,
        updatedAt: now,
      }));
    if (entries.length > 0) await db.sales.bulkPut(entries);
  });
}

/* -------------------------------- Dönemler ------------------------------- */

export async function ensurePeriod(period: string): Promise<void> {
  const existing = await db.periods.get(period);
  if (!existing) await db.periods.put({ id: period, status: 'open' });
}

export async function createPeriodSnapshot(period: string): Promise<number> {
  const [products, materials, settings, expenses, sales] = await Promise.all([
    db.products.toArray(),
    db.materials.toArray(),
    db.settings.get('app'),
    db.expenses.toArray(),
    db.sales.toArray(),
  ]);
  if (!settings) return 0;

  const allocation = allocateOverhead({
    period,
    expenses,
    products,
    sales,
    method: settings.defaultOverheadMethod,
  });
  const costs = computeProductCosts(
    products,
    materials,
    settings,
    overheadPerUnitMap(allocation),
    allocation.totalUnits > 0,
  );

  const createdAt = new Date().toISOString();
  const snapshots: CostSnapshot[] = costs.map((cost) => ({
    id: `snap-${period}-${cost.productId}`,
    period,
    productId: cost.productId,
    productName: cost.productName,
    createdAt,
    cost,
  }));
  await db.snapshots.bulkPut(snapshots);
  return snapshots.length;
}

export async function closePeriod(period: string): Promise<number> {
  const count = await createPeriodSnapshot(period);
  await db.periods.put({ id: period, status: 'closed', closedAt: new Date().toISOString() });
  return count;
}

export async function reopenPeriod(period: string): Promise<void> {
  const existing = await db.periods.get(period);
  await db.periods.put({ ...(existing ?? { id: period }), id: period, status: 'open' });
}

/* -------------------------------- Faturalar ------------------------------ */

export async function findInvoiceByHash(hash: string): Promise<Invoice | undefined> {
  return db.invoices.where('fileHash').equals(hash).first();
}

export async function findDuplicateInvoice(
  hash: string,
  supplierName: string,
  date: string,
  totalGross: number,
): Promise<Invoice | undefined> {
  const all = await db.invoices.toArray();
  return all.find(
    (inv) =>
      inv.fileHash === hash ||
      (inv.supplierName.trim().toLocaleLowerCase('tr-TR') ===
        supplierName.trim().toLocaleLowerCase('tr-TR') &&
        inv.date === date &&
        Math.abs(inv.totalGross - totalGross) < 0.01),
  );
}

export interface ApproveResult {
  createdMaterials: number;
  updatedMaterials: number;
  lots: number;
}

/**
 * Onaylanan faturayı alış kayıtlarına dönüştürür.
 * Eşleşmeyen satırlar için yeni malzeme oluşturur.
 */
export async function approveInvoice(invoice: Invoice): Promise<ApproveResult> {
  const result: ApproveResult = { createdMaterials: 0, updatedMaterials: 0, lots: 0 };
  const now = new Date().toISOString();

  await db.transaction('rw', [db.invoices, db.materials, db.materialLots, db.suppliers], async () => {
    let supplierId = invoice.supplierId;
    if (!supplierId && invoice.supplierName.trim()) {
      const suppliers = await db.suppliers.toArray();
      const match = suppliers.find(
        (s) =>
          s.name.trim().toLocaleLowerCase('tr-TR') ===
          invoice.supplierName.trim().toLocaleLowerCase('tr-TR'),
      );
      if (match) supplierId = match.id;
      else {
        const supplier: Supplier = { id: uid('sup'), name: invoice.supplierName.trim() };
        await db.suppliers.put(supplier);
        supplierId = supplier.id;
      }
    }

    for (const line of invoice.lines) {
      if (!line.description.trim() || line.qty <= 0) continue;
      const total = round2(line.unitPrice * line.qty);

      if (line.materialId && (await db.materials.get(line.materialId))) {
        await db.materials.update(line.materialId, {
          purchaseQty: line.qty,
          purchaseUnit: line.unit,
          purchasePrice: total,
          vatRate: line.vatRate,
          purchaseDate: invoice.date,
          supplierId,
          updatedAt: now,
        });
        result.updatedMaterials++;
      } else {
        const materialId = uid('mat');
        const material: Material = {
          id: materialId,
          name: line.description.trim(),
          category: 'Fatura',
          purchaseQty: line.qty,
          purchaseUnit: line.unit,
          purchasePrice: total,
          vatRate: line.vatRate,
          supplierId,
          purchaseDate: invoice.date,
          wasteRate: 0,
          notes: `${invoice.supplierName} faturasından oluşturuldu`,
          createdAt: now,
          updatedAt: now,
        };
        await db.materials.put(material);
        result.createdMaterials++;
        line.materialId = materialId;
      }

      await db.materialLots.put({
        id: uid('lot'),
        materialId: line.materialId!,
        date: invoice.date,
        purchaseQty: line.qty,
        purchaseUnit: line.unit,
        purchasePrice: total,
        vatRate: line.vatRate,
        supplierId,
        invoiceId: invoice.id,
        notes: 'Fatura onayı',
        createdAt: now,
      });
      result.lots++;
    }

    await db.invoices.put({
      ...invoice,
      supplierId,
      status: 'approved',
      approvedAt: now,
    });
  });

  return result;
}

export async function deleteInvoice(id: string): Promise<void> {
  await db.invoices.delete(id);
}
