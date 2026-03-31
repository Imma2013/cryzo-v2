"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch {
      setStoredValue(initialValue);
    } finally {
      setIsHydrated(true);
    }
  }, [initialValue, key]);

  const setValue = useCallback(
    (value: T | ((value: T) => T)) => {
      setStoredValue((currentValue) => {
        const valueToStore =
          value instanceof Function ? value(currentValue) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        return valueToStore;
      });
    },
    [key],
  );

  return [storedValue, setValue, isHydrated] as const;
}
