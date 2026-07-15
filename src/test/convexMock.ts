import { afterEach, beforeEach } from "vitest";
import { setConvexResponses, clearConvexResponses, calls } from "./setup";

/**
 * Helpers for scripting per-test Convex hook responses. We key on the
 * stringified api path (Convex runtime api tree -> "module:function").
 */
function add(kind: "query" | "mutation" | "action") {
  return (key: string, value: unknown, match?: (a: unknown) => boolean) => {
    setConvexResponses(kind, { type: "value", key, value, match });
  };
}

export const convexMock = {
  query: add("query"),
  mutation: add("mutation"),
  action: add("action"),
  /** Stop using baked-in local storage session id for one test */
  freshSession: () => window.localStorage.removeItem("neon:session"),
  calls,
};

beforeEach(() => clearConvexResponses());
afterEach(() => clearConvexResponses());
