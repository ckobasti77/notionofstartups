/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as canvases from "../canvases.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as invites from "../invites.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_page_creation from "../lib/page_creation.js";
import type * as lib_pages from "../lib/pages.js";
import type * as lib_validators from "../lib/validators.js";
import type * as pages from "../pages.js";
import type * as profiles from "../profiles.js";
import type * as search from "../search.js";
import type * as startups from "../startups.js";
import type * as storage from "../storage.js";
import type * as tasks from "../tasks.js";
import type * as thoughts from "../thoughts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  auth: typeof auth;
  canvases: typeof canvases;
  dashboard: typeof dashboard;
  http: typeof http;
  ideas: typeof ideas;
  invites: typeof invites;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/onboarding": typeof lib_onboarding;
  "lib/page_creation": typeof lib_page_creation;
  "lib/pages": typeof lib_pages;
  "lib/validators": typeof lib_validators;
  pages: typeof pages;
  profiles: typeof profiles;
  search: typeof search;
  startups: typeof startups;
  storage: typeof storage;
  tasks: typeof tasks;
  thoughts: typeof thoughts;
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
