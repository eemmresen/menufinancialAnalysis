import { useMemo } from 'react';
import { addMonths, currentPeriod, monthLabel } from '@/lib/dates';
import { Select } from './Field';

export function PeriodSelect({
  value,
  onChange,
  extraPeriods = [],
  label,
  className = '',
}: {
  value: string;
  onChange: (period: string) => void;
  extraPeriods?: string[];
  label?: string;
  className?: string;
}) {
  const options = useMemo(() => {
    const set = new Set<string>([currentPeriod(), value, ...extraPeriods]);
    for (let i = 0; i < 18; i++) set.add(addMonths(currentPeriod(), -i));
    return [...set].filter(Boolean).sort().reverse();
  }, [value, extraPeriods]);

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-40">
        {options.map((period) => (
          <option key={period} value={period}>
            {monthLabel(period)}
          </option>
        ))}
      </Select>
    </div>
  );
}
