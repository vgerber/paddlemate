import { useEffect, useState } from "react";

/** Returns a debounced version of the value that only updates after `delay` ms of inactivity.
 * Hand-rolled: a library would dwarf these few lines. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
