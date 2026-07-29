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
import type * as areasV2 from "../areasV2.js";
import type * as areasV2Migrations from "../areasV2Migrations.js";
import type * as auth from "../auth.js";
import type * as canvasPlacement from "../canvasPlacement.js";
import type * as canvases from "../canvases.js";
import type * as collaboration from "../collaboration.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as invites from "../invites.js";
import type * as lib_access_errors from "../lib/access_errors.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collaboration from "../lib/collaboration.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_onboarding from "../lib/onboarding.js";
import type * as lib_page_creation from "../lib/page_creation.js";
import type * as lib_pages from "../lib/pages.js";
import type * as lib_task_checkpoint_canvas_edges from "../lib/task_checkpoint_canvas_edges.js";
import type * as lib_task_checkpoints from "../lib/task_checkpoints.js";
import type * as lib_validators from "../lib/validators.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as pages from "../pages.js";
import type * as profiles from "../profiles.js";
import type * as puls from "../puls.js";
import type * as push from "../push.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as search from "../search.js";
import type * as startups from "../startups.js";
import type * as storage from "../storage.js";
import type * as taskCheckpointCanvasEdges from "../taskCheckpointCanvasEdges.js";
import type * as taskCheckpoints from "../taskCheckpoints.js";
import type * as tasks from "../tasks.js";
import type * as thoughts from "../thoughts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  areasV2: typeof areasV2;
  areasV2Migrations: typeof areasV2Migrations;
  auth: typeof auth;
  canvasPlacement: typeof canvasPlacement;
  canvases: typeof canvases;
  collaboration: typeof collaboration;
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  ideas: typeof ideas;
  invites: typeof invites;
  "lib/access_errors": typeof lib_access_errors;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/collaboration": typeof lib_collaboration;
  "lib/notifications": typeof lib_notifications;
  "lib/onboarding": typeof lib_onboarding;
  "lib/page_creation": typeof lib_page_creation;
  "lib/pages": typeof lib_pages;
  "lib/task_checkpoint_canvas_edges": typeof lib_task_checkpoint_canvas_edges;
  "lib/task_checkpoints": typeof lib_task_checkpoints;
  "lib/validators": typeof lib_validators;
  migrations: typeof migrations;
  notifications: typeof notifications;
  pages: typeof pages;
  profiles: typeof profiles;
  puls: typeof puls;
  push: typeof push;
  pushSubscriptions: typeof pushSubscriptions;
  search: typeof search;
  startups: typeof startups;
  storage: typeof storage;
  taskCheckpointCanvasEdges: typeof taskCheckpointCanvasEdges;
  taskCheckpoints: typeof taskCheckpoints;
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

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
