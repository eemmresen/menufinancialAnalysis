import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Expense, ExpenseType } from '@/types';
import { db } from '@/db/schema';
import { deleteExpense, saveExpense } from '@/db/repos';
import { expenseCategories } from '@/db/defaults';
import { currentPeriod, formatDate, monthLabel, recentPeriods, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { uid } from '@/lib/id';
import { PageHeader, StatCard, Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, NumberField, Select, TextArea, TextInput } from '@/components/ui/Field';
import { PeriodSelect } from '@/components/ui/PeriodSelect';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/hooks/useSettings';

export function ExpensesPage() {
  const { toast } = useToast();
  const settings = useSettings();
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const [period, setPeriod] = useState(currentPeriod());
  const [typeFilter, setTypeFilter] = useState<'all' | ExpenseType>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const periods = useMemo(() => [...new Set((expenses ?? []).map((e) => e.period))], [expenses]);

  const filtered = useMemo(
    () =>
      (expenses ?? [])
        .filter((e) => e.period === period)
        .filter((e) => (typeFilter === 'all' ? true : e.type === typeFilter))
        .sort((a, b) => a.category.localeCompare(b.category, 'tr')),
    [expenses, period, typeFilter],
  );

  const periodAll = (expenses ?? []).filter((e) => e.period === period);
  const fixed = periodAll.filter((e) => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
  const variable = periodAll.filter((e) => e.type === 'variable').reduce((s, e) => s + e.amount, 0);

  const year = period.slice(0, 4);
  const yearRows = useMemo(() => {
    const months = recentPeriods(12).filter((p) => p.startsWith(year));
    return months.map((p) => {
      const rows = (expenses ?? []).filter((e) => e.period === p);
      return {
        period: p,
        fixed: rows.filter((e) => e.type === 'fixed').reduce((s, e) => s + e.amount, 0),
        variable: rows.filter((e) => e.type === 'variable').reduce((s, e) => s + e.amount, 0),
      };
    });
  }, [expenses, year]);

  const yearTotals = yearRows.reduce(
    (acc, r) => ({ fixed: acc.fixed + r.fixed, variable: acc.variable + r.variable }),
    { fixed: 0, variable: 0 },
  );

  function newExpense(type: ExpenseType): Expense {
    return {
      id: uid('exp'),
      name: '',
      type,
      category: type === 'fixed' ? 'Kira' : 'Elektrik',
      amount: 0,
      vatRate: 0,
      period,
      date: todayISO(),
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteExpense(deleting.id);
    toast('Gider silindi.', 'info');
    setDeleting(null);
  }

  return (
    <>
      <PageHeader
        title="Giderler"
        description="Sabit ve değişken giderler dönem bazında tutulur. Ürünlere dağıtım Raporlar ekranında yapılır."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Icon name="plus" size={15} />}
              onClick={() => setEditing(newExpense('fixed'))}
            >
              Sabit gider
            </Button>
            <Button icon={<Icon name="plus" size={15} />} onClick={() => setEditing(newExpense('variable'))}>
              Değişken gider
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <PeriodSelect value={period} onChange={setPeriod} extraPeriods={periods} label="Dönem" />
        <div>
          <label className="label">Tür</label>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | ExpenseType)}>
            <option value="all">Tümü</option>
            <option value="fixed">Sabit</option>
            <option value="variable">Değişken</option>
          </Select>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sabit gider" value={formatMoney(fixed)} sub={monthLabel(period)} />
        <StatCard label="Değişken gider" value={formatMoney(variable)} sub={monthLabel(period)} />
        <StatCard
          label="Toplam gider"
          value={formatMoney(fixed + variable)}
          sub={`${periodAll.length} kayıt · KDV hariç`}
        />
      </div>

      <Card>
        <CardHeader title={`${monthLabel(period)} giderleri`} description="Tutarlar KDV hariçtir." />
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="wallet" size={28} />}
            title="Bu dönemde gider yok"
            description="Kira, personel, elektrik gibi giderleri ekleyin."
            action={<Button onClick={() => setEditing(newExpense('fixed'))}>Gider ekle</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Gider</th>
                  <th className="px-4 py-2.5 font-medium">Tür</th>
                  <th className="px-4 py-2.5 font-medium">Tarih</th>
                  <th className="px-4 py-2.5 font-medium text-right">Tutar (KDV hariç)</th>
                  <th className="px-4 py-2.5 font-medium text-right">KDV</th>
                  <th className="px-4 py-2.5 font-medium text-right">KDV dahil</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-900">{e.name}</p>
                      <p className="text-xs text-ink-500">{e.category}{e.notes ? ` · ${e.notes}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={e.type === 'fixed' ? 'neutral' : 'info'}>
                        {e.type === 'fixed' ? 'Sabit' : 'Değişken'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(e.amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPercent(e.vatRate, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(e.amount * (1 + e.vatRate))}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Düzenle" onClick={() => setEditing(e)}>
                          <Icon name="edit" size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          title="Sil"
                          onClick={() => setDeleting(e)}
                        >
                          <Icon name="trash" size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sand-50 text-sm font-medium">
                  <td className="px-4 py-2.5" colSpan={3}>
                    Toplam
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(filtered.reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td />
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(filtered.reduce((s, e) => s + e.amount * (1 + e.vatRate), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader
          title={`${year} yıllık gider özeti`}
          description={`Sabit ${formatMoney(yearTotals.fixed)} · Değişken ${formatMoney(yearTotals.variable)} · Toplam ${formatMoney(yearTotals.fixed + yearTotals.variable)}`}
        />
        {yearRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-500">Bu yıl için kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2 font-medium">Ay</th>
                  <th className="px-4 py-2 font-medium text-right">Sabit</th>
                  <th className="px-4 py-2 font-medium text-right">Değişken</th>
                  <th className="px-4 py-2 font-medium text-right">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {yearRows.map((r) => (
                  <tr key={r.period} className="border-b border-sand-100 last:border-0">
                    <td className="px-4 py-2">{monthLabel(r.period)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.fixed)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.variable)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatMoney(r.fixed + r.variable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ExpenseFormModal
          expense={editing}
          vatRates={settings?.vatRates ?? [0, 0.2]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Gider kaydedildi.');
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Gider silinsin mi?"
        danger
        confirmLabel="Sil"
        message={<p>{deleting?.name} kaydı silinecek.</p>}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function ExpenseFormModal({
  expense,
  vatRates,
  onClose,
  onSaved,
}: {
  expense: Expense;
  vatRates: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(expense);
  const [error, setError] = useState('');

  const set = <K extends keyof Expense>(key: K, value: Expense[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    if (!form.name.trim()) {
      setError('Gider adı zorunlu.');
      return;
    }
    if (form.amount < 0) {
      setError('Tutar negatif olamaz.');
      return;
    }
    await saveExpense({
      ...form,
      name: form.name.trim(),
      notes: form.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={expense.name ? 'Gideri düzenle' : 'Yeni gider'}
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
        <Field label="Gider adı" required className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Örn. Kasım kirası"
            invalid={!form.name.trim() && Boolean(error)}
          />
        </Field>
        <Field label="Tür">
          <Select
            value={form.type}
            onChange={(e) => {
              const type = e.target.value as ExpenseType;
              set('type', type);
              set('category', expenseCategories(type)[0]);
            }}
          >
            <option value="fixed">Sabit gider</option>
            <option value="variable">Değişken gider</option>
          </Select>
        </Field>
        <Field label="Kategori">
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {expenseCategories(form.type).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tutar (KDV hariç)" required>
          <NumberField value={form.amount} onChange={(v) => set('amount', v)} suffix="₺" min={0} />
        </Field>
        <Field label="KDV oranı">
          <Select value={form.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))}>
            {vatRates.map((r) => (
              <option key={r} value={r}>
                %{(r * 100).toLocaleString('tr-TR')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dönem" hint="Gider hangi aya ait?">
          <TextInput
            type="month"
            value={form.period}
            onChange={(e) => set('period', e.target.value || form.period)}
          />
        </Field>
        <Field label="Tarih">
          <TextInput type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Açıklama" className="sm:col-span-2">
          <TextArea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-ink-500">
        Komisyon kategorisindeki giderler, ürün komisyon oranıyla çift sayılmaması için gider
        dağıtımında varsayılan olarak hariç tutulur.
      </p>
    </Modal>
  );
}
