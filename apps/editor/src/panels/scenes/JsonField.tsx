interface JsonFieldProps {
  label: string;
  value: string;
  tooltip?: string;
  labelClassName?: string;
  onCommit: (nextValue: string) => void;
}

export function JsonField({ label, value, tooltip, labelClassName, onCommit }: JsonFieldProps) {
  return (
    <label title={tooltip}>
      {labelClassName ? <span className={labelClassName}>{label}</span> : label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} title={tooltip} />
    </label>
  );
}

export function parseJsonWithFallback<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
