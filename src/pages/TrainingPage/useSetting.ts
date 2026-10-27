import { useCallback, useState } from "react";

/**
 * Reads a remembered setting; `fallback` until it is first changed, or when
 * what is stored no longer parses.
 */
function loadSetting<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (parse(raw) ?? fallback);
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: string | boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Not remembering a setting is harmless.
  }
}

/**
 * A setting remembered in localStorage under `key`. `parse` turns the stored
 * string back into a value, or undefined for one it does not recognize.
 */
export function useStoredSetting<T extends string | boolean>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => loadSetting(key, fallback, parse));
  const change = useCallback(
    (next: T) => {
      setValue(next);
      saveSetting(key, next);
    },
    [key],
  );
  return [value, change];
}

function parseBoolean(raw: string): boolean | undefined {
  return raw === "true" ? true : raw === "false" ? false : undefined;
}

/** An on/off setting remembered in localStorage under `key`. */
export function useSetting(
  key: string,
  fallback = true,
): [boolean, (on: boolean) => void] {
  return useStoredSetting(key, fallback, parseBoolean);
}
