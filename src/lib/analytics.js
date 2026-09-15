// src/lib/analytics.js
//
// Thin wrapper around PostHog for funnel analytics (workstream #3: see where
// people drop off between landing → sign-up → limit → checkout → subscribe).
//
// Design rules:
//   • NEVER let analytics break the app — every call is wrapped and no-ops on
//     failure or before init.
//   • NO PII — users are identified by their Supabase UUID only. No name, no
//     email, no phone are ever sent.
//   • Privacy-light for GDPR — cookieless (localStorage persistence), and only
//     identified (logged-in) users get a person profile.
//
// The project key below is PostHog's *public* client key (safe to ship in the
// bundle — it is designed to be visible in the browser). It can be overridden
// per-environment with VITE_POSTHOG_KEY / VITE_POSTHOG_HOST.

import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY ||
  "phc_vnTfpNxZZmCSTj3RKUfYvsusqZYKxpMAznVo6Gfp2seY";
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

let ready = false;

// Distinguish production traffic from our own deploy-preview / local testing so
// Roger can filter the funnel to real users. Based on hostname, not build flags,
// so it's correct in every context.
function appEnv() {
  if (typeof window === "undefined") return "ssr";
  const h = window.location.hostname;
  if (h === "app.routemapper.net") return "production";
  if (h === "localhost" || h === "127.0.0.1") return "dev";
  return "preview"; // deploy-preview-*.netlify.app, branch deploys, etc.
}

export function initAnalytics() {
  if (ready || !KEY) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      autocapture: false, // explicit funnel events only — no arbitrary UI text
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage", // cookieless → keeps GDPR simple
      person_profiles: "identified_only",
      loaded: (ph) => ph.register({ app_env: appEnv() }),
    });
    ready = true;
  } catch (e) {
    console.warn("analytics: init failed", e?.message);
  }
}

/** Fire a funnel event. Safe to call anywhere; no-ops until init succeeds. */
export function track(event, props) {
  if (!ready) return;
  try {
    posthog.capture(event, props);
  } catch (e) {
    console.warn("analytics: track failed", e?.message);
  }
}

/** Link subsequent events to a known user (Supabase UUID only — no PII). */
export function identify(id, props) {
  if (!ready || !id) return;
  try {
    posthog.identify(id, props);
  } catch (e) {
    console.warn("analytics: identify failed", e?.message);
  }
}

/** Clear the identity on sign-out so the next user starts fresh. */
export function resetAnalytics() {
  if (!ready) return;
  try {
    posthog.reset();
  } catch (e) {
    console.warn("analytics: reset failed", e?.message);
  }
}
