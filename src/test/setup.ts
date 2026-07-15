import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// jsdom missing globals: framer-motion's `whileInView` uses
// IntersectionObserver; shadcn dialogs use ResizeObserver. Provide no-op
// stubs so component renders don't crash.
// ---------------------------------------------------------------------------

if (typeof globalThis !== "undefined" && !("IntersectionObserver" in globalThis)) {
  // @ts-expect-error - lightweight stub
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  };
}

if (typeof globalThis !== "undefined" && !("ResizeObserver" in globalThis)) {
  // @ts-expect-error - lightweight stub
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// matchMedia is referenced by some shadcn primitives; stub it for jsdom.
if (typeof window !== "undefined" && !window.matchMedia) {
  // @ts-expect-error - lightweight stub for shadcn/Radix check
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// scrollIntoView is missing in jsdom and used by some Radix components.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  // @ts-expect-error - lightweight stub
  Element.prototype.scrollIntoView = function () {};
}

// ---------------------------------------------------------------------------
// Convex mocks: the runtime `api` tree exposes leaves as FunctionReference
// objects with a `.name` of the form `module:function`. We hoist `registry` and
// `calls` so vi.mock factories (which Vitest itself hoists) can reference them
// before module-level code runs.
// ---------------------------------------------------------------------------

type Entry =
  | {
      type: "value";
      key: string;
      match?: (args: unknown) => boolean;
      value: unknown;
    }
  | {
      type: "rejects";
      key: string;
      match?: (args: unknown) => boolean;
      error: Error;
    };

// `vi.hoisted` runs first. Variables defined inside are accessible to vi.mock
// factories at the top of this file.
const hoistedState = vi.hoisted(() => ({
  registry: {
    query: [] as any[],
    mutation: [] as any[],
    action: [] as any[],
  },
  calls: {
    mutation: [] as Array<{ apiKey: string; args: unknown }>,
    action: [] as Array<{ apiKey: string; args: unknown }>,
  },
}));

const registry = hoistedState.registry;
const calls = hoistedState.calls;
export { registry, calls };

export function setConvexResponses(
  kind: "query" | "mutation" | "action",
  ...entries: Entry[]
) {
  registry[kind].push(...entries);
}

export function clearConvexResponses() {
  registry.query.length = 0;
  registry.mutation.length = 0;
  registry.action.length = 0;
  calls.mutation.length = 0;
  calls.action.length = 0;
}

function pathKey(q: any): string {
  if (typeof q === "string") return q.replace(/[:/]/g, ".");
  // Convex exposes raw api paths as FunctionReference-like objects whose
  // `.name` is the canonical "module:function" string. We normalise separators
  // so tests can register either style.
  if (q && typeof q === "object" && typeof q.name === "string") {
    return q.name.replace(/[:/]/g, ".");
  }
  try {
    return String(q).replace(/[:/]/g, ".");
  } catch {
    return "<unknown>";
  }
}

function lookup(
  kind: "query" | "mutation" | "action",
  key: string,
  args: unknown,
) {
  const norm = (s: string) => s.replace(/[:/]/g, ".");
  const k = norm(String(key));
  for (const e of registry[kind]) {
    const eKey = norm(e.key);
    if (k !== eKey && !k.includes(eKey) && !eKey.includes(k)) continue;
    if (e.match && !e.match(args)) continue;
    return e;
  }
  return null;
}

vi.mock("convex/react", () => {
  const useQuery = (q: unknown, args: unknown) => {
    const key = pathKey(q);
    const entry = lookup("query", key, args);
    if (!entry) return undefined;
    if (entry.type === "value") return entry.value;
    throw entry.error;
  };

  const useMutation = (m: unknown) => {
    return (...args: unknown[]) => {
      const key = pathKey(m);
      calls.mutation.push({ apiKey: key, args: args[0] });
      const entry = lookup("mutation", key, args[0]);
      if (entry?.type === "value") return Promise.resolve(entry.value);
      if ((entry as any)?.type === "rejects")
        return Promise.reject((entry as any).error);
      return Promise.resolve(undefined);
    };
  };

  const useAction = (a: unknown) => {
    return (...args: unknown[]) => {
      const key = pathKey(a);
      calls.action.push({ apiKey: key, args: args[0] });
      const entry = lookup("action", key, args[0]);
      if (entry?.type === "value") return Promise.resolve(entry.value);
      if ((entry as any)?.type === "rejects")
        return Promise.reject((entry as any).error);
      return Promise.resolve(undefined);
    };
  };

  const useConvex = () => ({
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
  });

  const ConvexProvider = ({ children }: { children: React.ReactNode }) =>
    children as any;

  return {
    useQuery,
    useMutation,
    useAction,
    useConvex,
    ConvexProvider,
    ConvexReactClient: class {},
  };
});

// Seed a stable session id so useSession() resolves immediately.
if (typeof window !== "undefined" && !window.localStorage.getItem("neon:session")) {
  window.localStorage.setItem("neon:session", "u_test");
}
