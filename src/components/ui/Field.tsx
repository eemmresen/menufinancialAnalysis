import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { parseDecimal } from '@/lib/format';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function Field({ label, hint, error, required, children, className = '', htmlFor }: FieldShellProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-sand-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 disabled:bg-sand-100 disabled:text-ink-500';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { className = '', invalid, ...rest } = props;
  return <input {...rest} className={`${inputClass} ${invalid ? 'border-red-400' : ''} ${className}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`${inputClass} min-h-20 resize-y ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select {...rest} className={`${inputClass} cursor-pointer pr-8 ${className}`}>
      {children}
    </select>
  );
}

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function displayValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  return String(value).replace('.', ',');
}

/** Ondalık ayırıcı olarak virgülü kabul eden sayı alanı. */
export function NumberField({
  value,
  onChange,
  suffix,
  placeholder,
  min,
  max,
  invalid,
  disabled,
  className = '',
  id,
}: NumberFieldProps) {
  const [text, setText] = useState(() => displayValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(displayValue(value));
  }, [value, focused]);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        inputMode="decimal"
        className={`${inputClass} ${suffix ? 'pr-9' : ''} ${invalid ? 'border-red-400' : ''}`}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          if (!/^[0-9.,\s]*$/.test(raw)) return;
          setText(raw);
          onChange(parseDecimal(raw));
        }}
        onBlur={() => {
          setFocused(false);
          let next = parseDecimal(text);
          if (typeof min === 'number') next = Math.max(min, next);
          if (typeof max === 'number') next = Math.min(max, next);
          onChange(next);
          setText(displayValue(next));
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

interface PercentFieldProps {
  /** Oran olarak değer: 0.2 = %20 */
  value: number;
  onChange: (value: number) => void;
  className?: string;
  invalid?: boolean;
  placeholder?: string;
}

export function PercentField({ value, onChange, className, invalid, placeholder }: PercentFieldProps) {
  return (
    <NumberField
      value={Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v / 100)}
      suffix="%"
      className={className}
      invalid={invalid}
      placeholder={placeholder ?? '0'}
      min={0}
      max={100}
    />
  );
}

interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

export function CheckboxField({ checked, onChange, label, hint }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-sand-300 text-brand-700 accent-brand-700"
      />
      <div>
        <label htmlFor={id} className="text-sm text-ink-900">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}
