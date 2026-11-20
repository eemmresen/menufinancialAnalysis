import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { saveProduct } from '@/db/repos';
import { buildScenarioPrices, simulatePrices } from '@/engine/simulation';
import { computeProductCost } from '@/engine/cost';
import { currentPeriod } from '@/lib/dates';
import { formatMoney, formatMoneyShort, formatPercent } from '@/lib/format';
import { useCostModel } from '@/hooks/useCostModel';
import { PageHeader, Card, CardHeader, StatCard, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { NumberField, Select } from '@/components/ui/Field';
import { PeriodSelect } from '@/components/ui/PeriodSelect';
import { useToast } from '@/components/ui/Toast';

export function SimulationPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const model = useCostModel(period);
  const [productId, setProductId] = useState('');
  const [prices, setPrices] = useState<number[]>([]);

  const product = model.products.find((p) => p.id === productId);

  useEffect(() => {
    if (!productId && model.products.length > 0) {
      setProductId(model.products.find((p) => p.isActive)?.id ?? model.products[0].id);
    }
  }, [model.products, productId]);

  useEffect(() => {
    if (product && model.settings) {
      setPrices(buildScenarioPrices(product.salePrice, model.settings));
    }
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenarios = useMemo(() => {
    if (!product || !model.settings) return [];
    return simulatePrices(
      product,
      model.materials,
      model.settings,
      prices,
      model.overheadByProduct[product.id] ?? 0,
      model.overheadAvailable,
    );
  }, [product, model.settings, model.materials, prices, model.overheadByProduct, model.overheadAvailable]);

  const currentCost = useMemo(() => {
    if (!product || !model.settings) return null;
    return computeProductCost({
      product,
      materials: model.materials,
      settings: model.settings,
      overheadPerUnit: model.overheadByProduct[product.id] ?? 0,
      overheadAvailable: model.overheadAvailable,
    });
  }, [product, model.settings, model.materials, model.overheadByProduct, model.overheadAvailable]);

  const chartData = scenarios.map((s) => ({
    fiyat: s.price,
    katki: s.cost.contribution,
    faaliyet: s.cost.overheadAvailable ? s.cost.operatingProfit : 0,
  }));

  const best = [...scenarios]
    .filter((s) => s.cost.overheadAvailable)
    .sort((a, b) => b.cost.operatingProfit - a.cost.operatingProfit)[0];

  async function applyPrice(price: number) {
    if (!product) return;
    await saveProduct({ ...product, salePrice: price, updatedAt: new Date().toISOString() });
    toast(`${product.name} satış fiyatı ${formatMoney(price)} olarak güncellendi.`);
  }

  return (
    <>
      <PageHeader
        title="Fiyat simülasyonu"
        description="Farklı satış fiyatlarının maliyet, katkı payı ve faaliyet kârına etkisini karşılaştırın. Hiçbir değişiklik siz kaydetmeden uygulanmaz."
        actions={
          <Button
            variant="secondary"
            icon={<Icon name="history" size={15} />}
            onClick={() => {
              if (product && model.settings) setPrices(buildScenarioPrices(product.salePrice, model.settings));
            }}
          >
            Senaryoları sıfırla
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Dönem</label>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
        <div className="min-w-56 flex-1 sm:max-w-xs">
          <label className="label">Ürün</label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {model.products.length === 0 && <option value="">Ürün yok</option>}
            {model.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!product || !currentCost ? (
        <Card>
          <EmptyState
            icon={<Icon name="flask" size={28} />}
            title="Ürün seçin"
            description="Simülasyon için önce ürün ve reçete oluşturun."
            action={
              <Link to="/urunler/yeni">
                <Button>Ürün ekle</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Mevcut satış fiyatı" value={formatMoney(currentCost.grossRevenue)} sub={`Net ${formatMoney(currentCost.netRevenue)}`} />
            <StatCard label="Değişken maliyet" value={formatMoney(currentCost.variableCost)} sub={`Hammadde ${formatMoney(currentCost.materialCost)}`} />
            <StatCard
              label="Başabaş fiyat"
              value={currentCost.breakEvenPriceGross !== null ? formatMoney(currentCost.breakEvenPriceGross) : '—'}
              sub="Faaliyet kârının sıfırlandığı fiyat"
              tone="warning"
            />
            <StatCard
              label="Hedef marj fiyatı"
              value={currentCost.targetPriceGross !== null ? formatMoney(currentCost.targetPriceGross) : '—'}
              sub={`Hedef marj ${formatPercent(model.settings?.targetMargin ?? 0, 0)}`}
              tone="good"
            />
          </div>

          <Card>
            <CardHeader
              title="Fiyat senaryoları"
              description="Fiyatları değiştirerek sonuçları anında görün."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icon name="plus" size={14} />}
                  onClick={() => setPrices((prev) => [...prev, Math.round((prev[prev.length - 1] ?? 100) * 1.2)])}
                >
                  Senaryo ekle
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Satış fiyatı</th>
                    <th className="px-4 py-2.5 font-medium text-right">Net gelir</th>
                    <th className="px-4 py-2.5 font-medium text-right">Değişken maliyet</th>
                    <th className="px-4 py-2.5 font-medium text-right">Katkı payı</th>
                    <th className="px-4 py-2.5 font-medium text-right">Gider payı</th>
                    <th className="px-4 py-2.5 font-medium text-right">Faaliyet kârı</th>
                    <th className="px-4 py-2.5 font-medium text-right">Marj</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s, index) => {
                    const isBest = best && s.price === best.price;
                    return (
                      <tr
                        key={`${s.price}-${index}`}
                        className={`border-b border-sand-100 last:border-0 ${isBest ? 'bg-brand-50/50' : ''}`}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <NumberField
                              value={prices[index] ?? s.price}
                              onChange={(v) =>
                                setPrices((prev) => prev.map((p, i) => (i === index ? v : p)))
                              }
                              suffix="₺"
                              min={0}
                              className="w-28"
                            />
                            {isBest && <Badge tone="success">En iyi</Badge>}
                            {s.price === currentCost.grossRevenue && <Badge tone="neutral">Mevcut</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.cost.netRevenue)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.cost.variableCost)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span className={s.cost.contribution < 0 ? 'text-red-600' : ''}>
                            {formatMoney(s.cost.contribution)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.cost.overheadAvailable ? formatMoney(s.cost.overheadPerUnit) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.cost.overheadAvailable ? (
                            <span className={s.cost.operatingProfit < 0 ? 'font-medium text-red-600' : 'font-medium text-brand-700'}>
                              {formatMoney(s.cost.operatingProfit)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.cost.overheadAvailable ? formatPercent(s.cost.operatingMargin) : formatPercent(s.cost.contributionRatio)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Bu fiyatı ürüne uygula"
                              onClick={() => void applyPrice(s.price)}
                            >
                              <Icon name="check" size={15} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              title="Senaryoyu kaldır"
                              onClick={() => setPrices((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <Icon name="trash" size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Fiyat–kâr ilişkisi" description="Seçili senaryolar" />
              <div className="h-72 p-2">
                {chartData.length === 0 ? (
                  <EmptyState title="Senaryo yok" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9e2d4" vertical={false} />
                      <XAxis dataKey="fiyat" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => `₺${v}`} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => formatMoneyShort(v)} width={60} />
                      <Tooltip formatter={(value: unknown) => formatMoney(Number(value))} labelFormatter={(v) => `Fiyat ₺${v}`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="katki" name="Katkı payı" fill="#4f987c" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="faaliyet" name="Faaliyet kârı" fill="#c0653a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Maliyet dökümü" description="Mevcut fiyat üzerinden" />
              <div className="space-y-2 p-4 text-sm">
                <Line2 label="Net satış geliri" value={formatMoney(currentCost.netRevenue)} />
                <Line2 label="Hammadde" value={`− ${formatMoney(currentCost.materialBaseCost)}`} />
                <Line2 label="Fire" value={`− ${formatMoney(currentCost.fireCost)}`} />
                <Line2 label="Ambalaj" value={`− ${formatMoney(currentCost.packagingCost)}`} />
                <Line2 label="İşçilik" value={`− ${formatMoney(currentCost.laborCost)}`} />
                <Line2 label="Komisyon" value={`− ${formatMoney(currentCost.commissionCost)}`} />
                <div className="border-t border-dashed border-sand-200 pt-2">
                  <Line2 label="Katkı payı" value={formatMoney(currentCost.contribution)} strong />
                </div>
                <Line2
                  label="Genel gider payı"
                  value={currentCost.overheadAvailable ? `− ${formatMoney(currentCost.overheadPerUnit)}` : 'veri yok'}
                />
                <div className="border-t border-dashed border-sand-200 pt-2">
                  <Line2
                    label="Faaliyet kârı"
                    value={currentCost.overheadAvailable ? formatMoney(currentCost.operatingProfit) : '—'}
                    strong
                    tone={currentCost.operatingProfit < 0 ? 'bad' : 'good'}
                  />
                </div>
                <p className="pt-2 text-xs text-ink-500">
                  Genel gider payı, bu dönemin satış adetlerine göre dağıtılan toplam giderden gelir.
                  Satış verisi yoksa faaliyet kârı hesaplanmaz.
                </p>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Line2({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-700">{label}</span>
      <span
        className={`tabular-nums ${strong ? 'font-semibold' : ''} ${
          tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-brand-700' : 'text-ink-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
