import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { getFunctionName } from "convex/server";

// ---------------------------------------------------------------------------
// jsdom missing globals: framer-motion's `whileInView` uses
// IntersectionObserver; shadcn dialogs use ResizeObserver. Provide no-op
// stubs so component renders don't crash.
// ---------------------------------------------------------------------------

if (typeof globalThis !== "undefined" && !("IntersectionObserver" in globalThis)) {
  // @ts-ignore - lightweight stub (only installed if missing)
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
  // @ts-ignore - lightweight stub (only installed if missing)
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== "undefined" && !window.matchMedia) {
  // @ts-ignore - lightweight stub for shadcn/Radix check
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

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  // @ts-ignore - lightweight stub
  Element.prototype.scrollIntoView = function () {};
}

// ---------------------------------------------------------------------------
// Mock state lives on globalThis so it's reachable from any module — including
// inside `vi.mock(...)` factories, which Vitest transforms independently of
// the rest of this file's module scope.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  const g = globalThis as any;
  if (!g.__convexMockState) {
    g.__convexMockState = {
      registry: { query: [], mutation: [], action: [] },
      calls: { mutation: [], action: [] },
    };
  }
});

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

export function setConvexResponses(
  kind: "query" | "mutation" | "action",
  ...entries: Entry[]
) {
  (globalThis as any).__convexMockState.registry[kind].push(...entries);
}

export function clearConvexResponses() {
  const s = (globalThis as any).__convexMockState;
  s.registry.query.length = 0;
  s.registry.mutation.length = 0;
  s.registry.action.length = 0;
  s.calls.mutation.length = 0;
  s.calls.action.length = 0;
}

// Expose getFunctionName via globalThis so the vi.mock factory below (which
// is hoisted and runs in a transformed scope) can reach it without needing to
// dynamically require convex/server inside a non-CommonJS context.
(globalThis as any).__getFunctionName = getFunctionName;

// Mock the generated `api` tree with a recursive Proxy whose leaves stringify
// to the dotted "module:function" path. This means `api.projects.get` becomes
// a Proxy whose `String(q)` returns `"projects.get"`, which our pathKey logic
// can pick up directly via its fallback `String(q).replace(/[:/]/g, ".")`.
vi.mock("../../convex/_generated/api", () => {
  const createProxy = (path: string): any => {
    const fn = () => {};
    fn.toString = () => path;
    return new Proxy(fn, {
      get(_t, prop) {
        if (
          typeof prop === "string" &&
          prop !== "then" &&
          prop !== "toString"
        ) {
          return createProxy(path ? `${path}.${prop}` : prop);
        }
        return Reflect.get(fn, prop);
      },
    });
  };
  return { api: createProxy(""), internal: createProxy("") };
});

vi.mock("convex/react", () => {
  // Inlined so the mock factory has guaranteed access to these helpers even
  // after vitest's module transformation.
  function pathKey(q: any): string {
    if (typeof q === "string") return q.replace(/[:/]/g, ".");
    // Convex exposes the api tree via anyApi (a Proxy). Use the official
    // helper to extract the real "module:function" string, falling back to
    // direct property probes if it isn't available in this runtime.
    try {
      const gfn = (globalThis as any).__getFunctionName;
      if (gfn) {
        const name = gfn(q);
        if (typeof name === "string") return name.replace(/[:/]/g, ".");
      }
    } catch {
      /* fall through to manual probes */
    }
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
    const s = (globalThis as any).__convexMockState;
    if (!s) return null;
    const norm = (str: string) => str.replace(/[:/]/g, ".");
    const k = norm(String(key));
    for (const e of s.registry[kind]) {
      const eKey = norm(e.key);
      if (k !== eKey && !k.includes(eKey) && !eKey.includes(k)) continue;
      if (e.match && !e.match(args)) continue;
      return e;
    }
    return null;
  }

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
      const s = (globalThis as any).__convexMockState;
      if (s) s.calls.mutation.push({ apiKey: key, args: args[0] });
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
      const s = (globalThis as any).__convexMockState;
      if (s) s.calls.action.push({ apiKey: key, args: args[0] });
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
