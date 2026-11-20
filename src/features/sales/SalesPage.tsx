import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { setSalesForPeriod } from '@/db/repos';
import { previousPeriod, currentPeriod, monthLabel } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/format';
import { netFromGross } from '@/engine/vat';
import { PageHeader, StatCard, Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/icons';
import { NumberField } from '@/components/ui/Field';
import { PeriodSelect } from '@/components/ui/PeriodSelect';
import { useToast } from '@/components/ui/Toast';

interface RowState {
  qty: number;
  revenue: number;
  /** Kullanıcı ciro alanını elle değiştirdi mi? */
  manual: boolean;
  /** Bu oturumda adet değişti mi? (ciro yeniden hesaplanır) */
  qtyEdited: boolean;
}

function revenueOf(row: RowState | undefined, price: number): number {
  if (!row) return 0;
  if (row.manual) return row.revenue;
  if (row.qtyEdited) return Math.round(row.qty * price * 100) / 100;
  return row.revenue;
}

export function SalesPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);

  const products = useLiveQuery(() => db.products.toArray(), []);
  const sales = useLiveQuery(() => db.sales.where('period').equals(period).toArray(), [period]);
  const periods = useLiveQuery(() => db.sales.toArray(), []) ?? [];

  useEffect(() => {
    const next: Record<string, RowState> = {};
    for (const entry of sales ?? []) {
      next[entry.productId] = {
        qty: entry.quantity,
        revenue: entry.revenueGross ?? 0,
        manual: false,
        qtyEdited: false,
      };
    }
    setRows(next);
  }, [sales, period]);

  const sortedProducts = useMemo(
    () =>
      [...(products ?? [])].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name, 'tr');
      }),
    [products],
  );

  const totals = useMemo(() => {
    let units = 0;
    let gross = 0;
    let net = 0;
    for (const product of sortedProducts) {
      const row = rows[product.id];
      if (!row || row.qty <= 0) continue;
      const revenue = revenueOf(row, product.salePrice);
      units += row.qty;
      gross += revenue;
      net += netFromGross(revenue, product.vatRate);
    }
    return { units, gross, net };
  }, [rows, sortedProducts]);

  function updateRow(productId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const base: RowState = { qty: 0, revenue: 0, manual: false, qtyEdited: false };
      return {
        ...prev,
        [productId]: { ...base, ...prev[productId], ...patch },
      };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await setSalesForPeriod(
        period,
        sortedProducts.map((p) => {
          const row = rows[p.id];
          const quantity = row?.qty ?? 0;
          const revenueGross = revenueOf(row, p.salePrice);
          return {
            productId: p.id,
            quantity,
            // Ciro her zaman kaydedilir; ürün fiyatı sonradan değişse de geçmiş satış korunur.
            revenueGross: quantity > 0 ? revenueGross : undefined,
          };
        }),
      );
      toast(`${monthLabel(period)} satışları kaydedildi.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Satışlar kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function copyPrevious() {
    const prev = await db.sales.where('period').equals(previousPeriod(period)).toArray();
    if (prev.length === 0) {
      toast('Önceki dönemde satış kaydı yok.', 'info');
      return;
    }
    const next: Record<string, RowState> = { ...rows };
    for (const entry of prev) {
      next[entry.productId] = {
        qty: entry.quantity,
        revenue: entry.revenueGross ?? 0,
        manual: false,
        qtyEdited: false,
      };
    }
    setRows(next);
    toast('Önceki dönemin adetleri kopyalandı. Kaydetmeyi unutmayın.', 'info');
  }

  function clearAll() {
    setRows({});
    toast('Tablodaki adetler temizlendi. Kaydetmeyi unutmayın.', 'info');
  }

  return (
    <>
      <PageHeader
        title="Satışlar"
        description="Aylık satılan adetleri girin. Gerçekleşen kâr, gider dağıtımı ve başabaş miktarı bu verilere dayanır."
        actions={
          <>
            <Button variant="secondary" onClick={() => void copyPrevious()}>
              Önceki ayı kopyala
            </Button>
            <Button variant="secondary" onClick={clearAll}>
              Temizle
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Kaydet
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <PeriodSelect
          value={period}
          onChange={setPeriod}
          extraPeriods={[...new Set(periods.map((s) => s.period))]}
          label="Dönem"
        />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Satılan adet" value={formatNumber(totals.units)} sub={monthLabel(period)} />
        <StatCard label="Ciro (KDV dahil)" value={formatMoney(totals.gross)} />
        <StatCard label="Ciro (KDV hariç)" value={formatMoney(totals.net)} sub="KDV ayrılmış hali" />
      </div>

      <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-[13px] text-brand-900">
        Buradaki veriler <strong>gerçekleşen</strong> satış kabul edilir. Maliyet ekranlarındaki
        rakamlar ise güncel fiyatlara göre <strong>tahmini</strong>dir.
      </div>

      <Card>
        <CardHeader
          title={`${monthLabel(period)} satış adetleri`}
          description="Ciro alanını boş bırakırsanız adet × satış fiyatı kullanılır. İndirim varsa ciroya elle yazın."
        />
        {sortedProducts.length === 0 ? (
          <EmptyState
            icon={<Icon name="chart" size={28} />}
            title="Ürün yok"
            description="Önce ürün ve reçete oluşturun."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Ürün</th>
                  <th className="px-4 py-2.5 font-medium text-right">Fiyat</th>
                  <th className="px-4 py-2.5 font-medium text-right w-32">Adet</th>
                  <th className="px-4 py-2.5 font-medium text-right w-40">Ciro (KDV dahil)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Net ciro</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => {
                  const row = rows[product.id];
                  const qty = row?.qty ?? 0;
                  const revenue = revenueOf(row, product.salePrice);
                  return (
                    <tr key={product.id} className="border-b border-sand-100 last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium text-ink-900">
                          {product.name}
                          {!product.isActive && <span className="ml-2 text-xs text-ink-500">pasif</span>}
                        </p>
                        <p className="text-xs text-ink-500">{product.category}</p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(product.salePrice)}
                      </td>
                      <td className="px-4 py-2">
                        <NumberField
                          value={qty}
                          onChange={(v) =>
                            updateRow(product.id, {
                              qty: v,
                              manual: false,
                              qtyEdited: true,
                            })
                          }
                          min={0}
                          className="w-28"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <NumberField
                          value={revenue}
                          onChange={(v) => updateRow(product.id, { qty, revenue: v, manual: true })}
                          suffix="₺"
                          min={0}
                          className="w-36"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap text-ink-700">
                        {formatMoney(netFromGross(revenue, product.vatRate))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-sand-50 font-medium">
                  <td className="px-4 py-3" colSpan={2}>
                    Toplam
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totals.units)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
