import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | undefined;
  onValueChange: (value: number) => void;
  /** Optional form values may be cleared; required model values retain their last valid number. */
  onClear?: () => void;
};

const display = (value: number | undefined) => value === undefined ? '' : String(value);

/**
 * Keep the editable text separate from geometry/converted units.
 * Empty, partial and out-of-range input never becomes a temporary zero or minimum.
 * Valid numbers still update live previews; blur restores the canonical model value.
 */
export const DraftNumberInput = forwardRef<HTMLInputElement, Props>(function DraftNumberInput(
  { value, onValueChange, onClear, onFocus, onBlur, min, max, disabled, ...props }, ref,
) {
  const [draft, setDraft] = useState(() => display(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current || disabled) setDraft(display(value));
  }, [value, disabled]);

  return <input
    {...props}
    ref={ref}
    type="number"
    min={min}
    max={max}
    disabled={disabled}
    value={draft}
    onFocus={event => { focused.current = true; onFocus?.(event); }}
    onChange={event => {
      const raw = (event.currentTarget ?? event.target).value;
      setDraft(raw);
      if (raw.trim() === '') { onClear?.(); return; }
      const number = Number(raw);
      if (!Number.isFinite(number)) return;
      if (min !== undefined && number < Number(min) || max !== undefined && number > Number(max)) return;
      onValueChange(number);
    }}
    onBlur={event => {
      focused.current = false;
      setDraft(display(value));
      onBlur?.(event);
    }}
  />;
});
