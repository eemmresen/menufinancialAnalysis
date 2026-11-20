import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { closePeriod, reopenPeriod, saveSettings } from '@/db/repos';
import { allocateOverhead, overheadPerUnitMap } from '@/engine/overhead';
import { computeProductCosts } from '@/engine/cost';
import { summarizePeriod } from '@/engine/sales';
import { currentPeriod, formatDate, monthLabel, recentPeriods, shortMonthLabel } from '@/lib/dates';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { exportExcel } from '@/lib/excel';
import { useSettings } from '@/hooks/useSettings';
import { PageHeader, Card, CardHeader, StatCard, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { CheckboxField, Select } from '@/components/ui/Field';
import { PeriodSelect } from '@/components/ui/PeriodSelect';
import { useToast } from '@/components/ui/Toast';

export function ReportsPage() {
  const { toast } = useToast();
  const settings = useSettings();
  const [period, setPeriod] = useState(currentPeriod());
  const [includeVariable, setIncludeVariable] = useState(true);
  const [excludeCommission, setExcludeCommission] = useState(true);
  const [busy, setBusy] = useState(false);

  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];
  const lots = useLiveQuery(() => db.materialLots.toArray(), []) ?? [];
  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const materials = useLiveQuery(() => db.materials.toArray(), []) ?? [];
  const snapshots = useLiveQuery(
    () => db.snapshots.where('period').equals(period).toArray(),
    [period],
  );
  const periodRecord = useLiveQuery(() => db.periods.get(period), [period]);

  const data = useMemo(() => {
    if (!settings) return null;

    const allocation = allocateOverhead({
      period,
      expenses,
      products,
      sales,
      method: settings.defaultOverheadMethod,
      includeVariable,
      excludeCommission,
    });
    const costs = computeProductCosts(
      products,
      materials,
      settings,
      overheadPerUnitMap(allocation),
      allocation.totalUnits > 0,
    );

    // Dönem kapatıldıysa maliyetler dondurulmuş kayıtlardan okunur; sonraki fiyat
    // değişiklikleri geçmiş dönem sonucunu değiştirmez.
    const frozen = (snapshots?.length ?? 0) > 0;
    const reportCosts = frozen ? snapshots!.map((s) => s.cost) : costs;
    const frozenOverhead = frozen
      ? snapshots!.reduce((sum, s) => {
          const units = sales
            .filter((sale) => sale.period === period && sale.productId === s.productId)
            .reduce((q, sale) => q + sale.quantity, 0);
          return sum + units * s.cost.overheadPerUnit;
        }, 0)
      : undefined;

    const summary = summarizePeriod(
      period,
      sales,
      products,
      reportCosts,
      allocation,
      expenses,
      frozenOverhead,
    );

    const months = recentPeriods(6, period);
    const summaries = months.map((p) => {
      const alloc = allocateOverhead({
        period: p,
        expenses,
        products,
        sales,
        method: settings.defaultOverheadMethod,
        includeVariable,
        excludeCommission,
      });
      const monthCosts = computeProductCosts(
        products,
        materials,
        settings,
        overheadPerUnitMap(alloc),
        alloc.totalUnits > 0,
      );
      return summarizePeriod(p, sales, products, monthCosts, alloc, expenses);
    });

    const vatOutput = summary.vatOutput;
    const purchaseLots = lots.filter((l) => l.date.slice(0, 7) === period);
    const vatInput = purchaseLots.reduce((sum, l) => sum + l.purchasePrice * l.vatRate, 0);
    const payable = vatOutput - vatInput;

    const businessTax =
      settings.businessTaxType !== 'none' && summary.operatingResult > 0
        ? summary.operatingResult * settings.businessTaxRate
        : 0;

    return {
      allocation,
      costs: reportCosts,
      frozen,
      summary,
      summaries,
      vatOutput,
      vatInput,
      payable,
      businessTax,
      purchaseLots,
    };
  }, [settings, period, expenses, products, sales, materials, lots, includeVariable, excludeCommission, snapshots]);

  if (!data || !settings) return <p className="text-sm text-ink-500">Yükleniyor…</p>;

  const { allocation, costs, summary, summaries, vatOutput, vatInput, payable } = data;

  async function changeMethod(method: 'units' | 'weight') {
    await saveSettings({ defaultOverheadMethod: method });
    toast(
      method === 'units'
        ? 'Dağıtım yöntemi satılan adet olarak ayarlandı.'
        : 'Dağıtım yöntemi kullanıcı ağırlıkları olarak ayarlandı.',
      'info',
    );
  }

  async function handleClosePeriod() {
    const count = await closePeriod(period);
    toast(`${monthLabel(period)} kapatıldı. ${count} ürünün maliyeti donduruldu.`, 'info');
  }

  async function handleReopen() {
    await reopenPeriod(period);
    toast('Dönem yeniden açıldı. Dondurulmuş maliyetler silinmedi.', 'info');
  }

  async function handleExcel() {
    setBusy(true);
    try {
      await exportExcel({
        summaries,
        costs,
        expenses: expenses.filter((e) => e.period === period),
        allocation,
        products,
        materials,
        lots,
        vat: { output: vatOutput, input: vatInput, payable },
        periodLabel: period,
      });
      toast('Excel dosyası indirildi.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Excel oluşturulamadı.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const periodRecordClosed = periodRecord?.status === 'closed';

  return (
    <div className="print-area">
      <div className="print:hidden">
        <PageHeader
          title="Raporlar"
          description="Maliyet dökümü, gider dağıtımı, KDV özeti ve dönem kapatma. Tüm rakamlar KDV hariçtir; KDV ayrı gösterilir."
          actions={
            <>
              <Button variant="secondary" icon={<Icon name="download" size={15} />} loading={busy} onClick={() => void handleExcel()}>
                Excel
              </Button>
              <Button variant="secondary" icon={<Icon name="receipt" size={15} />} onClick={() => window.print()}>
                Yazdır
              </Button>
              {periodRecordClosed ? (
                <Button variant="secondary" onClick={() => void handleReopen()}>
                  Dönemi yeniden aç
                </Button>
              ) : (
                <Button onClick={() => void handleClosePeriod()}>Dönemi kapat</Button>
              )}
            </>
          }
        />
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 print:hidden">
        <PeriodSelect value={period} onChange={setPeriod} label="Dönem" />
        <div>
          <label className="label">Gider dağıtım yöntemi</label>
          <Select
            value={settings.defaultOverheadMethod}
            onChange={(e) => void changeMethod(e.target.value as 'units' | 'weight')}
          >
            <option value="units">Satılan adet üzerinden</option>
            <option value="weight">Kullanıcı ağırlığı üzerinden</option>
          </Select>
        </div>
        <div className="flex flex-col gap-2 pb-1">
          <CheckboxField
            checked={includeVariable}
            onChange={setIncludeVariable}
            label="Değişken giderleri de dağıt"
          />
          <CheckboxField
            checked={excludeCommission}
            onChange={setExcludeCommission}
            label="Komisyon kategorisini hariç tut"
          />
        </div>
      </div>

      <div className="mb-3 hidden print:block">
        <p className="text-base font-semibold">
          {settings.businessName} · {monthLabel(period)} maliyet ve kârlılık raporu
        </p>
        <p className="text-xs text-ink-500">
          Yazdırma tarihi: {new Date().toLocaleDateString('tr-TR')} · Tutarlar KDV hariçtir.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{monthLabel(period)} raporu</h2>
        <Badge tone="info">Tahmini</Badge>
        {periodRecordClosed && <Badge tone="success">Dönem kapalı · maliyetler donduruldu</Badge>}
      </div>

      {data.frozen && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-900">
          Bu dönem kapatıldığı için maliyet dökümü ve faaliyet sonucu{' '}
          <strong>kapatma anındaki dondurulmuş kayıtlardan</strong> okunuyor. Sonradan yapılan fiyat
          değişiklikleri bu raporu etkilemez.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Net ciro" value={formatMoney(summary.revenueNet)} sub={`${formatNumber(summary.units)} adet`} />
        <StatCard label="Değişken maliyet" value={formatMoney(summary.cogs)} sub="Satılan ürünlerin maliyeti" />
        <StatCard
          label="Katkı payı"
          value={formatMoney(summary.contribution)}
          tone={summary.contribution < 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Dağıtılan gider"
          value={formatMoney(summary.allocatedOverhead)}
          sub={`Sabit ${formatMoney(summary.fixedExpenses)} · Değişken ${formatMoney(summary.variableExpenses)}`}
        />
        <StatCard
          label="Faaliyet sonucu"
          value={summary.hasSales ? formatMoney(summary.operatingResult) : 'Veri yok'}
          tone={summary.operatingResult < 0 ? 'bad' : 'good'}
          sub={summary.hasSales ? 'Katkı payı − dağıtılan gider' : 'Satış adedi girilmeli'}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="KDV özeti" description="Tahmini · resmî beyanname yerine geçmez" />
          <div className="space-y-2.5 p-4 text-sm">
            <Row label="Hesaplanan KDV (satış)" value={formatMoney(vatOutput)} />
            <Row label="İndirilecek KDV (alışlar)" value={formatMoney(vatInput)} />
            <div className="border-t border-dashed border-sand-200 pt-2">
              <Row
                label={payable >= 0 ? 'Tahmini ödenecek KDV' : 'Devreden KDV'}
                value={formatMoney(Math.abs(payable))}
                strong
                tone={payable > 0 ? 'warning' : 'good'}
              />
            </div>
            <p className="pt-1 text-xs leading-relaxed text-ink-500">
              İndirilecek KDV, bu dönem tarihli alış kayıtlarının KDV toplamıdır. Gelir/kurumlar vergisi
              ayrı bir parametredir; işletme türü seçilmeden hesaplanmaz.
            </p>
            {settings.businessTaxType !== 'none' && (
              <div className="rounded-xl bg-sand-50 p-3 text-xs">
                <p className="flex justify-between">
                  <span className="text-ink-500">
                    {settings.businessTaxType === 'corporate' ? 'Kurumlar vergisi' : 'Gelir vergisi'}{' '}
                    provizyonu ({formatPercent(settings.businessTaxRate, 0)})
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(data.businessTax)}</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-500">
                  Yalnızca faaliyet sonucu pozitifse ve seçilen oran üzerinden hesaplanır. Vergi
                  mevzuatına göre kesin hesap değildir.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Gider dağıtımı"
            description={
              allocation.method === 'units'
                ? 'Varsayım: giderler satılan adet oranında dağıtılır'
                : 'Varsayım: giderler ürün ağırlıklarına göre dağıtılır'
            }
            action={<Badge tone="warning">{allocation.method === 'units' ? 'Adet bazlı' : 'Ağırlık bazlı'}</Badge>}
          />
          {allocation.rows.length === 0 ? (
            <EmptyState title="Ürün yok" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left text-[11px] uppercase text-ink-500">
                    <th className="px-4 py-2 font-medium">Ürün</th>
                    <th className="px-4 py-2 font-medium text-right">Adet</th>
                    <th className="px-4 py-2 font-medium text-right">Pay</th>
                    <th className="px-4 py-2 font-medium text-right">Gider payı</th>
                    <th className="px-4 py-2 font-medium text-right">Adet başı</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation.rows
                    .filter((r) => r.units > 0)
                    .map((r) => (
                      <tr key={r.productId} className="border-b border-sand-100 last:border-0">
                        <td className="px-4 py-2">{r.productName}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.units)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatPercent(r.share)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.overhead)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.overheadPerUnit)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="bg-sand-50 font-medium">
                    <td className="px-4 py-2">Toplam</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(allocation.totalUnits)}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(allocation.totalExpense)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {allocation.warnings.length > 0 && (
            <div className="space-y-1 border-t border-sand-200 bg-amber-50/60 px-4 py-2.5 text-[11px] text-amber-900">
              {allocation.warnings.map((w) => (
                <p key={w}>• {w}</p>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Ürün maliyet dökümü" description="Birim maliyet ve kârlılık" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 font-medium">Ürün</th>
                <th className="px-4 py-2 font-medium text-right">Satış</th>
                <th className="px-4 py-2 font-medium text-right">Net gelir</th>
                <th className="px-4 py-2 font-medium text-right">Hammadde</th>
                <th className="px-4 py-2 font-medium text-right">Fire</th>
                <th className="px-4 py-2 font-medium text-right">Değişken</th>
                <th className="px-4 py-2 font-medium text-right">Gider payı</th>
                <th className="px-4 py-2 font-medium text-right">Katkı</th>
                <th className="px-4 py-2 font-medium text-right">Faaliyet kârı</th>
                <th className="px-4 py-2 font-medium text-right">Marj</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.productId} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-2">
                    {c.productName}
                    {!c.overheadAvailable && <span className="ml-2 text-[10px] text-amber-700">veri yok</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.grossRevenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.netRevenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.materialBaseCost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.fireCost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.variableCost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.overheadAvailable ? formatMoney(c.overheadPerUnit) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.contribution)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.overheadAvailable ? formatMoney(c.operatingProfit) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.overheadAvailable ? formatPercent(c.operatingMargin) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Aylık karşılaştırma" description="Son 6 dönem, KDV hariç" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-[11px] uppercase text-ink-500">
                <th className="px-4 py-2 font-medium">Dönem</th>
                <th className="px-4 py-2 font-medium text-right">Adet</th>
                <th className="px-4 py-2 font-medium text-right">Net ciro</th>
                <th className="px-4 py-2 font-medium text-right">Değişken maliyet</th>
                <th className="px-4 py-2 font-medium text-right">Katkı payı</th>
                <th className="px-4 py-2 font-medium text-right">Giderler</th>
                <th className="px-4 py-2 font-medium text-right">Faaliyet sonucu</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.period} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-2">{shortMonthLabel(s.period)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(s.units)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.revenueNet)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.cogs)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.contribution)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(s.fixedExpenses + s.variableExpenses)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.hasSales ? formatMoney(s.operatingResult) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(snapshots?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Dondurulmuş maliyet kayıtları"
            description="Dönem kapatıldığında maliyetler bu haliyle saklanır; sonraki fiyat değişiklikleri geçmişi etkilemez."
          />
          <div className="p-4 text-sm">
            <p className="text-ink-700">
              {snapshots!.length} ürünün maliyeti {formatDate(snapshots![0].createdAt.slice(0, 10))} tarihinde
              donduruldu.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-500">
              {snapshots!.slice(0, 6).map((s) => (
                <span key={s.id} className="rounded-full border border-sand-200 px-2 py-0.5">
                  {s.productName}: {formatMoney(s.cost.variableCost)}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-ink-500">
        Bu rapor resmî muhasebe veya beyanname yerine geçmez. Sonuçlar girilen fiyat, reçete, gider ve
        satış verilerine dayalı tahminlerdir. Örnek verilerle oluşturulan raporlar gerçek işletme
        sonucu sayılmaz.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good' | 'warning';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-700">{label}</span>
      <span
        className={`tabular-nums ${strong ? 'font-semibold' : ''} ${
          tone === 'warning' ? 'text-amber-700' : tone === 'good' ? 'text-brand-700' : 'text-ink-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
