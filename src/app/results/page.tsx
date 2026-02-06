"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const SELECTED_RESULT_KEY = "s2e_selected_result_v1";
const PROVIDER_SEARCH_CONTEXT_KEY = "s2e_provider_search_context_v1";

type PreviewRec = {
  skill_code: string;
  skill_name: string;
  score: number;
  teaser: string[];
};

type SelectedRec = {
  skill_code: string;
  skill_name: string;
  score: number;
  reasons: string[];
  badges: string[];
  warnings: string[];
};

type ProviderSearchContext = {
  version: "v1";
  session_id: string;
  skill_code: string;
  country: "Nigeria";
  state: string;
  city: string;
  area: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  created_at_iso: string;
};

type StoredSelected = {
  session_id: string;
  selected: SelectedRec;
  commence: "NOW" | "WITHIN_3_MONTHS";
  wants_training_centre: boolean;
  location: { lat?: number | null; lng?: number | null; text?: string } | null;
  provider_search_context?: ProviderSearchContext | null;
  contact: { full_name: string; email: string; phone: string };
  preview: PreviewRec[];
};

type ProviderFinderV1Response = {
  ok: boolean;
  supply_exists: boolean;
  message: "SUPPLY_EXISTS" | "NO_SUPPLY";
  discovery_request_id: string | null;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function scoreToPct(score: number) {
  if (!Number.isFinite(score)) return 0;
  return score > 1 ? Math.round(score) : Math.round(score * 100);
}

function pick<T>(arr: T[] | undefined, n: number) {
  return (arr ?? []).slice(0, n);
}

function loadSelectedFromStorage(): StoredSelected | null {
  if (typeof window === "undefined") return null;
  const parsed = safeParse<StoredSelected>(localStorage.getItem(SELECTED_RESULT_KEY));
  if (!parsed?.session_id || !parsed?.selected?.skill_code || !parsed?.contact?.email) return null;
  return parsed;
}

function loadProviderCtxFromStorage(): ProviderSearchContext | null {
  if (typeof window === "undefined") return null;
  const parsed = safeParse<ProviderSearchContext>(localStorage.getItem(PROVIDER_SEARCH_CONTEXT_KEY));
  if (!parsed?.session_id || !parsed?.skill_code || !parsed?.city || !parsed?.area) return null;
  return parsed;
}

function makeFlagKey(data: StoredSelected) {
  return `s2e_sent_${data.session_id}_${data.selected.skill_code}_${data.contact.email}`;
}

/**
 * SEND STATUS external store (your existing pattern)
 */
const sendListeners = new Set<() => void>();

function subscribeSend(cb: () => void) {
  sendListeners.add(cb);

  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("s2e_sent_")) cb();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    sendListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function notifySend() {
  for (const l of sendListeners) l();
}

function getSendStatus(flagKey: string | null): "idle" | "sending" | "sent" | "failed" {
  if (!flagKey || typeof window === "undefined") return "idle";
  const v = localStorage.getItem(flagKey);
  if (v === "1") return "sent";
  if (v === "sending") return "sending";
  if (v === "failed") return "failed";
  return "idle";
}

/**
 * PROVIDER FINDER v1 external store
 */
type ProviderStoreState = {
  loading: boolean;
  error: string | null;
  response: ProviderFinderV1Response | null;
};

const providerListeners = new Set<() => void>();
let providerState: ProviderStoreState = { loading: false, error: null, response: null };

function providerSet(next: ProviderStoreState) {
  providerState = next;
  for (const l of providerListeners) l();
}

function subscribeProviders(cb: () => void) {
  providerListeners.add(cb);
  return () => providerListeners.delete(cb);
}

function getProviderStateSnapshot(): ProviderStoreState {
  return providerState;
}

export default function ResultsPage() {
  const router = useRouter();

  const data = useMemo(() => loadSelectedFromStorage(), []);
  const storedProviderCtx = useMemo(() => loadProviderCtxFromStorage(), []);

  const providerCtx = useMemo(() => {
    if (!data) return storedProviderCtx;
    return data.provider_search_context ?? storedProviderCtx;
  }, [data, storedProviderCtx]);

  const flagKey = useMemo(() => (data ? makeFlagKey(data) : null), [data]);
  const sendState = useSyncExternalStore(subscribeSend, () => getSendStatus(flagKey), () => "idle");

  const provStore = useSyncExternalStore(subscribeProviders, getProviderStateSnapshot, getProviderStateSnapshot);
  const provLoading = provStore.loading;
  const provErr = provStore.error;
  const provResp = provStore.response;

  const pct = useMemo(() => (data ? scoreToPct(data.selected.score) : 0), [data]);

  const toneIntro = useMemo(() => {
    if (!data) return "";
    const name = data.contact.full_name?.split(" ")[0] || data.contact.full_name || "friend";
    if (pct >= 90) return `Hey ${name} 😄 — this one is a *very* strong match.`;
    if (pct >= 75) return `Hey ${name} — this is a solid match. We can work with this! 😄`;
    return `Hey ${name} — this can work, and we’ll make it work step-by-step 😄`;
  }, [data, pct]);

  const jokeLine = useMemo(() => {
    if (!data) return "";
    if (pct >= 90) return "If this score was a person, it would already be sending you a ‘let’s start’ text 😄";
    if (pct >= 75) return "Not perfect — but perfection is expensive anyway. We move 😄";
    return "The good news: you don’t need superpowers. You need consistency. (Way harder, I know 😄)";
  }, [data, pct]);

  const commenceLine = useMemo(() => {
    if (!data) return "";
    return data.commence === "NOW"
      ? "You said you’re ready to start **now** — that’s the best advantage you can give yourself."
      : "You said **within 3 months** — great. We’ll keep it simple and realistic, no pressure vibes.";
  }, [data]);

  const actionCTA = useMemo(() => {
    if (!data) return "";
    return data.commence === "NOW"
      ? "Next move: choose a small learning plan for **this week** and start today. Yes, today 😄"
      : "Next move: pick a start date inside the next 2 weeks. Future-you will thank you 😄";
  }, [data]);

  const sendMsg = useMemo(() => {
    if (sendState === "sending") return "Sending your result to your email…";
    if (sendState === "sent") return "✅ We’ve sent your result to your email. Check inbox (and spam/junk just in case).";
    if (sendState === "failed") return "Email sending failed. Refresh this page to retry.";
    return null;
  }, [sendState]);

  const locationSummary = providerCtx
    ? `${providerCtx.area}, ${providerCtx.city}${providerCtx.state ? ", " + providerCtx.state : ""}`
    : null;

  // 1) Auto-send email once (unchanged)
  useEffect(() => {
    if (!data || !flagKey) return;

    const current = localStorage.getItem(flagKey);
    if (current === "1") return;
    if (current === "sending") return;

    localStorage.setItem(flagKey, "sending");
    notifySend();

    const state = providerCtx?.state ?? "";
    const city = providerCtx?.city ?? "";
    const area = providerCtx?.area ?? "";

    const payload = {
      session_id: data.session_id,
      state,
      city,
      area,

      full_name: data.contact.full_name,
      email: data.contact.email,
      phone: data.contact.phone,

      commence: data.commence,
      wants_training_centre: data.wants_training_centre,
      location: data.wants_training_centre ? data.location : null,

      preview_recommendations: data.preview,
      selected_recommendation: data.selected,

      answers: {
        commence: data.commence,
        wants_training_centre: data.wants_training_centre,
        location: data.location,
        state,
        city,
        area,
      },
    };

    fetch("/api/send-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
          const msg =
            (obj && (typeof obj.message === "string" ? obj.message : null)) ||
            (obj && (typeof obj.error === "string" ? obj.error : null)) ||
            "Failed to send email";
          throw new Error(msg);
        }
        localStorage.setItem(flagKey, "1");
        notifySend();
      })
      .catch(() => {
        localStorage.setItem(flagKey, "failed");
        notifySend();
      });
  }, [data, flagKey, providerCtx]);

  // 2) Provider Finder v1: supply check + discovery request behind the scenes
  useEffect(() => {
    if (!data?.wants_training_centre) return;
    if (!providerCtx) return;

    providerSet({ loading: true, error: null, response: null });

    const params = new URLSearchParams();
    params.set("skill_code", providerCtx.skill_code);
    params.set("radius_km", "5");
    params.set("state", providerCtx.state || "");
    params.set("city", providerCtx.city || "");
    params.set("area", providerCtx.area || "");
    if (typeof providerCtx.lat === "number") params.set("lat", String(providerCtx.lat));
    if (typeof providerCtx.lng === "number") params.set("lng", String(providerCtx.lng));

    fetch(`/api/providers/search?${params.toString()}`, { method: "GET" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
          const msg =
            (obj && (typeof obj.message === "string" ? obj.message : null)) ||
            (obj && (typeof obj.error === "string" ? obj.error : null)) ||
            "Failed to load provider status";
          throw new Error(msg);
        }
        if (!json || typeof json !== "object") throw new Error("Invalid provider status response.");
        providerSet({ loading: false, error: null, response: json as ProviderFinderV1Response });
      })
      .catch((e: unknown) => {
        providerSet({
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load provider status",
          response: null,
        });
      });
  }, [data?.wants_training_centre, providerCtx]);

  if (!data) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning">
          No selected result found. Please go back and select a skill on the preview page.
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={() => router.push("/preview")}>
            Back to Preview
          </button>
          <button className="btn btn-outline-primary" onClick={() => router.push("/assessment")}>
            Retake Assessment
          </button>
        </div>
      </div>
    );
  }

  const selected = data.selected;
  const reasons = pick(selected.reasons, 4);
  const badges = pick(selected.badges, 6);
  const warnings = pick(selected.warnings, 2);

  // Provider Finder v1 user-facing message
const providerFinderMessage: string | null = (() => {
  if (!data.wants_training_centre) return null;

  if (!providerCtx) {
    return "Your location/skill context is missing. Please go back to Preview and re-select your skill.";
  }

  if (provLoading) {
    return "Checking for training options around your area…";
  }

  if (provErr) {
    return `Could not check training options. ${provErr}`;
  }

  if (!provResp) return null;

  if (provResp.supply_exists) {
    return "✅ We have training options for this skill around your area. Please request a call and we’ll connect you.";
  }

  return "We don’t have a verified provider in your area yet — but we’re onboarding now. Request a call and we’ll update you.";
})();

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3">
          <div className="fw-bold text-primary">Your Selected Skill Result</div>
          <div className="text-muted small">This page shows only your chosen skill (no distractions).</div>
        </div>
      </div>

      <div className="container py-4">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
              <div>
                <div className="text-muted small">Selected Skill</div>
                <h1 className="h4 mb-0">{selected.skill_name}</h1>
              </div>
              <span className="badge bg-success-subtle text-success">Match: {pct}%</span>
            </div>

            <div className="mt-3">
              <div className="fw-semibold">{toneIntro}</div>
              <div className="text-muted mt-1">{jokeLine}</div>
            </div>

            <div className="mt-3 p-3 rounded bg-white border">
              <div className="fw-semibold">Quick plan check</div>
              <div className="mt-1">{commenceLine}</div>
              <div className="mt-2">{actionCTA}</div>
              {data.wants_training_centre && (
                <div className="text-muted small mt-2">
                  You asked us to connect you to the nearest training centre.
                  {locationSummary ? (
                    <>
                      {" "}
                      We’ll use <strong>{locationSummary}</strong>.
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* Provider Finder v1 block: message + single CTA */}
            {data.wants_training_centre && (
              <div className="mt-4">
                <div className="card border-0 shadow-sm">
                  <div className="card-body p-4">
                    <div className="fw-semibold">Training Centre Connection</div>
                    <div className="text-muted small">
                      Skill: <strong>{selected.skill_name}</strong>
                      {locationSummary ? (
                        <>
                          {" "}
                          • Location: <strong>{locationSummary}</strong>
                        </>
                      ) : null}
                    </div>

                    {!providerCtx && (
                      <div className="alert alert-warning mt-3 mb-0">
                        Your location/skill context is missing. Please go back to Preview and re-select your skill.
                      </div>
                    )}

                    {providerCtx && (
                      <div className="mt-3">
                        {provErr ? (
                          <div className="alert alert-danger mb-0">{providerFinderMessage}</div>
                        ) : provLoading ? (
                          <div className="text-muted">{providerFinderMessage}</div>
                        ) : (
                          <div className="alert alert-info mb-0">{providerFinderMessage}</div>
                        )}
                      </div>
                    )}

                    <div className="mt-3">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!providerCtx}
                        onClick={() => {
                          // NEXT STEP: open lead capture modal or route to lead form page
                          // For now, keep it simple:
                          router.push("/lead"); // create this page next OR replace with modal later
                        }}
                      >
                        Request a Call / Help me Register
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline-primary ms-2"
                        disabled={!providerCtx || provLoading}
                        onClick={() => {
                          if (!providerCtx) return;

                          providerSet({ loading: true, error: null, response: null });

                          const params = new URLSearchParams();
                          params.set("skill_code", providerCtx.skill_code);
                          params.set("radius_km", "5");
                          params.set("state", providerCtx.state || "");
                          params.set("city", providerCtx.city || "");
                          params.set("area", providerCtx.area || "");
                          if (typeof providerCtx.lat === "number") params.set("lat", String(providerCtx.lat));
                          if (typeof providerCtx.lng === "number") params.set("lng", String(providerCtx.lng));

                          fetch(`/api/providers/search?${params.toString()}`, { method: "GET" })
                            .then(async (res) => {
                              const json = (await res.json().catch(() => null)) as unknown;
                              if (!res.ok) {
                                const obj =
                                  typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
                                const msg =
                                  (obj && (typeof obj.message === "string" ? obj.message : null)) ||
                                  (obj && (typeof obj.error === "string" ? obj.error : null)) ||
                                  "Failed to load provider status";
                                throw new Error(msg);
                              }
                              if (!json || typeof json !== "object") throw new Error("Invalid provider status response.");
                              providerSet({ loading: false, error: null, response: json as ProviderFinderV1Response });
                            })
                            .catch((e: unknown) => {
                              providerSet({
                                loading: false,
                                error: e instanceof Error ? e.message : "Failed to load provider status",
                                response: null,
                              });
                            });
                        }}
                      >
                        {provLoading ? "Checking…" : "Re-check"}
                      </button>
                    </div>

                    {provResp?.discovery_request_id ? (
                      <div className="text-muted small mt-2">
                        Ref: <code>{provResp.discovery_request_id}</code>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {badges.length > 0 && (
              <div className="mt-3 d-flex flex-wrap gap-2">
                {badges.map((b, i) => (
                  <span key={`${selected.skill_code}-badge-${i}`} className="badge bg-primary-subtle text-primary">
                    {b}
                  </span>
                ))}
              </div>
            )}

            {reasons.length > 0 && (
              <div className="mt-4">
                <div className="fw-semibold">Why we recommended this</div>
                <ul className="mb-0 mt-2">
                  {reasons.map((r, i) => (
                    <li key={`${selected.skill_code}-reason-${i}`}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4">
                <div className="fw-semibold text-danger">Small things to watch out for</div>
                <ul className="mb-0 mt-2">
                  {warnings.map((w, i) => (
                    <li key={`${selected.skill_code}-warn-${i}`}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 p-3 rounded bg-white border">
              <div className="fw-semibold">Do this next (simple)</div>
              <ol className="mb-0 mt-2">
                <li>Pick 1 beginner resource and start today (30–45 mins).</li>
                <li>Build a tiny practice project this week.</li>
                <li>Ask someone to check your progress after 7 days 😄</li>
              </ol>
            </div>

            <hr className="my-4" />

            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div>
                {sendState === "sending" && <div className="text-muted">{sendMsg}</div>}
                {sendState === "sent" && <div className="text-success">{sendMsg}</div>}
                {sendState === "failed" && <div className="text-danger">{sendMsg}</div>}
              </div>

              <div className="d-flex gap-2">
                <button className="btn btn-outline-primary" onClick={() => router.push("/preview")}>
                  Back to Preview
                </button>
                <button className="btn btn-primary" onClick={() => router.push("/assessment")}>
                  Retake Assessment
                </button>
              </div>
            </div>

            <div className="text-muted small mt-3">
              Tip: If you feel “I’m not ready”, that’s normal. Start anyway. Readiness comes *after* action 😄
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
