import { createContext } from "react";
import type { Context } from "react";

/**
 * Creates a React context that survives the dev preview's hot reload.
 *
 * Vite re-serves a changed module under a new `?t=<timestamp>` URL. If one
 * importer picks the new copy up while another still holds the old one, the
 * same file exists twice in the page and each copy calls createContext()
 * separately. The provider then fills one context object while a consumer
 * reads the other, gets `undefined` back, and the app reports
 * "useX must be used within a YProvider" — a blank screen.
 *
 * Stashing the first-created context on globalThis makes every copy of a
 * module resolve to the same object. A production bundle evaluates this file
 * once, so the stash simply hands back what was just created.
 */
export const createSharedContext = <T>(key: string): Context<T | undefined> => {
  const store = globalThis as unknown as Record<string, Context<T | undefined> | undefined>;
  const existing = store[key];
  if (existing) return existing;
  const created = createContext<T | undefined>(undefined);
  store[key] = created;
  return created;
};
