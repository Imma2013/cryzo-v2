/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as autonomous from "../autonomous.js";
import type * as autonomousActions from "../autonomousActions.js";
import type * as autonomousRuntime from "../autonomousRuntime.js";
import type * as autonomySchema from "../autonomySchema.js";
import type * as billing from "../billing.js";
import type * as chats from "../chats.js";
import type * as crons from "../crons.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  autonomous: typeof autonomous;
  autonomousActions: typeof autonomousActions;
  autonomousRuntime: typeof autonomousRuntime;
  autonomySchema: typeof autonomySchema;
  billing: typeof billing;
  chats: typeof chats;
  crons: typeof crons;
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
