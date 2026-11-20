import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '@/db/schema';
import { useSettings } from '@/hooks/useSettings';
import { allocateOverhead, overheadPerUnitMap } from '@/engine/overhead';
import { computeProductCosts } from '@/engine/cost';
import { businessBreakEven } from '@/engine/breakeven';
import { summarizePeriod } from '@/engine/sales';
import { pricePerBase } from '@/engine/units';
import { currentPeriod, formatDate, monthLabel, recentPeriods, shortMonthLabel } from '@/lib/dates';
import { formatMoney, formatMoneyShort, formatNumber, formatPercent } from '@/lib/format';
import { PageHeader, StatCard, Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { PeriodSelect } from '@/components/ui/PeriodSelect';

const COLORS = ['#1f624c', '#4f987c', '#c0653a', '#bfae91', '#7fb8a0', '#a08d6f', '#123d30', '#d8cdb8'];

export function DashboardPage() {
  const settings = useSettings();
  const products = useLiveQuery(() => db.products.toArray(), []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const lots = useLiveQuery(() => db.materialLots.toArray(), []);
  const [period, setPeriod] = useState(currentPeriod());

  const model = useMemo(() => {
    if (!settings || !products || !materials || !expenses || !sales || !lots) return null;

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
    const summary = summarizePeriod(period, sales, products, costs, allocation, expenses);
    const breakEven = businessBreakEven(expenses, costs, sales, period);

    const months = recentPeriods(6, period);
    const series = months.map((p) => {
      const alloc = allocateOverhead({
        period: p,
        expenses,
        products,
        sales,
        method: settings.defaultOverheadMethod,
      });
      const monthCosts = computeProductCosts(
        products,
        materials,
        settings,
        overheadPerUnitMap(alloc),
        alloc.totalUnits > 0,
      );
      const s = summarizePeriod(p, sales, products, monthCosts, alloc, expenses);
      return {
        label: shortMonthLabel(p),
        ciro: s.revenueNet,
        katki: s.contribution,
        sonuc: s.operatingResult,
      };
    });

    const overheadAvailable = allocation.totalUnits > 0;
    const withOverhead = costs.filter((c) => c.overheadAvailable);
    const profitable = [...(withOverhead.length > 0 ? withOverhead : costs)].sort(
      (a, b) => (b.overheadAvailable ? b.operatingProfit : b.contribution) -
        (a.overheadAvailable ? a.operatingProfit : a.contribution),
    )[0];
    const lowest = [...(costs.filter((c) => c.grossRevenue > 0).length > 0
      ? costs.filter((c) => c.grossRevenue > 0)
      : costs)].sort((a, b) => a.contribution - b.contribution)[0];
    const needsPrice = costs.filter(
      (c) =>
        products.find((p) => p.id === c.productId)?.isActive !== false &&
        (c.grossRevenue <= 0 ||
          c.contribution < 0 ||
          (c.overheadAvailable && c.operatingProfit < 0) ||
          (c.breakEvenPriceGross !== null && c.grossRevenue < c.breakEvenPriceGross)),
    );

    const lotsByMaterial = new Map<string, typeof lots>();    for (const lot of lots) {
      const list = lotsByMaterial.get(lot.materialId) ?? [];
      list.push(lot);
      lotsByMaterial.set(lot.materialId, list);
    }
    const tracked = materials
      .map((m) => ({
        material: m,
        lots: (lotsByMaterial.get(m.id) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .filter((row) => row.lots.length > 0)
      .sort((a, b) => b.lots.length - a.lots.length)
      .slice(0, 5);

    const dates = [...new Set(tracked.flatMap((t) => t.lots.map((l) => l.date)))].sort();
    const priceSeries = dates.map((date) => {
      const row: Record<string, string | number> = { date: formatDate(date).slice(0, 5) };
      for (const { material, lots: mLots } of tracked) {
        const applicable = [...mLots].reverse().find((l) => l.date <= date);
        if (applicable) {
          try {
            row[material.name] = Number(
              pricePerBase(
                applicable.purchasePrice,
                applicable.purchaseQty,
                applicable.purchaseUnit,
                material,
              ).toFixed(4),
            );
          } catch {
            /* dönüşüm yoksa atla */
          }
        }
      }
      return row;
    });

    // Farklı birimler (TL/g, TL/ml, TL/adet) aynı grafikte karşılaştırılabilsin diye
    // her hammadde ilk alışına göre 100 endeksine çevrilir.
    for (const { material } of tracked) {
      const firstRow = priceSeries.find((row) => typeof row[material.name] === 'number');
      const first = firstRow?.[material.name];
      if (typeof first !== 'number' || first <= 0) continue;
      for (const row of priceSeries) {
        const value = row[material.name];
        if (typeof value === 'number') {
          row[material.name] = Number(((value / first) * 100).toFixed(1));
        }
      }
    }

    const expenseByCategory = Object.entries(
      expenses
        .filter((e) => e.period === period)
        .reduce<Record<string, number>>((acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + e.amount;
          return acc;
        }, {}),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      allocation,
      costs,
      summary,
      breakEven,
      overheadAvailable,
      profitable,
      lowest,
      needsPrice,
      series,
      tracked,
      priceSeries,
      expenseByCategory,
      materialValue: materials.reduce((sum, m) => sum + m.purchasePrice * (1 + m.vatRate), 0),
      missingMaterialPrice: materials.filter((m) => m.purchasePrice <= 0).length,
    };
  }, [settings, products, materials, expenses, sales, lots, period]);

  if (!model) {
    return <p className="text-sm text-ink-500">Yükleniyor…</p>;
  }

  const costChart = [...model.costs]
    .filter((c) => c.variableCost > 0)
    .sort((a, b) => b.variableCost - a.variableCost)
    .slice(0, 8)
    .map((c) => ({ name: c.productName, maliyet: c.variableCost, satis: c.netRevenue }));

  const profitChart = [...model.costs]
    .filter((c) => c.netRevenue > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 8)
    .map((c) => ({
      name: c.productName,
      katki: c.contribution,
      faaliyet: c.overheadAvailable ? c.operatingProfit : 0,
    }));

  return (
    <>
      <PageHeader
        title="Panel"
        description="Tahmini maliyetler güncel hammadde fiyatlarından; gerçekleşen sonuçlar satış kayıtlarından hesaplanır."
        actions={
          <div className="flex items-end gap-2">
            <PeriodSelect value={period} onChange={setPeriod} />
            <Link to="/simulasyon">
              <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                <Icon name="flask" size={16} /> Fiyat dene
              </button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Toplam hammadde"
          value={formatNumber(materials?.length ?? 0)}
          sub={`Son alış değeri ${formatMoney(model.materialValue)}`}
          icon={<Icon name="box" />}
        />
        <StatCard
          label="Toplam ürün"
          value={formatNumber(products?.length ?? 0)}
          sub={`${products?.filter((p) => p.isActive).length ?? 0} aktif`}
          icon={<Icon name="cup" />}
        />
        <StatCard
          label="Aylık sabit gider"
          value={formatMoney(model.summary?.fixedExpenses ?? 0)}
          sub={monthLabel(period)}
          icon={<Icon name="wallet" />}
        />
        <StatCard
          label="Aylık değişken gider"
          value={formatMoney(model.summary?.variableExpenses ?? 0)}
          sub={monthLabel(period)}
          icon={<Icon name="wallet" />}
        />
        <StatCard
          label="En kârlı ürün"
          value={model.profitable?.productName ?? '—'}
          sub={
            model.profitable
              ? model.profitable.overheadAvailable
                ? `Faaliyet kârı ${formatMoney(model.profitable.operatingProfit)}`
                : `Katkı payı ${formatMoney(model.profitable.contribution)}`
              : 'Veri yok'
          }
          tone="good"
          icon={<Icon name="chart" />}
        />
        <StatCard
          label="En düşük katkı payı"
          value={model.lowest?.productName ?? '—'}
          sub={
            model.lowest
              ? `Katkı payı ${formatMoney(model.lowest.contribution)} · ${formatPercent(
                  model.lowest.contributionRatio,
                )}`
              : 'Veri yok'
          }
          tone={model.lowest && model.lowest.contribution < 0 ? 'bad' : 'warning'}
          icon={<Icon name="alert" />}
        />
        <StatCard
          label="Başabaş satış miktarı"
          value={model.breakEven?.units !== null ? `${formatNumber(model.breakEven?.units ?? 0)} adet` : 'Hesaplanamadı'}
          sub={
            model.breakEven?.units !== null
              ? `Sabit gider ${formatMoney(model.breakEven?.fixedCosts ?? 0)} / ort. katkı ${formatMoney(
                  model.breakEven?.averageContribution ?? 0,
                )}`
              : 'Satış adedi girilmeli'
          }
          icon={<Icon name="calculator" />}
        />
        <StatCard
          label="Fiyat güncellemesi gereken"
          value={formatNumber(model.needsPrice.length)}
          sub={
            model.needsPrice.length > 0
              ? model.needsPrice.slice(0, 3).map((c) => c.productName).join(', ')
              : 'Tüm ürünler hedefin üzerinde'
          }
          tone={model.needsPrice.length > 0 ? 'bad' : 'good'}
          icon={<Icon name="tag" />}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Ürün bazlı maliyet"
            description="Değişken maliyet (hammadde + fire + ambalaj + işçilik + komisyon)"
          />
          <div className="h-72 p-2">
            {costChart.length === 0 ? (
              <EmptyState title="Maliyet verisi yok" description="Ürün ve reçete ekleyin." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChart} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9e2d4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => formatMoneyShort(v)} width={60} />
                  <Tooltip formatter={(value: unknown) => formatMoney(Number(value))} />
                  <Bar dataKey="maliyet" name="Değişken maliyet" fill="#1f624c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="satis" name="Net satış" fill="#d8cdb8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Ürün bazlı kârlılık"
            description={model.overheadAvailable ? 'Katkı payı ve faaliyet kârı' : 'Genel gider payı için satış verisi gerekir'}
          />
          <div className="h-72 p-2">
            {profitChart.length === 0 ? (
              <EmptyState title="Kârlılık verisi yok" description="Ürün fiyatı ve reçete girin." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitChart} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9e2d4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => formatMoneyShort(v)} width={60} />
                  <Tooltip formatter={(value: unknown) => formatMoney(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="katki" name="Katkı payı" fill="#4f987c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="faaliyet" name="Faaliyet kârı" fill="#c0653a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Gider dağılımı" description={`${monthLabel(period)} · KDV hariç`} />
          <div className="h-72 p-2">
            {model.expenseByCategory.length === 0 ? (
              <EmptyState
                title="Gider yok"
                description="Gider ekleyin."
                action={
                  <Link to="/giderler" className="text-sm font-medium text-brand-700 underline">
                    Giderlere git
                  </Link>
                }
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={model.expenseByCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {model.expenseByCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown) => formatMoney(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hammadde fiyat değişimleri"
            description="İlk alışa göre fiyat endeksi (100 = ilk kayıt)"
          />
          <div className="h-72 p-2">
            {model.priceSeries.length === 0 ? (
              <EmptyState title="Fiyat geçmişi yok" description="Alış kaydı ekledikçe grafik oluşur." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.priceSeries} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9e2d4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} width={55} />
                  <Tooltip formatter={(value: unknown) => `${Number(value).toFixed(1)} endeks`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {model.tracked.map(({ material }, i) => (
                    <Line
                      key={material.id}
                      type="monotone"
                      dataKey={material.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Aylık faaliyet sonucu"
          description="Son 6 dönem · KDV hariç ciro, katkı payı ve genel gider sonrası sonuç"
          action={<Badge tone="info">Tahmini</Badge>}
        />
        <div className="h-80 p-2">
          {model.series.every((s) => s.ciro === 0) ? (
            <EmptyState
              title="Satış verisi yok"
              description="Aylık sonuç grafiği için Satışlar ekranından adet girin."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.series} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9e2d4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => formatMoneyShort(v)} width={62} />
                <Tooltip formatter={(value: unknown) => formatMoney(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ciro" name="Net ciro" fill="#d8cdb8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="katki" name="Katkı payı" fill="#4f987c" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="sonuc" name="Faaliyet sonucu" stroke="#c0653a" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Fiyat güncellemesi gereken ürünler"
            description="Başabaş fiyatın altında veya faaliyet kârı negatif"
            action={<Link to="/simulasyon" className="text-xs font-medium text-brand-700 underline">Simülasyon</Link>}
          />
          {model.needsPrice.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">Tüm ürünler başabaş fiyatın üzerinde.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {model.needsPrice.slice(0, 6).map((c) => (
                <li key={c.productId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link to={`/urunler/${c.productId}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {c.productName}
                  </Link>
                  <div className="text-right text-xs text-ink-500">
                    <p>Fiyat {formatMoney(c.grossRevenue)}</p>
                    <p>Başabaş {c.breakEvenPriceGross !== null ? formatMoney(c.breakEvenPriceGross) : '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Veri durumu" description="Hesaplamaların güvenilirliği için kontrol listesi" />
          <ul className="space-y-2 p-4 text-sm">
            <CheckRow ok={(materials?.length ?? 0) > 0} label="Hammadde kayıtlı" />
            <CheckRow ok={model.missingMaterialPrice === 0} label="Tüm hammaddelerin fiyatı girilmiş" />
            <CheckRow ok={(products?.length ?? 0) > 0} label="Ürün ve reçete tanımlı" />
            <CheckRow ok={(model.summary?.fixedExpenses ?? 0) > 0} label="Sabit giderler girilmiş" />
            <CheckRow ok={model.overheadAvailable} label="Bu dönem satış adedi girilmiş" />
            <CheckRow ok={model.allocation?.warnings.every((w) => !w.includes('satış adedi')) ?? false} label="Gider dağıtımı yapılabiliyor" />
          </ul>
        </Card>
      </div>
    </>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full ${
          ok ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        <Icon name={ok ? 'check' : 'alert'} size={12} />
      </span>
      <span className={ok ? 'text-ink-700' : 'text-ink-900'}>{label}</span>
      {!ok && <span className="ml-auto text-[11px] text-amber-700">eksik</span>}
    </li>
  );
}
