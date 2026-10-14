import { useState } from "react";

/**
 * Local editable copy of a value that resets whenever the source value
 * changes (React's "adjust state when a prop changes" pattern).
 */
export function useDraft<T>(value: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
