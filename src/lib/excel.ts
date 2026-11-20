import type { AllocationResult, Expense, Material, MaterialLot, Product, ProductCost } from '@/types';
import type { PeriodSummary } from '@/engine/sales';

export interface ExcelPayload {
  summaries: PeriodSummary[];
  costs: ProductCost[];
  expenses: Expense[];
  allocation: AllocationResult | null;
  products: Product[];
  materials: Material[];
  lots: MaterialLot[];
  vat: { output: number; input: number; payable: number };
  periodLabel: string;
}

const MONEY = '#,##0.00';

export async function exportExcel(payload: ExcelPayload): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'momo kafe maliyet analizi';
  wb.created = new Date();

  const sheet = (name: string, columns: Array<{ header: string; key: string; width: number }>) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F624C' } };
    ws.getRow(1).height = 20;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  };

  const summary = sheet('Özet', [
    { header: 'Dönem', key: 'period', width: 14 },
    { header: 'Adet', key: 'units', width: 10 },
    { header: 'Ciro (KDV dahil)', key: 'gross', width: 18 },
    { header: 'Ciro (KDV hariç)', key: 'net', width: 18 },
    { header: 'Değişken maliyet', key: 'cogs', width: 18 },
    { header: 'Katkı payı', key: 'contribution', width: 16 },
    { header: 'Dağıtılan gider', key: 'overhead', width: 16 },
    { header: 'Faaliyet sonucu', key: 'result', width: 16 },
  ]);
  for (const s of payload.summaries) {
    summary.addRow({
      period: s.period,
      units: s.units,
      gross: s.revenueGross,
      net: s.revenueNet,
      cogs: s.cogs,
      contribution: s.contribution,
      overhead: s.allocatedOverhead,
      result: s.operatingResult,
    });
  }
  summary.addRow({ period: 'KDV özeti' });
  summary.addRow({ period: 'Hesaplanan KDV', gross: payload.vat.output });
  summary.addRow({ period: 'İndirilecek KDV', gross: payload.vat.input });
  summary.addRow({ period: 'Tahmini ödenecek KDV', gross: payload.vat.payable });
  ['C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
    summary.getColumn(col).numFmt = MONEY;
  });

  const costSheet = sheet('Ürün maliyetleri', [
    { header: 'Ürün', key: 'name', width: 26 },
    { header: 'Kategori', key: 'category', width: 18 },
    { header: 'Satış (KDV dahil)', key: 'gross', width: 16 },
    { header: 'Net gelir', key: 'net', width: 14 },
    { header: 'Hammadde', key: 'material', width: 14 },
    { header: 'Fire', key: 'fire', width: 12 },
    { header: 'Ambalaj', key: 'packaging', width: 12 },
    { header: 'İşçilik', key: 'labor', width: 12 },
    { header: 'Komisyon', key: 'commission', width: 12 },
    { header: 'Değişken maliyet', key: 'variable', width: 16 },
    { header: 'Gider payı', key: 'overhead', width: 14 },
    { header: 'Katkı payı', key: 'contribution', width: 14 },
    { header: 'Faaliyet kârı', key: 'profit', width: 14 },
    { header: 'Marj', key: 'margin', width: 10 },
  ]);
  const productById = new Map(payload.products.map((p) => [p.id, p]));
  for (const c of payload.costs) {
    costSheet.addRow({
      name: c.productName,
      category: productById.get(c.productId)?.category ?? '',
      gross: c.grossRevenue,
      net: c.netRevenue,
      material: c.materialCost,
      fire: c.fireCost,
      packaging: c.packagingCost,
      labor: c.laborCost,
      commission: c.commissionCost,
      variable: c.variableCost,
      overhead: c.overheadPerUnit,
      contribution: c.contribution,
      profit: c.overheadAvailable ? c.operatingProfit : null,
      margin: c.overheadAvailable ? c.operatingMargin : null,
    });
  }
  ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((col) => {
    costSheet.getColumn(col).numFmt = MONEY;
  });
  costSheet.getColumn('N').numFmt = '0.0%';

  const expenseSheet = sheet('Giderler', [
    { header: 'Dönem', key: 'period', width: 12 },
    { header: 'Ad', key: 'name', width: 24 },
    { header: 'Tür', key: 'type', width: 12 },
    { header: 'Kategori', key: 'category', width: 16 },
    { header: 'Tutar (KDV hariç)', key: 'amount', width: 18 },
    { header: 'KDV oranı', key: 'vat', width: 10 },
    { header: 'Tarih', key: 'date', width: 12 },
  ]);
  for (const e of payload.expenses) {
    expenseSheet.addRow({
      period: e.period,
      name: e.name,
      type: e.type === 'fixed' ? 'Sabit' : 'Değişken',
      category: e.category,
      amount: e.amount,
      vat: e.vatRate,
      date: e.date,
    });
  }
  expenseSheet.getColumn('E').numFmt = MONEY;
  expenseSheet.getColumn('F').numFmt = '0%';

  if (payload.allocation) {
    const allocSheet = sheet('Gider dağıtımı', [
      { header: 'Ürün', key: 'name', width: 26 },
      { header: 'Satılan adet', key: 'units', width: 14 },
      { header: 'Pay', key: 'share', width: 10 },
      { header: 'Gider payı', key: 'overhead', width: 16 },
      { header: 'Adet başına', key: 'perUnit', width: 14 },
    ]);
    allocSheet.addRow({
      name: `Yöntem: ${payload.allocation.method === 'units' ? 'Satılan adet' : 'Kullanıcı ağırlığı'}`,
      units: payload.allocation.totalUnits,
      share: null,
      overhead: payload.allocation.totalExpense,
      perUnit: null,
    });
    for (const row of payload.allocation.rows) {
      allocSheet.addRow({
        name: row.productName,
        units: row.units,
        share: row.share,
        overhead: row.overhead,
        perUnit: row.overheadPerUnit,
      });
    }
    allocSheet.getColumn('C').numFmt = '0.0%';
    allocSheet.getColumn('D').numFmt = MONEY;
    allocSheet.getColumn('E').numFmt = MONEY;
  }

  const lotSheet = sheet('Alış geçmişi', [
    { header: 'Hammadde', key: 'material', width: 26 },
    { header: 'Tarih', key: 'date', width: 12 },
    { header: 'Miktar', key: 'qty', width: 12 },
    { header: 'Birim', key: 'unit', width: 10 },
    { header: 'Tutar (KDV hariç)', key: 'price', width: 18 },
    { header: 'KDV', key: 'vat', width: 10 },
    { header: 'Not', key: 'notes', width: 24 },
  ]);
  const materialById = new Map(payload.materials.map((m) => [m.id, m]));
  for (const lot of payload.lots) {
    lotSheet.addRow({
      material: materialById.get(lot.materialId)?.name ?? lot.materialId,
      date: lot.date,
      qty: lot.purchaseQty,
      unit: lot.purchaseUnit,
      price: lot.purchasePrice,
      vat: lot.vatRate,
      notes: lot.notes ?? '',
    });
  }
  lotSheet.getColumn('E').numFmt = MONEY;
  lotSheet.getColumn('F').numFmt = '0%';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kafe-raporu-${payload.periodLabel.replace(/\s/g, '-')}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
