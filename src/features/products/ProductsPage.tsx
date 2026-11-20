import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteProduct } from '@/db/repos';
import { currentPeriod } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { useCostModel } from '@/hooks/useCostModel';
import { PRODUCT_CATEGORIES } from '@/db/defaults';
import { PageHeader, StatCard, Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import type { Product } from '@/types';

export function ProductsPage() {
  const { toast } = useToast();
  const period = currentPeriod();
  const model = useCostModel(period);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [deleting, setDeleting] = useState<Product | null>(null);

  const rows = useMemo(() => {
    return model.products
      .filter((p) => (category === 'all' ? true : p.category === category))
      .filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
      .map((p) => ({ product: p, cost: model.costById.get(p.id)! }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'tr'));
  }, [model.products, model.costById, category, search]);

  const lossMaking = model.costs.filter((c) => c.overheadAvailable && c.operatingProfit < 0).length;
  const avgMargin =
    model.costs.filter((c) => c.overheadAvailable).length > 0
      ? model.costs
          .filter((c) => c.overheadAvailable)
          .reduce((sum, c) => sum + c.operatingMargin, 0) /
        model.costs.filter((c) => c.overheadAvailable).length
      : 0;

  async function handleDelete() {
    if (!deleting) return;
    await deleteProduct(deleting.id);
    toast('Ürün silindi.', 'info');
    setDeleting(null);
  }

  return (
    <>
      <PageHeader
        title="Ürünler ve reçeteler"
        description="Her ürünün reçetesi hammadde fiyatlarından otomatik hesaplanır. Maliyetler tahminidir; gerçekleşen kâr için satış girin."
        actions={
          <Link to="/urunler/yeni">
            <Button icon={<Icon name="plus" size={16} />}>Yeni ürün</Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ürün sayısı" value={model.products.length} sub={`${model.products.filter((p) => !p.isActive).length} pasif`} />
        <StatCard label="Ortalama faaliyet marjı" value={formatPercent(avgMargin)} sub="Satış verisi olan dönem" />
        <StatCard
          label="Zarar eden ürün"
          value={lossMaking}
          tone={lossMaking > 0 ? 'bad' : 'good'}
          sub="Genel gider payı sonrası"
        />
        <StatCard
          label="Genel gider payı"
          value={model.overheadAvailable ? `${formatMoney(model.allocation?.totalExpense ?? 0)}` : 'Veri yok'}
          sub={
            model.overheadAvailable
              ? `${model.allocation?.method === 'units' ? 'Satılan adet' : 'Ağırlık'} yöntemi · ${formatMoney(
                  (model.allocation?.totalExpense ?? 0) / (model.allocation?.totalUnits || 1),
                )}/adet`
              : 'Satış girilmeden hesaplanamaz'
          }
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 p-3">
          <div className="relative min-w-52 flex-1">
            <Icon name="cup" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sand-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün ara…"
              className="w-full rounded-lg border border-sand-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
            <option value="all">Tüm kategoriler</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="cup" size={28} />}
            title="Ürün bulunamadı"
            description="Reçete oluşturmak için yeni bir ürün ekleyin."
            action={
              <Link to="/urunler/yeni">
                <Button>Ürün ekle</Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Ürün</th>
                  <th className="px-4 py-2.5 font-medium text-right">Satış (KDV dahil)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Değişken maliyet</th>
                  <th className="px-4 py-2.5 font-medium text-right">Katkı payı</th>
                  <th className="px-4 py-2.5 font-medium text-right">Gider payı</th>
                  <th className="px-4 py-2.5 font-medium text-right">Faaliyet kârı</th>
                  <th className="px-4 py-2.5 font-medium text-right">Marj</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product, cost }) => (
                  <tr key={product.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                    <td className="px-4 py-2.5">
                      <Link to={`/urunler/${product.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {product.name}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {product.category}
                        {!product.isActive && ' · pasif'}
                        {product.salePrice <= 0 && ' · fiyat girilmedi'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(cost.grossRevenue)}
                      <span className="block text-xs text-ink-500">net {formatMoney(cost.netRevenue)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(cost.variableCost)}
                      <span className="block text-xs text-ink-500">
                        malz. {formatMoney(cost.materialCost)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <span className={cost.contribution < 0 ? 'text-red-600' : ''}>
                        {formatMoney(cost.contribution)}
                      </span>
                      <span className="block text-xs text-ink-500">{formatPercent(cost.contributionRatio)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {cost.overheadAvailable ? formatMoney(cost.overheadPerUnit) : <Badge tone="warning">Veri yok</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {cost.overheadAvailable ? (
                        <span className={cost.operatingProfit < 0 ? 'font-medium text-red-600' : 'font-medium text-brand-700'}>
                          {formatMoney(cost.operatingProfit)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {cost.overheadAvailable ? (
                        <Badge tone={cost.operatingMargin < 0 ? 'danger' : cost.operatingMargin < 0.3 ? 'warning' : 'success'}>
                          {formatPercent(cost.operatingMargin)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-500">{formatPercent(cost.contributionRatio)} katkı</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Link to={`/urunler/${product.id}`}>
                          <Button size="sm" variant="ghost" title="Düzenle">
                            <Icon name="edit" size={16} />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          title="Sil"
                          onClick={() => setDeleting(product)}
                        >
                          <Icon name="trash" size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!model.overheadAvailable && (
        <p className="mt-4 rounded-xl border border-sand-200 bg-white px-4 py-3 text-xs text-ink-600">
          Faaliyet kârı ve marj için bu dönemde satış adedi gerekir.{' '}
          <Link to="/satislar" className="font-medium text-brand-700 underline">
            Satış gir
          </Link>
          . Katkı payı ise satış verisi olmadan da hesaplanır.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ürün silinsin mi?"
        danger
        confirmLabel="Sil"
        message={
          <p>
            <strong>{deleting?.name}</strong> ve bu ürüne ait satış kayıtları silinecek. Geçmiş maliyet
            anlık görüntüleri korunur.
          </p>
        }
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
