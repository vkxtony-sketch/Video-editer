/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _narrativeHelpers from "../_narrativeHelpers.js";
import type * as analyze from "../analyze.js";
import type * as clientErrors from "../clientErrors.js";
import type * as llm from "../llm.js";
import type * as pipeline from "../pipeline.js";
import type * as pipelineHelpers from "../pipelineHelpers.js";
import type * as projects from "../projects.js";
import type * as queries from "../queries.js";
import type * as urlProxy from "../urlProxy.js";
import type * as youtube from "../youtube.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _narrativeHelpers: typeof _narrativeHelpers;
  analyze: typeof analyze;
  clientErrors: typeof clientErrors;
  llm: typeof llm;
  pipeline: typeof pipeline;
  pipelineHelpers: typeof pipelineHelpers;
  projects: typeof projects;
  queries: typeof queries;
  urlProxy: typeof urlProxy;
  youtube: typeof youtube;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
