import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Invoice, InvoiceLine, Unit } from '@/types';
import { db } from '@/db/schema';
import { approveInvoice, deleteInvoice, findInvoiceByHash } from '@/db/repos';
import { extractPdfText } from '@/lib/pdfText';
import { ocrImage } from '@/lib/ocr';
import { parseInvoiceText } from '@/lib/invoiceParser';
import { hashFile } from '@/lib/hash';
import { formatDate, todayISO } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/format';
import { uid } from '@/lib/id';
import { PageHeader, StatCard, Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, NumberField, Select, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { UNIT_LABELS, UNITS } from '@/engine/units';
import { round2 } from '@/engine/money';

interface BusyState {
  label: string;
  detail: string;
  progress: number | null;
}

export function InvoicesPage() {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const invoices = useLiveQuery(async () => {
    const rows = await db.invoices.toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState<Invoice | null>(null);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState<{ invoice: Invoice; file: File } | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [dragging, setDragging] = useState(false);

  const pending = (invoices ?? []).filter((i) => i.status === 'draft');
  const approved = (invoices ?? []).filter((i) => i.status === 'approved');
  const totalApproved = approved.reduce((sum, i) => sum + i.totalGross, 0);

  async function processFile(file: File, skipDuplicateCheck = false) {
    setError('');
    if (file.size > 20 * 1024 * 1024) {
      setError('Dosya 20 MB’dan büyük olamaz.');
      return;
    }

    try {
      const hash = await hashFile(file);
      if (!skipDuplicateCheck) {
        const existing = await findInvoiceByHash(hash);
        if (existing) {
          setDuplicate({ invoice: existing, file });
          return;
        }
      }

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      setBusy({ label: 'Belge işleniyor', detail: isPdf ? 'PDF metni çıkarılıyor…' : 'Görsel hazırlanıyor…', progress: null });

      let text = '';
      if (isPdf) {
        text = await extractPdfText(file, (page, total) =>
          setBusy({
            label: 'PDF metni okunuyor',
            detail: `Sayfa ${page} / ${total}`,
            progress: total > 0 ? page / total : null,
          }),
        );
      } else {
        text = await ocrImage(file, (progress, status) =>
          setBusy({ label: 'Görselden metin okunuyor (OCR)', detail: status, progress }),
        );
      }

      const parsed = parseInvoiceText(text);


      const now = new Date().toISOString();
      const invoice: Invoice = {
        id: uid('inv'),
        fileName: file.name,
        fileHash: hash,
        supplierName: parsed.supplierName,
        date: parsed.date,
        totalGross: parsed.totalGross,
        vatTotal: parsed.vatTotal,
        status: 'draft',
        source: isPdf ? 'pdf' : 'ocr',
        rawText: text,
        lines: parsed.lines.map((line) => ({
          id: uid('line'),
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          confidence: line.confidence,
        })),
        createdAt: now,
      };

      await db.invoices.put(invoice);
      setReviewWarnings(parsed.warnings);
      setReviewing(invoice);
      setBusy(null);
      if (text.trim().length === 0) {
        toast('Belgeden metin okunamadı. Alanları elle doldurun.', 'info');
      }
    } catch (err) {
      console.error(err);
      setBusy(null);
      setError(
        err instanceof Error
          ? `Belge işlenemedi: ${err.message}`
          : 'Belge işlenemedi. Farklı bir dosya deneyin.',
      );
    }
  }

  async function createManual() {
    const now = new Date().toISOString();
    const invoice: Invoice = {
      id: uid('inv'),
      fileName: 'Elle girilen fatura',
      fileHash: `manual-${now}`,
      supplierName: '',
      date: todayISO(),
      totalGross: 0,
      vatTotal: 0,
      status: 'draft',
      source: 'pdf',
      rawText: '',
      lines: [],
      createdAt: now,
    };
    await db.invoices.put(invoice);
    setReviewWarnings(['Elle giriş: tüm alanları siz dolduracaksınız.']);
    setReviewing(invoice);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteInvoice(deleting.id);
    setDeleting(null);
    toast('Fatura silindi.', 'info');
  }

  return (
    <>
      <PageHeader
        title="Faturalar"
        description="PDF veya fotoğraf yükleyin. Metin tamamen cihazınızda okunur; hiçbir belge sunucuya gönderilmez."
        actions={
          <Button variant="secondary" icon={<Icon name="plus" size={15} />} onClick={() => void createManual()}>
            Elle fatura gir
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Onay bekleyen" value={pending.length} tone={pending.length > 0 ? 'warning' : 'good'} sub="Onaylanmadan alış kaydı oluşmaz" />
        <StatCard label="Onaylanan fatura" value={approved.length} sub={`Toplam ${formatMoney(totalApproved)} (KDV dahil)`} />
        <StatCard
          label="Okunan belge"
          value={invoices?.length ?? 0}
          sub={`${(invoices ?? []).filter((i) => i.source === 'ocr').length} OCR · ${(invoices ?? []).filter((i) => i.source === 'pdf').length} PDF/elle`}
        />
      </div>

      <Card>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void processFile(file);
          }}
          className={`m-4 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-sand-300 bg-sand-50/50'
          }`}
        >
          {busy ? (
            <div className="mx-auto max-w-sm">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink-900">
                <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                {busy.label}
              </p>
              <p className="mt-1 text-xs text-ink-500">{busy.detail}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${Math.round((busy.progress ?? 0.08) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Icon name="upload" size={28} className="mx-auto text-sand-400" />
              <p className="mt-2 text-sm font-medium text-ink-900">
                Fatura dosyasını sürükleyin veya seçin
              </p>
              <p className="mt-1 text-xs text-ink-500">
                PDF, JPG veya PNG · en fazla 20 MB · Türkçe OCR yerel çalışır
              </p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => fileInput.current?.click()}
              >
                Dosya seç
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void processFile(file);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>

        {error && (
          <p className="mx-4 mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="border-t border-sand-200 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
          Ayrıştırma “en iyi çaba” ile yapılır; fatura düzenleri farklı olduğu için her alanı kontrol
          etmeniz beklenir. Mükerrer dosyalar SHA-256 parmak iziyle tespit edilir.
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Fatura geçmişi" description="Onaylanan faturalar alış fiyatı geçmişine işlenir." />
        {(invoices ?? []).length === 0 ? (
          <EmptyState
            icon={<Icon name="receipt" size={28} />}
            title="Henüz fatura yok"
            description="PDF veya fotoğraf yükleyerek başlayın."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Belge</th>
                  <th className="px-4 py-2.5 font-medium">Tedarikçi</th>
                  <th className="px-4 py-2.5 font-medium">Tarih</th>
                  <th className="px-4 py-2.5 font-medium text-right">Toplam</th>
                  <th className="px-4 py-2.5 font-medium text-right">KDV</th>
                  <th className="px-4 py-2.5 font-medium">Durum</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((invoice) => (
                  <tr key={invoice.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                    <td className="px-4 py-2.5">
                      <p className="max-w-56 truncate font-medium text-ink-900">{invoice.fileName}</p>
                      <p className="text-xs text-ink-500">
                        {invoice.source === 'ocr' ? 'OCR' : 'PDF / elle'} · {invoice.lines.length} kalem
                      </p>
                    </td>
                    <td className="px-4 py-2.5">{invoice.supplierName || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(invoice.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(invoice.totalGross)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(invoice.vatTotal)}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          invoice.status === 'approved'
                            ? 'success'
                            : invoice.status === 'draft'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {invoice.status === 'approved'
                          ? 'Onaylandı'
                          : invoice.status === 'draft'
                            ? 'Onay bekliyor'
                            : 'İptal'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="İncele"
                          onClick={() => {
                            setReviewWarnings([]);
                            setReviewing(invoice);
                          }}
                        >
                          <Icon name="edit" size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          title="Sil"
                          onClick={() => setDeleting(invoice)}
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

      {reviewing && (
        <InvoiceReviewModal
          invoice={reviewing}
          materials={materials ?? []}
          warnings={reviewWarnings}
          onClose={() => setReviewing(null)}
          onApproved={(result) => {
            setReviewing(null);
            toast(
              `Fatura onaylandı. ${result.lots} alış kaydı işlendi, ${result.createdMaterials} yeni hammadde oluşturuldu.`,
            );
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(duplicate)}
        title="Bu fatura daha önce yüklenmiş"
        confirmLabel="Yine de yükle"
        message={
          <>
            <p>
              Aynı dosya {duplicate ? formatDate(duplicate.invoice.createdAt.slice(0, 10)) : ''} tarihinde
              yüklenmiş ({duplicate?.invoice.status === 'approved' ? 'onaylanmış' : 'onay bekliyor'}).
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Devam ederseniz ikinci bir kayıt oluşur. Alışların iki kez sayılmaması için dikkatli olun.
            </p>
          </>
        }
        onConfirm={() => {
          const file = duplicate?.file;
          setDuplicate(null);
          if (file) void processFile(file, true);
        }}
        onCancel={() => setDuplicate(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Fatura silinsin mi?"
        danger
        confirmLabel="Sil"
        message={
          <p>
            {deleting?.fileName} silinecek. Onaylanmış bir fatura ise daha önce oluşturduğu alış
            kayıtları silinmez; bunları hammadde geçmişinden ayrıca kontrol edin.
          </p>
        }
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function InvoiceReviewModal({
  invoice,
  materials,
  warnings,
  onClose,
  onApproved,
}: {
  invoice: Invoice;
  materials: Array<{ id: string; name: string }>;
  warnings: string[];
  onClose: () => void;
  onApproved: (result: { lots: number; createdMaterials: number; updatedMaterials: number }) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Invoice>(invoice);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const allInvoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];

  const similar = allInvoices.find(
    (inv) =>
      inv.id !== draft.id &&
      (inv.fileHash === draft.fileHash ||
        (draft.supplierName.trim().length > 2 &&
          draft.totalGross > 0 &&
          inv.supplierName.trim().toLocaleLowerCase('tr-TR') ===
            draft.supplierName.trim().toLocaleLowerCase('tr-TR') &&
          inv.date === draft.date &&
          Math.abs(inv.totalGross - draft.totalGross) < 0.01)),
  );

  const lineTotal = useMemo(
    () => round2(draft.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)),
    [draft.lines],
  );
  const lineVat = useMemo(
    () => round2(draft.lines.reduce((sum, l) => sum + l.qty * l.unitPrice * l.vatRate, 0)),
    [draft.lines],
  );

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  function addLine() {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: uid('line'),
          description: '',
          qty: 1,
          unit: 'adet',
          unitPrice: 0,
          vatRate: 0.2,
          confidence: 1,
        },
      ],
    }));
  }

  async function saveDraft() {
    await db.invoices.put(draft);
    toast('Taslak kaydedildi. Onaylanmadığı için alış kaydı oluşmadı.', 'info');
    onClose();
  }

  async function approve() {
    if (!draft.supplierName.trim()) {
      setError('Tedarikçi adı zorunlu.');
      return;
    }
    if (!draft.date) {
      setError('Fatura tarihi zorunlu.');
      return;
    }
    const validLines = draft.lines.filter((l) => l.description.trim() && l.qty > 0);
    if (validLines.length === 0) {
      setError('En az bir geçerli satır kalemi gerekli.');
      return;
    }
    setSaving(true);
    try {
      const result = await approveInvoice({ ...draft, lines: validLines });
      onApproved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fatura onaylanamadı.');
    } finally {
      setSaving(false);
    }
  }

  const approved = draft.status === 'approved';

  return (
    <Modal
      open
      onClose={onClose}
      title={invoice.fileName}
      description="Onaylamadan önce tüm alanları kontrol edin. Onaylanan satırlar hammadde alış geçmişine işlenir."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {!approved && (
            <>
              <Button variant="secondary" onClick={() => void saveDraft()}>
                Taslak kaydet
              </Button>
              <Button loading={saving} onClick={() => void approve()}>
                Onayla ve alışa işle
              </Button>
            </>
          )}
        </>
      }
    >
      {similar && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">Benzer bir fatura zaten kayıtlı:</p>
          <p className="mt-0.5">
            {similar.fileName} · {formatDate(similar.date)} · {formatMoney(similar.totalGross)} ·{' '}
            {similar.status === 'approved' ? 'onaylanmış' : 'onay bekliyor'}
          </p>
          <p className="mt-1">
            Aynı alışı iki kez işlememek için kontrol edin. Onaylarsanız ayrı bir alış kaydı oluşur.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {warnings.map((w) => (
            <p key={w} className="flex gap-1.5">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {approved && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">
          Bu fatura onaylanmış. Alış kayıtları oluşturulmuş durumda; değişiklik için faturayı silip
          yeniden yüklemeniz gerekir.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tedarikçi" required>
          <TextInput
            value={draft.supplierName}
            disabled={approved}
            onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })}
          />
        </Field>
        <Field label="Fatura tarihi" required>
          <TextInput
            type="date"
            value={draft.date}
            disabled={approved}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Genel toplam (KDV dahil)">
          <NumberField
            value={draft.totalGross}
            onChange={(v) => setDraft({ ...draft, totalGross: v })}
            suffix="₺"
            min={0}
          />
        </Field>
        <Field label="Toplam KDV">
          <NumberField
            value={draft.vatTotal}
            onChange={(v) => setDraft({ ...draft, vatTotal: v })}
            suffix="₺"
            min={0}
          />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Satır kalemleri</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, totalGross: round2(lineTotal + lineVat), vatTotal: lineVat })}>
              Toplamı satırlardan hesapla
            </Button>
            {!approved && (
              <Button size="sm" variant="secondary" icon={<Icon name="plus" size={13} />} onClick={addLine}>
                Kalem ekle
              </Button>
            )}
          </div>
        </div>

        {draft.lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand-300 py-6 text-center text-sm text-ink-500">
            Kalem yok. Elle ekleyin.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-sand-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50 text-left text-[10px] uppercase tracking-wide text-ink-500">
                  <th className="px-2 py-2 font-medium">Açıklama</th>
                  <th className="px-2 py-2 font-medium w-20">Miktar</th>
                  <th className="px-2 py-2 font-medium w-24">Birim</th>
                  <th className="px-2 py-2 font-medium w-28">Birim fiyat</th>
                  <th className="px-2 py-2 font-medium w-28">KDV</th>
                  <th className="px-2 py-2 font-medium w-40">Hammadde eşleşmesi</th>
                  <th className="px-2 py-2 font-medium text-right w-24">Tutar</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line) => (
                  <tr key={line.id} className="border-b border-sand-100 last:border-0">
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={line.description}
                        disabled={approved}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        placeholder="Ürün / hizmet"
                        className="min-w-40"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumberField value={line.qty} onChange={(v) => updateLine(line.id, { qty: v })} min={0} disabled={approved} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={line.unit}
                        disabled={approved}
                        onChange={(e) => updateLine(line.id, { unit: e.target.value as Unit })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <NumberField value={line.unitPrice} onChange={(v) => updateLine(line.id, { unitPrice: v })} suffix="₺" min={0} disabled={approved} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={line.vatRate}
                        disabled={approved}
                        onChange={(e) => updateLine(line.id, { vatRate: Number(e.target.value) })}
                      >
                        {[0, 0.01, 0.08, 0.1, 0.18, 0.2].map((r) => (
                          <option key={r} value={r}>
                            %{(r * 100).toLocaleString('tr-TR')}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={line.materialId ?? ''}
                        disabled={approved}
                        onChange={(e) => updateLine(line.id, { materialId: e.target.value || undefined })}
                      >
                        <option value="">Yeni hammadde oluştur</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(line.qty * line.unitPrice)}
                    </td>
                    <td className="px-1 py-1.5">
                      {!approved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() =>
                            setDraft({ ...draft, lines: draft.lines.filter((l) => l.id !== line.id) })
                          }
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 rounded-xl bg-sand-50 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-500">Satır toplamı (KDV hariç)</p>
          <p className="font-medium tabular-nums">{formatMoney(lineTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-500">Hesaplanan KDV</p>
          <p className="font-medium tabular-nums">{formatMoney(lineVat)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-500">Genel toplam</p>
          <p className="font-medium tabular-nums">{formatMoney(lineTotal + lineVat)}</p>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {draft.rawText && (
        <details className="mt-4 rounded-xl border border-sand-200">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-700">
            Okunan ham metni göster ({formatNumber(draft.rawText.length)} karakter)
          </summary>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap border-t border-sand-200 bg-sand-50 p-3 text-[11px] leading-relaxed text-ink-700">
            {draft.rawText}
          </pre>
        </details>
      )}
    </Modal>
  );
}
