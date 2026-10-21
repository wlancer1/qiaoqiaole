import { forwardRef, useEffect, useRef, useState, type CompositionEvent, type InputHTMLAttributes } from 'react';
import { isImeComposing, setImeComposition } from './ime';

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
  { value, onValueChange, onCompositionStart, onCompositionEnd, onBlur, onKeyDown, ...props },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  const publishedRef = useRef(value);
  const publish = (nextValue: string) => {
    if (publishedRef.current === nextValue) return;
    publishedRef.current = nextValue;
    onValueChange(nextValue);
  };

  useEffect(() => {
    if (!composingRef.current) {
      publishedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const startComposition = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = true;
    setImeComposition(event.currentTarget, true);
    onCompositionStart?.(event);
  };
  const endComposition = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    setImeComposition(event.currentTarget, false);
    const committedValue = event.currentTarget.value;
    setDraft(committedValue);
    publish(committedValue);
    onCompositionEnd?.(event);
  };

  return <input
    {...props}
    ref={ref}
    value={draft}
    onCompositionStart={startComposition}
    onCompositionEnd={endComposition}
    onKeyDown={(event) => {
      if (composingRef.current || isImeComposing(event.nativeEvent)) {
        event.stopPropagation();
        return;
      }
      onKeyDown?.(event);
    }}
    onBlur={(event) => {
      if (composingRef.current) {
        composingRef.current = false;
        setImeComposition(event.currentTarget, false);
        setDraft(event.currentTarget.value);
        publish(event.currentTarget.value);
      }
      onBlur?.(event);
    }}
    onChange={(event) => {
      const nextValue = (event.currentTarget ?? event.target).value;
      setDraft(nextValue);
      if (!composingRef.current && !isImeComposing(event.nativeEvent)) publish(nextValue);
    }}
  />;
});
