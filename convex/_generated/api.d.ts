/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as digest_actions from "../digest/actions.js";
import type * as digest_classification from "../digest/classification.js";
import type * as digest_diagnostics from "../digest/diagnostics.js";
import type * as digest_email from "../digest/email.js";
import type * as digest_replyActions from "../digest/replyActions.js";
import type * as digest_replyWorkflow from "../digest/replyWorkflow.js";
import type * as digest_workflow from "../digest/workflow.js";
import type * as digests from "../digests.js";
import type * as emailReplies from "../emailReplies.js";
import type * as http from "../http.js";
import type * as login from "../login.js";
import type * as login_node from "../login/node.js";
import type * as preferences from "../preferences.js";
import type * as scraping_data from "../scraping/data.js";
import type * as scraping_instagram from "../scraping/instagram.js";
import type * as scraping_linkedin from "../scraping/linkedin.js";
import type * as scraping_network from "../scraping/network.js";
import type * as scraping_shared from "../scraping/shared.js";
import type * as scraping_types from "../scraping/types.js";
import type * as scraping_x from "../scraping/x.js";
import type * as users from "../users.js";
import type * as utilities_auth from "../utilities/auth.js";
import type * as utilities_sites from "../utilities/sites.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  "digest/actions": typeof digest_actions;
  "digest/classification": typeof digest_classification;
  "digest/diagnostics": typeof digest_diagnostics;
  "digest/email": typeof digest_email;
  "digest/replyActions": typeof digest_replyActions;
  "digest/replyWorkflow": typeof digest_replyWorkflow;
  "digest/workflow": typeof digest_workflow;
  digests: typeof digests;
  emailReplies: typeof emailReplies;
  http: typeof http;
  login: typeof login;
  "login/node": typeof login_node;
  preferences: typeof preferences;
  "scraping/data": typeof scraping_data;
  "scraping/instagram": typeof scraping_instagram;
  "scraping/linkedin": typeof scraping_linkedin;
  "scraping/network": typeof scraping_network;
  "scraping/shared": typeof scraping_shared;
  "scraping/types": typeof scraping_types;
  "scraping/x": typeof scraping_x;
  users: typeof users;
  "utilities/auth": typeof utilities_auth;
  "utilities/sites": typeof utilities_sites;
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
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  authPasswordProvider: import("@convex-dev/auth/providers/password/_generated/component.js").ComponentApi<"authPasswordProvider">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
  oauthGithub: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGithub">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
