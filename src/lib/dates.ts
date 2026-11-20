const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthOf(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function currentPeriod(): string {
  return monthOf();
}

export function previousPeriod(period: string = currentPeriod()): string {
  return addMonths(period, -1);
}

export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return monthOf(date);
}

export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${TR_MONTHS[m - 1]} ${y}`;
}

export function shortMonthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${TR_MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function recentPeriods(count: number, from: string = currentPeriod()): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) list.push(addMonths(from, -i));
  return list.reverse();
}

export function daysInPeriod(period: string): number {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
