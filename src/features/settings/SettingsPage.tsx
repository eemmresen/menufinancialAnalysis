import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppSettings, BusinessTaxType } from '@/types';
import { db } from '@/db/schema';
import { getDataCounts, exportBackup, importBackup, readBackupFile, downloadBackupFile, BACKUP_TABLES, type BackupFile, type BackupCounts } from '@/db/backup';
import { clearDemoData, resetAllData, seedDemoData } from '@/db/seed';
import { saveSettings } from '@/db/repos';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { CheckboxField, Field, NumberField, PercentField, Select, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/hooks/useSettings';
import { formatNumber } from '@/lib/format';

const TABLE_LABELS: Record<string, string> = {
  settings: 'Ayarlar',
  suppliers: 'Tedarikçiler',
  materials: 'Hammaddeler',
  materialLots: 'Alış geçmişi',
  products: 'Ürünler',
  expenses: 'Giderler',
  sales: 'Satış kayıtları',
  invoices: 'Faturalar',
  periods: 'Dönemler',
  snapshots: 'Maliyet anlık görüntüleri',
};

export function SettingsPage() {
  const { toast } = useToast();
  const settings = useSettings();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [counts, setCounts] = useState<BackupCounts>({});
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [restoring, setRestoring] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [newRate, setNewRate] = useState(8);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    void getDataCounts().then(setCounts);
  }, [settings]);

  const countsLive = useLiveQuery(async () => {
    const entries = await Promise.all(
      BACKUP_TABLES.map(async (name) => [name, await db.table(name).count()] as const),
    );
    return Object.fromEntries(entries) as BackupCounts;
  }, []);
  const tableCounts = countsLive ?? counts;

  const totalRows = useMemo(
    () => Object.values(tableCounts).reduce((sum, n) => sum + n, 0),
    [tableCounts],
  );

  if (!form) return <p className="text-sm text-ink-500">Yükleniyor…</p>;

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    await saveSettings(form!);
    toast('Ayarlar kaydedildi.');
  }

  function addRate() {
    const rate = Math.round((newRate / 100) * 10000) / 10000;
    if (rate < 0 || rate > 1) {
      toast('Oran 0 ile 100 arasında olmalı.', 'error');
      return;
    }
    if (form!.vatRates.some((r) => Math.abs(r - rate) < 1e-9)) {
      toast('Bu oran zaten tanımlı.', 'info');
      return;
    }
    set('vatRates', [...form!.vatRates, rate].sort((a, b) => a - b));
  }

  async function handleExport() {
    const backup = await exportBackup();
    downloadBackupFile(backup);
    toast('JSON yedek indirildi.');
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      setPending(backup);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Yedek okunamadı.', 'error');
    }
  }

  async function restore() {
    if (!pending) return;
    setRestoring(true);
    try {
      const result = await importBackup(pending, importMode);
      const rows = Object.values(result.imported).reduce((sum, n) => sum + n, 0);
      toast(`Yedek geri yüklendi: ${rows} kayıt.`);
      setPending(null);
      void getDataCounts().then(setCounts);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Geri yükleme başarısız.', 'error');
    } finally {
      setRestoring(false);
    }
  }

  async function handleReset() {
    if (resetText.trim().toLocaleUpperCase('tr-TR') !== 'SIFIRLA') return;
    await resetAllData();
    setResetOpen(false);
    setResetText('');
    toast('Tüm veriler silindi, ayarlar varsayılana döndü.', 'info');
  }

  return (
    <>
      <PageHeader
        title="Ayarlar"
        description="Vergi oranları, maliyet varsayımları ve veri yönetimi. Tüm veriler yalnızca bu tarayıcıda saklanır."
        actions={<Button onClick={() => void save()}>Ayarları kaydet</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="İşletme" description="Rapor başlıklarında görünür." />
          <div className="grid gap-4 p-4">
            <Field label="İşletme adı">
              <TextInput
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
                placeholder="momo"
              />
            </Field>
            <Field label="Hedef faaliyet kâr marjı" hint="Önerilen satış fiyatı bu marja göre hesaplanır.">
              <PercentField value={form.targetMargin} onChange={(v) => set('targetMargin', v)} />
            </Field>
            <Field label="Saatlik işçilik ücreti" hint="Dakika bazlı işçilik maliyeti bu tutardan hesaplanır.">
              <NumberField value={form.hourlyLaborCost} onChange={(v) => set('hourlyLaborCost', v)} suffix="₺" min={0} />
            </Field>
            <Field label="Varsayılan gider dağıtım yöntemi">
              <Select
                value={form.defaultOverheadMethod}
                onChange={(e) => set('defaultOverheadMethod', e.target.value as 'units' | 'weight')}
              >
                <option value="units">Satılan adet üzerinden</option>
                <option value="weight">Kullanıcı ağırlığı üzerinden</option>
              </Select>
            </Field>
            <Field label="Önerilen fiyat yuvarlama">
              <Select
                value={form.priceRounding}
                onChange={(e) => set('priceRounding', e.target.value as AppSettings['priceRounding'])}
              >
                <option value="none">Yuvarlama yok</option>
                <option value="0.5">0,50 ₺ adıma yukarı</option>
                <option value="1">1 ₺ adıma yukarı</option>
                <option value="5">5 ₺ adıma yukarı</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Vergi"
            description="Oranlar kayıt anında saklanır; sonradan değiştirmek geçmiş kayıtları etkilemez."
          />
          <div className="space-y-4 p-4">
            <div>
              <p className="label">Tanımlı KDV oranları</p>
              <p className="mb-2 text-xs text-ink-500">
                Oranları düzenleyebilir veya yeni oran ekleyebilirsiniz. Kayıtlı alış ve satışlarda
                kullanılan oranlar değişmez.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {form.vatRates.map((rate, index) => (
                  <div
                    key={`rate-${index}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-white pl-2"
                  >
                    <NumberField
                      value={Math.round(rate * 10000) / 100}
                      onChange={(v) =>
                        set(
                          'vatRates',
                          form.vatRates
                            .map((r, i) => (i === index ? v / 100 : r))
                            .sort((a, b) => a - b),
                        )
                      }
                      suffix="%"
                      min={0}
                      max={100}
                      className="w-20"
                    />
                    {form.vatRates.length > 1 && (
                      <button
                        className="px-1.5 py-2 text-sand-500 hover:text-red-600"
                        onClick={() => set('vatRates', form.vatRates.filter((_, i) => i !== index))}
                        aria-label="Oranı kaldır"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-end gap-2">
                <NumberField
                  value={newRate}
                  onChange={setNewRate}
                  suffix="%"
                  min={0}
                  max={100}
                  className="w-24"
                />
                <Button size="sm" variant="secondary" icon={<Icon name="plus" size={13} />} onClick={addRate}>
                  Oran ekle
                </Button>
              </div>
            </div>

            <Field label="Varsayılan alış KDV oranı">
              <Select
                value={form.defaultPurchaseVatRate}
                onChange={(e) => set('defaultPurchaseVatRate', Number(e.target.value))}
              >
                {form.vatRates.map((r) => (
                  <option key={r} value={r}>
                    %{(r * 100).toLocaleString('tr-TR')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Varsayılan satış KDV oranı">
              <Select
                value={form.defaultSaleVatRate}
                onChange={(e) => set('defaultSaleVatRate', Number(e.target.value))}
              >
                {form.vatRates.map((r) => (
                  <option key={r} value={r}>
                    %{(r * 100).toLocaleString('tr-TR')}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
              <Field
                label="İşletme vergi türü"
                hint="İşletme türü bilinmeden kesin vergi hesabı yapılmaz. Bu yalnızca tahmini provizyondur."
              >
                <Select
                  value={form.businessTaxType}
                  onChange={(e) => set('businessTaxType', e.target.value as BusinessTaxType)}
                >
                  <option value="none">Hesaplama (varsayılan)</option>
                  <option value="income">Gelir vergisi (şahıs)</option>
                  <option value="corporate">Kurumlar vergisi</option>
                </Select>
              </Field>
              {form.businessTaxType !== 'none' && (
                <div className="mt-3">
                  <Field label="Tahmini vergi oranı">
                    <PercentField
                      value={form.businessTaxRate}
                      onChange={(v) => set('businessTaxRate', v)}
                    />
                  </Field>
                </div>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                Uygulama resmî muhasebe veya beyanname hazırlama sistemi değildir. KDV dışındaki
                vergiler yalnızca bilgilendirme amaçlı tahmin edilir.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Veri yönetimi" description="Yedekleme, geri yükleme ve sıfırlama." />
          <div className="space-y-4 p-4">
            <div className="rounded-xl border border-sand-200">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-sm sm:grid-cols-3">
                {BACKUP_TABLES.map((name) => (
                  <div key={name} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-500">{TABLE_LABELS[name]}</span>
                    <span className="tabular-nums">{formatNumber(tableCounts[name] ?? 0)}</span>
                  </div>
                ))}
              </div>
              <p className="border-t border-sand-200 px-3 py-2 text-xs text-ink-500">
                Toplam {formatNumber(totalRows)} kayıt · IndexedDB
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Icon name="download" size={15} />} onClick={() => void handleExport()}>
                JSON yedek indir
              </Button>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-sand-300 bg-white px-4 text-sm font-medium hover:bg-sand-50">
                <Icon name="upload" size={15} /> Yedekten geri yükle
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="rounded-xl bg-sand-50 p-3 text-xs leading-relaxed text-ink-600">
              Yedek dosyası tüm tabloları içerir. Geri yüklemede “değiştir” mevcut veriyi siler,
              “birleştir” aynı kimlikli kayıtların üzerine yazar. İşlem öncesi yedek almanız önerilir.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await seedDemoData();
                  await saveSettings({ demoData: true });
                  toast('Örnek veriler yüklendi.', 'info');
                }}
              >
                Örnek verileri yükle
              </Button>
              <Button variant="secondary" onClick={() => setConfirmClearDemo(true)}>
                Örnek verileri kaldır
              </Button>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
              <p className="text-sm font-medium text-red-800">Tüm verileri sıfırla</p>
              <p className="mt-1 text-xs text-red-700">
                Hammadde, ürün, gider, satış ve fatura kayıtları kalıcı olarak silinir. Ayarlar
                varsayılana döner.
              </p>
              <Button variant="danger" size="sm" className="mt-2" onClick={() => setResetOpen(true)}>
                Sıfırla
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Uygulama hakkında" />
          <div className="space-y-3 p-4 text-sm leading-relaxed text-ink-700">
            <p>
              Tüm hesaplamalar tarayıcıda deterministik formüllerle yapılır. Yapay zekâ, harici OCR
              servisi veya API anahtarı kullanılmaz; internet bağlantısı olmadan çalışır.
            </p>
            <p className="flex items-start gap-2 text-xs text-ink-500">
              <Icon name="check" size={14} className="mt-0.5 shrink-0" />
              Veriler IndexedDB’de saklanır. Tarayıcı verilerini temizlerseniz kayıtlar da silinir;
              düzenli JSON yedeği alın.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone="success">Çevrimdışı</Badge>
              <Badge tone="success">KDV ayrı takip</Badge>
              <Badge tone="warning">Tahmini sonuçlar</Badge>
              <Badge tone="neutral">Türkçe</Badge>
            </div>
            <p className="text-xs text-ink-500">
              Menü fiyatları momo menüsünden alınmıştır. Malzeme alış fiyatları örnek amaçlıdır.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => void save()}>Ayarları kaydet</Button>
      </div>

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title="Yedeği geri yükle"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Vazgeç
            </Button>
            <Button variant={importMode === 'replace' ? 'danger' : 'primary'} loading={restoring} onClick={() => void restore()}>
              {importMode === 'replace' ? 'Mevcut veriyi değiştir' : 'Birleştir'}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              Yedek tarihi: {new Date(pending.exportedAt).toLocaleString('tr-TR')} · Sürüm:{' '}
              {pending.schemaVersion}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-sand-50 p-3 text-sm">
              {BACKUP_TABLES.map((name) => (
                <div key={name} className="flex justify-between gap-2">
                  <span className="text-xs text-ink-500">{TABLE_LABELS[name]}</span>
                  <span className="tabular-nums">{formatNumber(pending.tables[name]?.length ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <CheckboxField
                checked={importMode === 'replace'}
                onChange={(v) => setImportMode(v ? 'replace' : 'merge')}
                label="Mevcut veriyi değiştir"
                hint="İşaretliyse tüm tablolar silinip yedek yüklenir. İşaretsizse kayıtlar birleştirilir."
              />
            </div>
            {importMode === 'replace' && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Mevcut tüm kayıtlar silinecek. Bu işlem geri alınamaz.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Tüm verileri sıfırla"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              disabled={resetText.trim().toLocaleUpperCase('tr-TR') !== 'SIFIRLA'}
              onClick={() => void handleReset()}
            >
              Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          Bu işlem geri alınamaz. Onaylamak için aşağıya <strong>SIFIRLA</strong> yazın.
        </p>
        <div className="mt-3">
          <TextInput value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="SIFIRLA" />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClearDemo}
        title="Örnek veriler kaldırılsın mı?"
        danger
        confirmLabel="Kaldır"
        message={
          <p>
            Yalnızca <code className="rounded bg-sand-100 px-1">dm-</code> ile başlayan örnek kayıtlar
            silinir. Kendi eklediğiniz veriler korunur; ancak örnek ürünlere bağlı satış kayıtları da
            silineceği için bunları kontrol edin.
          </p>
        }
        onConfirm={() => {
          void clearDemoData().then(() => {
            setConfirmClearDemo(false);
            toast('Örnek veriler kaldırıldı.', 'info');
          });
        }}
        onCancel={() => setConfirmClearDemo(false)}
      />
    </>
  );
}
