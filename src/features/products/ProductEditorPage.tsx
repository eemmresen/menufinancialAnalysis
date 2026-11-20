import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/db/schema';
import { saveProduct, deleteProduct } from '@/db/repos';
import type { LaborMode, Product, RecipeItem, Unit } from '@/types';
import { PRODUCT_CATEGORIES } from '@/db/defaults';
import { computeProductCost } from '@/engine/cost';
import { computeRecipeCost, materialPricePerBase } from '@/engine/recipe';
import { baseUnitOf, convert, isConvertible, UNIT_LABELS } from '@/engine/units';
import { currentPeriod } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { uid } from '@/lib/id';
import { fileToDataUrl } from '@/lib/image';
import { useCostModel } from '@/hooks/useCostModel';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/Modal';
import {
  CheckboxField,
  Field,
  NumberField,
  PercentField,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

function emptyProduct(): Product {
  const now = new Date().toISOString();
  return {
    id: uid('p'),
    name: '',
    category: 'Sıcak Kahve',
    salePrice: 0,
    vatRate: 0.1,
    wasteRate: 0,
    packagingCost: 0,
    laborMode: 'minutes',
    laborCost: 0,
    laborMinutes: 3,
    commissionRate: 0,
    overheadWeight: 1,
    isActive: true,
    recipe: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function ProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const model = useCostModel(currentPeriod());
  const [draft, setDraft] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setDraft(emptyProduct());
      return;
    }
    db.products.get(id).then((product) => {
      if (cancelled) return;
      if (product) setDraft(product);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const materialsById = useMemo(
    () => Object.fromEntries(model.materials.map((m) => [m.id, m])),
    [model.materials],
  );

  const cost = useMemo(() => {
    if (!draft || !model.settings) return null;
    return computeProductCost({
      product: draft,
      materials: model.materials,
      settings: model.settings,
      overheadPerUnit: model.overheadByProduct[draft.id] ?? 0,
      overheadAvailable: model.overheadAvailable,
    });
  }, [draft, model.settings, model.materials, model.overheadByProduct, model.overheadAvailable]);

  const recipePreview = useMemo(
    () => (draft ? computeRecipeCost(draft, materialsById) : null),
    [draft, materialsById],
  );

  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  function updateItem(itemId: string, patch: Partial<RecipeItem>) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            recipe: prev.recipe.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
          }
        : prev,
    );
  }

  function addItem() {
    if (!draft) return;
    const available = model.materials.find((m) => !draft.recipe.some((r) => r.materialId === m.id));
    const material = available ?? model.materials[0];
    if (!material) {
      toast('Önce hammadde eklemelisiniz.', 'error');
      return;
    }
    setDraft({
      ...draft,
      recipe: [
        ...draft.recipe,
        { id: uid('r'), materialId: material.id, qty: 1, unit: material.purchaseUnit },
      ],
    });
  }

  function removeItem(itemId: string) {
    if (!draft) return;
    setDraft({ ...draft, recipe: draft.recipe.filter((item) => item.id !== itemId) });
  }

  async function handleImage(file: File | undefined) {
    if (!file || !draft) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      set('imageDataUrl', dataUrl);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Görsel yüklenemedi.', 'error');
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError('Ürün adı zorunlu.');
      return;
    }
    if (draft.recipe.some((item) => item.qty <= 0)) {
      setError('Reçetedeki tüm miktarlar sıfırdan büyük olmalı.');
      return;
    }
    const product: Product = {
      ...draft,
      name: draft.name.trim(),
      updatedAt: new Date().toISOString(),
    };
    await saveProduct(product);
    toast('Ürün kaydedildi.');
    navigate('/urunler');
  }

  async function handleDelete() {
    if (!draft) return;
    await deleteProduct(draft.id);
    toast('Ürün silindi.', 'info');
    navigate('/urunler');
  }

  if (notFound) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-700">Ürün bulunamadı. Silinmiş olabilir.</p>
        <Link to="/urunler" className="mt-4 inline-block">
          <Button variant="secondary">Ürünlere dön</Button>
        </Link>
      </Card>
    );
  }

  if (!draft) return <p className="text-sm text-ink-500">Yükleniyor…</p>;

  const vatRates = model.settings?.vatRates ?? [0, 0.01, 0.1, 0.2];

  return (
    <>
      <PageHeader
        title={id ? 'Ürünü düzenle' : 'Yeni ürün'}
        description="Reçete miktarları hammaddenin alış biriminden bağımsız girilebilir; dönüşüm otomatik yapılır."
        actions={
          <>
            <Link to="/urunler">
              <Button variant="secondary">Vazgeç</Button>
            </Link>
            {id && (
              <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                Sil
              </Button>
            )}
            <Button onClick={() => void save()}>Kaydet</Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Ürün bilgileri" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Ürün adı" required className="sm:col-span-2">
                <TextInput
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Örn. Latte"
                  invalid={!draft.name.trim() && Boolean(error)}
                />
              </Field>
              <Field label="Kategori">
                <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Satış fiyatı (KDV dahil)" required>
                <NumberField
                  value={draft.salePrice}
                  onChange={(v) => set('salePrice', v)}
                  suffix="₺"
                  min={0}
                />
              </Field>
              <Field label="Satış KDV oranı">
                <Select value={draft.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))}>
                  {vatRates.map((r) => (
                    <option key={r} value={r}>
                      %{(r * 100).toLocaleString('tr-TR')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ürün fire oranı" hint="Reçete toplamına uygulanır (hazırlama kaybı).">
                <PercentField value={draft.wasteRate} onChange={(v) => set('wasteRate', v)} />
              </Field>
              <div className="sm:col-span-2">
                <CheckboxField
                  checked={draft.isActive}
                  onChange={(v) => set('isActive', v)}
                  label="Ürün aktif (menüde satılıyor)"
                />
              </div>
              <Field label="Açıklama" className="sm:col-span-2">
                <TextArea
                  value={draft.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Menü notu, ekstra seçenekler…"
                />
              </Field>
              <Field label="Ürün görseli (isteğe bağlı)" className="sm:col-span-2">
                <div className="flex items-center gap-3">
                  {draft.imageDataUrl ? (
                    <img
                      src={draft.imageDataUrl}
                      alt="Ürün görseli"
                      className="size-16 rounded-xl border border-sand-200 object-cover"
                    />
                  ) : (
                    <div className="grid size-16 place-items-center rounded-xl border border-dashed border-sand-300 text-sand-400">
                      <Icon name="cup" size={22} />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="cursor-pointer text-[13px] font-medium text-brand-700 underline">
                      Görsel seç
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleImage(e.target.files?.[0])}
                      />
                    </label>
                    {draft.imageDataUrl && (
                      <button
                        className="text-left text-xs text-red-600"
                        onClick={() => set('imageDataUrl', undefined)}
                      >
                        Görseli kaldır
                      </button>
                    )}
                    <p className="text-[11px] text-ink-500">Tarayıcıda küçültülür, sunucuya gitmez.</p>
                  </div>
                </div>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Reçete"
              description="Miktarlar; gramaj, mililitre veya adet olarak girilebilir."
              action={
                <Button size="sm" variant="secondary" icon={<Icon name="plus" size={14} />} onClick={addItem}>
                  Malzeme ekle
                </Button>
              }
            />
            {draft.recipe.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">
                Reçete boş. Hammadde ekleyerek maliyet hesaplanmasını sağlayın.
              </p>
            ) : (
              <div className="divide-y divide-sand-100">
                {draft.recipe.map((item) => {
                  const material = materialsById[item.materialId];
                  let rowCost = 0;
                  let rowError = '';
                  if (material) {
                    try {
                      const qtyBase = convert(
                        item.qty,
                        item.unit,
                        baseUnitOf(material.purchaseUnit, material),
                        material,
                      );
                      rowCost = qtyBase * materialPricePerBase(material);
                    } catch (err) {
                      rowError = err instanceof Error ? err.message : 'Birim hatası';
                    }
                  } else {
                    rowError = 'Malzeme silinmiş';
                  }
                  const units = material
                    ? (['kg', 'g', 'l', 'ml', 'adet', 'paket'] as Unit[]).filter((u) =>
                        isConvertible(u, baseUnitOf(material.purchaseUnit, material), material),
                      )
                    : (['kg', 'g', 'l', 'ml', 'adet', 'paket'] as Unit[]);

                  return (
                    <div key={item.id} className="grid grid-cols-12 items-end gap-2 px-4 py-2.5">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="label">Malzeme</label>
                        <Select
                          value={item.materialId}
                          onChange={(e) => {
                            const next = model.materials.find((m) => m.id === e.target.value);
                            updateItem(item.id, {
                              materialId: e.target.value,
                              unit: next ? next.purchaseUnit : 'g',
                            });
                          }}
                        >
                          {model.materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <label className="label">Miktar</label>
                        <NumberField
                          value={item.qty}
                          onChange={(v) => updateItem(item.id, { qty: v })}
                          min={0}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <label className="label">Birim</label>
                        <Select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value as Unit })}
                        >
                          {units.map((u) => (
                            <option key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-4 sm:col-span-2 sm:text-right">
                        <label className="label">Maliyet</label>
                        <p className="py-2 text-sm tabular-nums">
                          {rowError ? <span className="text-xs text-red-600">{rowError}</span> : formatMoney(rowCost)}
                        </p>
                      </div>
                      <div className="col-span-1 flex justify-end pb-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          title="Kaldır"
                          onClick={() => removeItem(item.id)}
                        >
                          <Icon name="trash" size={15} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-sand-50/60 px-4 py-2.5 text-sm">
                  <span className="text-ink-500">Reçete hammadde maliyeti</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(recipePreview?.materialBaseCost ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Diğer maliyetler" description="Ambalaj, işçilik ve satış komisyonu." />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Ambalaj maliyeti (₺/adet)">
                <NumberField value={draft.packagingCost} onChange={(v) => set('packagingCost', v)} suffix="₺" min={0} />
              </Field>
              <Field label="İşçilik yöntemi">
                <Select
                  value={draft.laborMode}
                  onChange={(e) => set('laborMode', e.target.value as LaborMode)}
                >
                  <option value="minutes">Dakika × saatlik ücret</option>
                  <option value="fixed">Sabit tutar / adet</option>
                </Select>
              </Field>
              {draft.laborMode === 'minutes' ? (
                <Field
                  label="Üretim süresi (dakika)"
                  hint={`Saatlik işçilik: ${formatMoney(model.settings?.hourlyLaborCost ?? 0)} (Ayarlar)`}
                >
                  <NumberField value={draft.laborMinutes} onChange={(v) => set('laborMinutes', v)} min={0} />
                </Field>
              ) : (
                <Field label="İşçilik (₺/adet)">
                  <NumberField value={draft.laborCost} onChange={(v) => set('laborCost', v)} suffix="₺" min={0} />
                </Field>
              )}
              <Field label="Satış komisyonu" hint="Kredi kartı / platform kesintisi. Net gelir üzerinden hesaplanır.">
                <PercentField value={draft.commissionRate} onChange={(v) => set('commissionRate', v)} />
              </Field>
              <Field
                label="Gider dağıtım ağırlığı"
                hint="Ağırlık yönteminde kullanılır. Varsayılan 1."
              >
                <NumberField value={draft.overheadWeight} onChange={(v) => set('overheadWeight', v)} min={0} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader
              title="Maliyet ve kârlılık"
              description={model.overheadAvailable ? 'Tahmini · genel gider payı dahil' : 'Tahmini · satış verisi yok'}
              action={<Badge tone="info">Tahmini</Badge>}
            />
            {cost && (
              <div className="space-y-2.5 p-4 text-sm">
                <Row label="Satış fiyatı (KDV dahil)" value={formatMoney(cost.grossRevenue)} strong />
                <Row label={`KDV (${formatPercent(draft.vatRate, 0)})`} value={`− ${formatMoney(cost.vatAmount)}`} muted />
                <Row label="KDV hariç gelir" value={formatMoney(cost.netRevenue)} />
                <div className="my-2 border-t border-dashed border-sand-200" />
                <Row label="Hammadde" value={formatMoney(cost.materialBaseCost)} muted />
                <Row label="Fire maliyeti" value={formatMoney(cost.fireCost)} muted />
                <Row label="Ambalaj" value={formatMoney(cost.packagingCost)} muted />
                <Row label="İşçilik" value={formatMoney(cost.laborCost)} muted />
                <Row label="Komisyon" value={formatMoney(cost.commissionCost)} muted />
                <Row label="Değişken maliyet" value={formatMoney(cost.variableCost)} strong />
                <Row
                  label="Genel gider payı"
                  value={cost.overheadAvailable ? formatMoney(cost.overheadPerUnit) : 'veri yok'}
                  muted
                />
                <div className="my-2 border-t border-dashed border-sand-200" />
                <Row label="Katkı payı" value={formatMoney(cost.contribution)} strong />
                <Row
                  label="Faaliyet kârı"
                  value={cost.overheadAvailable ? formatMoney(cost.operatingProfit) : '—'}
                  strong
                  tone={cost.operatingProfit < 0 ? 'bad' : 'good'}
                />
                <Row
                  label="Faaliyet marjı"
                  value={cost.overheadAvailable ? formatPercent(cost.operatingMargin) : '—'}
                />
                <div className="mt-3 rounded-xl bg-sand-50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-500">Başabaş fiyat</span>
                    <span className="font-medium tabular-nums">
                      {cost.breakEvenPriceGross !== null ? formatMoney(cost.breakEvenPriceGross) : '—'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-500">Hedef marj fiyatı</span>
                    <span className="font-medium tabular-nums text-brand-700">
                      {cost.targetPriceGross !== null ? formatMoney(cost.targetPriceGross) : '—'}
                    </span>
                  </div>
                  {cost.targetPriceGross !== null && (
                    <Button
                      size="sm"
                      variant="subtle"
                      className="mt-2 w-full"
                      onClick={() => set('salePrice', cost.targetPriceGross!)}
                    >
                      Önerilen fiyatı uygula
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {cost && cost.warnings.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/60">
              <div className="space-y-1.5 p-4 text-xs text-amber-900">
                {cost.warnings.map((w) => (
                  <p key={w} className="flex gap-1.5">
                    <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            </Card>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-ink-500">
            Maliyetler hammadde alış fiyatlarından hesaplanır. KDV maliyete dahil edilmez; satış KDV'si
            gelirden ayrılır. Gerçekleşen kâr için Satışlar ekranından adet girin.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <ConfirmDialog
        open={confirmDelete}
        title="Ürün silinsin mi?"
        danger
        confirmLabel="Sil"
        message={<p>{draft.name} ve satış kayıtları silinecek.</p>}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-xs text-ink-500' : 'text-ink-700'}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'font-semibold' : ''} ${
          tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-brand-700' : 'text-ink-900'
        } ${muted ? 'text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

