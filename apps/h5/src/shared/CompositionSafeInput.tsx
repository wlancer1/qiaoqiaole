import { forwardRef, useEffect, useRef, useState, type CompositionEvent, type InputHTMLAttributes } from 'react';

export type CompositionSafeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * A controlled text input that does not publish incomplete IME composition text.
 * Keeping the draft in the DOM-facing component prevents an application rerender
 * from cancelling a Chinese/Japanese/Korean candidate session.
 */
export const CompositionSafeInput = forwardRef<HTMLInputElement, CompositionSafeInputProps>(function CompositionSafeInput(
  { value, onValueChange, onCompositionStart, onCompositionEnd, ...props },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  const startComposition = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = true;
    onCompositionStart?.(event);
  };
  const endComposition = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const committedValue = event.currentTarget.value;
    setDraft(committedValue);
    onValueChange(committedValue);
    onCompositionEnd?.(event);
  };

  return <input
    {...props}
    ref={ref}
    value={draft}
    onCompositionStart={startComposition}
    onCompositionEnd={endComposition}
    onChange={(event) => {
      const nextValue = (event.currentTarget ?? event.target).value;
      setDraft(nextValue);
      if (!composingRef.current) onValueChange(nextValue);
    }}
  />;
});
