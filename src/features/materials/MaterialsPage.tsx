import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Material, MaterialLot, Supplier, Unit } from '@/types';
import { db } from '@/db/schema';
import { MATERIAL_CATEGORIES, UNIT_OPTIONS } from '@/db/defaults';
import { deleteMaterial, productsUsingMaterial, saveMaterial, addMaterialLot } from '@/db/repos';
import { materialPricePerBase } from '@/engine/recipe';
import { baseUnitOf, hasPackageDefinition, pricePerBase, UNIT_LABELS } from '@/engine/units';
import { formatDate, todayISO } from '@/lib/dates';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { uid } from '@/lib/id';
import { PageHeader, StatCard, EmptyState, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import {
  Field,
  NumberField,
  PercentField,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/hooks/useSettings';

interface FormState {
  id: string;
  name: string;
  category: string;
  purchaseQty: number;
  purchaseUnit: Unit;
  purchasePrice: number;
  vatRate: number;
  purchaseDate: string;
  wasteRate: number;
  packageSize: number;
  packageUnit: Unit;
  supplierId: string;
  newSupplier: string;
  notes: string;
}

function emptyForm(vatRate: number): FormState {
  return {
    id: '',
    name: '',
    category: 'Diğer',
    purchaseQty: 1,
    purchaseUnit: 'kg',
    purchasePrice: 0,
    vatRate,
    purchaseDate: todayISO(),
    wasteRate: 0,
    packageSize: 1,
    packageUnit: 'adet',
    supplierId: '',
    newSupplier: '',
    notes: '',
  };
}

function toForm(m: Material): FormState {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    purchaseQty: m.purchaseQty,
    purchaseUnit: m.purchaseUnit,
    purchasePrice: m.purchasePrice,
    vatRate: m.vatRate,
    purchaseDate: m.purchaseDate,
    wasteRate: m.wasteRate,
    packageSize: m.packageSize ?? 1,
    packageUnit: m.packageUnit ?? 'adet',
    supplierId: m.supplierId ?? '',
    newSupplier: '',
    notes: m.notes ?? '',
  };
}

export function MaterialsPage() {
  const { toast } = useToast();
  const settings = useSettings();
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<FormState | null>(null);
  const [historyFor, setHistoryFor] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<string[]>([]);

  const vatRates = settings?.vatRates ?? [0, 0.01, 0.1, 0.2];

  const filtered = useMemo(() => {
    const list = materials ?? [];
    return list
      .filter((m) => (category === 'all' ? true : m.category === category))
      .filter((m) => m.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [materials, category, search]);

  const totalValue = useMemo(
    () => (materials ?? []).reduce((sum, m) => sum + m.purchasePrice * (1 + m.vatRate), 0),
    [materials],
  );
  const missingPrice = (materials ?? []).filter((m) => m.purchasePrice <= 0).length;

  async function handleDelete() {
    if (!deleting) return;
    await deleteMaterial(deleting.id);
    toast('Hammadde silindi.', 'info');
    setDeleting(null);
    setDeleteInfo([]);
  }

  async function askDelete(m: Material) {
    setDeleting(m);
    setDeleteInfo(await productsUsingMaterial(m.id));
  }

  return (
    <>
      <PageHeader
        title="Hammaddeler"
        description="Alış fiyatları, birim dönüşümleri ve fire oranları. Fiyat değiştiğinde tüm reçeteler otomatik güncellenir."
        actions={
          <Button icon={<Icon name="plus" size={16} />} onClick={() => setEditing(emptyForm(settings?.defaultPurchaseVatRate ?? 0.2))}>
            Yeni hammadde
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Hammadde sayısı" value={materials?.length ?? 0} />
        <StatCard
          label="Son alışların KDV dahil değeri"
          value={formatMoney(totalValue)}
          sub="Her hammaddenin son alış tutarı toplamı"
        />
        <StatCard
          label="Fiyatı girilmemiş"
          value={missingPrice}
          tone={missingPrice > 0 ? 'warning' : 'good'}
          sub={missingPrice > 0 ? 'Maliyetler eksik hesaplanıyor' : 'Tüm hammaddelerin fiyatı var'}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 p-3">
          <div className="relative min-w-52 flex-1">
            <Icon
              name="box"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sand-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hammadde ara…"
              className="w-full rounded-lg border border-sand-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="all">Tüm kategoriler</option>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="box" size={28} />}
            title="Hammadde bulunamadı"
            description="Yeni hammadde ekleyerek reçetelerde kullanmaya başlayın."
            action={
              <Button onClick={() => setEditing(emptyForm(settings?.defaultPurchaseVatRate ?? 0.2))}>
                Hammadde ekle
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Hammadde</th>
                  <th className="px-4 py-2.5 font-medium">Alış</th>
                  <th className="px-4 py-2.5 font-medium text-right">Birim fiyat</th>
                  <th className="px-4 py-2.5 font-medium text-right">KDV</th>
                  <th className="px-4 py-2.5 font-medium text-right">Fire</th>
                  <th className="px-4 py-2.5 font-medium">Son alış</th>
                  <th className="px-4 py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const base = baseUnitOf(m.purchaseUnit, m);
                  const unitPrice = m.purchasePrice > 0 ? materialPricePerBase(m) : 0;
                  return (
                    <tr key={m.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink-900">{m.name}</p>
                        <p className="text-xs text-ink-500">{m.category}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {formatNumber(m.purchaseQty)} {UNIT_LABELS[m.purchaseUnit]}
                        <span className="block text-xs text-ink-500">
                          {formatMoney(m.purchasePrice)} + KDV
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {unitPrice > 0 ? (
                          <>
                            {formatMoney(unitPrice)}
                            <span className="text-xs text-ink-500">/{base}</span>
                          </>
                        ) : (
                          <Badge tone="warning">Fiyat yok</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatPercent(m.vatRate, 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {m.wasteRate > 0 ? formatPercent(m.wasteRate) : '—'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-700">
                        {formatDate(m.purchaseDate)}
                        <span className="block text-xs text-ink-500">
                          {(suppliers ?? []).find((s) => s.id === m.supplierId)?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Alış geçmişi"
                            onClick={() => setHistoryFor(m)}
                          >
                            <Icon name="history" size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Düzenle"
                            onClick={() => setEditing(toForm(m))}
                          >
                            <Icon name="edit" size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Sil"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => void askDelete(m)}
                          >
                            <Icon name="trash" size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(products?.length ?? 0) === 0 && (materials?.length ?? 0) > 0 && (
        <p className="mt-4 text-xs text-ink-500">
          İpucu: Hammadde ekledikten sonra Ürünler ekranından reçete oluşturabilirsiniz.
        </p>
      )}

      {editing && (
        <MaterialFormModal
          form={editing}
          suppliers={suppliers ?? []}
          vatRates={vatRates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Hammadde kaydedildi.');
          }}
        />
      )}

      {historyFor && (
        <PriceHistoryModal
          material={historyFor}
          suppliers={suppliers ?? []}
          vatRates={vatRates}
          onClose={() => setHistoryFor(null)}
          onSaved={() => toast('Yeni alış kaydı eklendi.')}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hammadde silinsin mi?"
        danger
        confirmLabel="Sil"
        message={
          <>
            <p>
              <strong>{deleting?.name}</strong> kalıcı olarak silinecek. Alış geçmişi de silinir.
            </p>
            {deleteInfo.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-amber-900">
                Bu hammadde {deleteInfo.length} üründe kullanılıyor: {deleteInfo.join(', ')}. Bu
                ürünlerin maliyeti eksik hesaplanacak.
              </p>
            )}
          </>
        }
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleting(null);
          setDeleteInfo([]);
        }}
      />
    </>
  );
}

function MaterialFormModal({
  form: initial,
  suppliers,
  vatRates,
  onClose,
  onSaved,
}: {
  form: FormState;
  suppliers: Supplier[];
  vatRates: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const base = baseUnitOf(form.purchaseUnit, form);
  let unitPrice = 0;
  if (form.purchaseQty > 0 && form.purchasePrice > 0) {
    try {
      unitPrice = pricePerBase(form.purchasePrice, form.purchaseQty, form.purchaseUnit, form);
    } catch {
      unitPrice = 0;
    }
  }

  async function submit() {
    if (!form.name.trim()) {
      setError('Hammadde adı zorunlu.');
      return;
    }
    if (form.purchaseQty <= 0) {
      setError('Alış miktarı sıfırdan büyük olmalı.');
      return;
    }
    if (form.purchaseUnit === 'paket' && !hasPackageDefinition(form)) {
      setError('Paket birimi için paket içi miktar ve birim girilmeli.');
      return;
    }

    let supplierId = form.supplierId || undefined;
    if (form.newSupplier.trim()) {
      const supplier: Supplier = { id: uid('sup'), name: form.newSupplier.trim() };
      await db.suppliers.put(supplier);
      supplierId = supplier.id;
    }

    const now = new Date().toISOString();
    const material: Material = {
      id: form.id || uid('mat'),
      name: form.name.trim(),
      category: form.category,
      purchaseQty: form.purchaseQty,
      purchaseUnit: form.purchaseUnit,
      purchasePrice: form.purchasePrice,
      vatRate: form.vatRate,
      supplierId,
      purchaseDate: form.purchaseDate || todayISO(),
      wasteRate: form.wasteRate,
      packageSize: form.purchaseUnit === 'paket' ? form.packageSize : undefined,
      packageUnit: form.purchaseUnit === 'paket' ? form.packageUnit : undefined,
      notes: form.notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveMaterial(material);
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Kayıt yapılamadı.', 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'Hammaddeyi düzenle' : 'Yeni hammadde'}
      description="Alış fiyatı KDV hariç girilir. KDV oranı maliyete eklenmez, ayrı takip edilir."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()}>Kaydet</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hammadde adı" required className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Örn. Espresso çekirdeği"
            invalid={!form.name.trim() && Boolean(error)}
          />
        </Field>

        <Field label="Kategori">
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tedarikçi">
          <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">Seçilmedi</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Alış miktarı" required>
          <NumberField value={form.purchaseQty} onChange={(v) => set('purchaseQty', v)} min={0} />
        </Field>

        <Field label="Alış birimi">
          <Select
            value={form.purchaseUnit}
            onChange={(e) => set('purchaseUnit', e.target.value as Unit)}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </Select>
        </Field>

        {form.purchaseUnit === 'paket' && (
          <>
            <Field label="1 paket kaç birim?" required>
              <NumberField value={form.packageSize} onChange={(v) => set('packageSize', v)} min={0} />
            </Field>
            <Field label="Paket içi birim">
              <Select
                value={form.packageUnit}
                onChange={(e) => set('packageUnit', e.target.value as Unit)}
              >
                {UNIT_OPTIONS.filter((u) => u !== 'paket').map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field
          label="Alış fiyatı (KDV hariç, toplam)"
          required
          hint={
            unitPrice > 0
              ? `Birim maliyet: ${formatMoney(unitPrice)}/${base} · KDV dahil: ${formatMoney(
                  form.purchasePrice * (1 + form.vatRate),
                )}`
              : 'Alış miktarının toplam tutarı'
          }
        >
          <NumberField value={form.purchasePrice} onChange={(v) => set('purchasePrice', v)} suffix="₺" min={0} />
        </Field>

        <Field label="KDV oranı" hint="Alış KDV'si indirilecek KDV olarak takip edilir.">
          <Select value={form.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))}>
            {vatRates.map((rate) => (
              <option key={rate} value={rate}>
                %{(rate * 100).toLocaleString('tr-TR')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Alış tarihi">
          <TextInput
            type="date"
            value={form.purchaseDate}
            onChange={(e) => set('purchaseDate', e.target.value)}
          />
        </Field>

        <Field label="Fire oranı" hint="Maliyet = tutar / (1 − fire). Örn. %10 fire maliyeti %11,1 artırır.">
          <PercentField value={form.wasteRate} onChange={(v) => set('wasteRate', v)} />
        </Field>

        <Field label="Yeni tedarikçi" hint="Listede yoksa buraya yazın, kayıtla birlikte oluşturulur.">
          <TextInput
            value={form.newSupplier}
            onChange={(e) => set('newSupplier', e.target.value)}
            placeholder="Tedarikçi adı"
          />
        </Field>

        <Field label="Açıklama" className="sm:col-span-2">
          <TextArea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </Modal>
  );
}

function PriceHistoryModal({
  material,
  suppliers,
  vatRates,
  onClose,
  onSaved,
}: {
  material: Material;
  suppliers: Supplier[];
  vatRates: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const lots = useLiveQuery(
    () => db.materialLots.where('materialId').equals(material.id).toArray(),
    [material.id],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [lot, setLot] = useState({
    date: todayISO(),
    qty: material.purchaseQty,
    unit: material.purchaseUnit,
    price: material.purchasePrice,
    vatRate: material.vatRate,
    supplierId: material.supplierId ?? '',
    notes: '',
  });
  const [error, setError] = useState('');

  const sorted = useMemo(
    () => [...(lots ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [lots],
  );

  async function addLot() {
    if (lot.qty <= 0) {
      setError('Miktar sıfırdan büyük olmalı.');
      return;
    }
    const entry: MaterialLot = {
      id: uid('lot'),
      materialId: material.id,
      date: lot.date,
      purchaseQty: lot.qty,
      purchaseUnit: lot.unit,
      purchasePrice: lot.price,
      vatRate: lot.vatRate,
      supplierId: lot.supplierId || undefined,
      notes: lot.notes || undefined,
      createdAt: new Date().toISOString(),
    };
    await addMaterialLot(entry);
    setShowAdd(false);
    setError('');
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${material.name} · alış geçmişi`}
      description="Eski fiyatlar korunur; geçmiş dönem maliyetleri geriye dönük değişmez."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Button icon={<Icon name="plus" size={15} />} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Formu kapat' : 'Yeni alış ekle'}
          </Button>
        </>
      }
    >
      {showAdd && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tarih">
              <TextInput type="date" value={lot.date} onChange={(e) => setLot({ ...lot, date: e.target.value })} />
            </Field>
            <Field label="Miktar">
              <NumberField value={lot.qty} onChange={(v) => setLot({ ...lot, qty: v })} min={0} />
            </Field>
            <Field label="Birim">
              <Select value={lot.unit} onChange={(e) => setLot({ ...lot, unit: e.target.value as Unit })}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Toplam fiyat (KDV hariç)">
              <NumberField value={lot.price} onChange={(v) => setLot({ ...lot, price: v })} suffix="₺" min={0} />
            </Field>
            <Field label="KDV">
              <Select
                value={lot.vatRate}
                onChange={(e) => setLot({ ...lot, vatRate: Number(e.target.value) })}
              >
                {vatRates.map((r) => (
                  <option key={r} value={r}>
                    %{(r * 100).toLocaleString('tr-TR')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tedarikçi">
              <Select
                value={lot.supplierId}
                onChange={(e) => setLot({ ...lot, supplierId: e.target.value })}
              >
                <option value="">Seçilmedi</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => void addLot()}>
              Alışı kaydet
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">Henüz alış kaydı yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-[11px] uppercase text-ink-500">
                <th className="px-2 py-2 font-medium">Tarih</th>
                <th className="px-2 py-2 font-medium">Miktar</th>
                <th className="px-2 py-2 font-medium text-right">Tutar (KDV hariç)</th>
                <th className="px-2 py-2 font-medium text-right">KDV</th>
                <th className="px-2 py-2 font-medium">Tedarikçi</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id} className="border-b border-sand-100 last:border-0">
                  <td className="px-2 py-2">{formatDate(l.date)}</td>
                  <td className="px-2 py-2">
                    {formatNumber(l.purchaseQty)} {UNIT_LABELS[l.purchaseUnit]}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(l.purchasePrice)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatPercent(l.vatRate, 0)}</td>
                  <td className="px-2 py-2 text-ink-700">
                    {suppliers.find((s) => s.id === l.supplierId)?.name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-500">
        Not: Alış fiyatını değiştirdiğinizde eski fiyat alış geçmişinde korunur. Geçmiş dönem
        raporları, o dönemde kaydedilen maliyet anlık görüntülerinden okunur.
      </p>
    </Modal>
  );
}
