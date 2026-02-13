"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const SELECTED_RESULT_KEY = "s2e_selected_result_v1";

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

function makeFlagKey(data: StoredSelected) {
  return `s2e_sent_${data.session_id}_${data.selected.skill_code}_${data.contact.email}`;
}

/* ---------- SEND STATUS STORE ---------- */

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

export default function ResultsPage() {
  const router = useRouter();
  const data = useMemo(() => loadSelectedFromStorage(), []);
  const flagKey = useMemo(() => (data ? makeFlagKey(data) : null), [data]);
  const sendState = useSyncExternalStore(subscribeSend, () => getSendStatus(flagKey), () => "idle");

  const pct = useMemo(() => (data ? scoreToPct(data.selected.score) : 0), [data]);

  const locationSummary = useMemo(() => {
    if (!data?.provider_search_context) return null;
    const ctx = data.provider_search_context;
    return `${ctx.area}, ${ctx.city}${ctx.state ? ", " + ctx.state : ""}`;
  }, [data]);

  /* ---------- AUTO EMAIL SEND (UNCHANGED) ---------- */
  useEffect(() => {
    if (!data || !flagKey) return;

    const current = localStorage.getItem(flagKey);
    if (current === "1" || current === "sending") return;

    localStorage.setItem(flagKey, "sending");
    notifySend();

    fetch("/api/send-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: data.session_id }),
    })
      .then(() => {
        localStorage.setItem(flagKey, "1");
        notifySend();
      })
      .catch(() => {
        localStorage.setItem(flagKey, "failed");
        notifySend();
      });
  }, [data, flagKey]);

  if (!data) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning">
          No selected result found. Please retake the assessment.
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/assessment")}>
          Take Assessment
        </button>
      </div>
    );
  }

  const selected = data.selected;
  const reasons = pick(selected.reasons, 4);
  const badges = pick(selected.badges, 6);
  const warnings = pick(selected.warnings, 2);

  const whatsappHelpLink = `https://wa.me/2348039622610?text=${encodeURIComponent(`
Hello Skill2Earn Padi Team,

My name is ${data.contact.full_name}.
I would like help registering for:

Course: ${selected.skill_name}
Location: ${locationSummary ?? "Not specified"}

Please guide me on the next steps.
`.trim())}`;

  const inviteLink = `https://wa.me/?text=${encodeURIComponent(`
Hey 👋

I just completed the Skill2Earn Padi skill assessment and got a personalized recommendation.

You should try it too:

${typeof window !== "undefined" ? window.location.origin : ""}/assessment
`.trim())}`;

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3">
          <div className="fw-bold text-primary">Your Selected Skill Result</div>
          <div className="text-muted small">
            This page shows only your chosen skill.
          </div>
        </div>
      </div>

      <div className="container py-4">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">

            <div className="d-flex justify-content-between align-items-start">
              <div>
                <div className="text-muted small">Selected Skill</div>
                <h1 className="h4 mb-0">{selected.skill_name}</h1>
              </div>
              <span className="badge bg-success-subtle text-success">
                Match: {pct}%
              </span>
            </div>

            {badges.length > 0 && (
              <div className="mt-3 d-flex flex-wrap gap-2">
                {badges.map((b, i) => (
                  <span key={i} className="badge bg-primary-subtle text-primary">
                    {b}
                  </span>
                ))}
              </div>
            )}

            {reasons.length > 0 && (
              <div className="mt-4">
                <div className="fw-semibold">Why we recommended this</div>
                <ul className="mt-2">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4">
                <div className="fw-semibold text-danger">
                  Small things to watch out for
                </div>
                <ul className="mt-2">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 p-3 rounded bg-white border">
              <div className="fw-semibold">Do this next (simple)</div>
              <ol className="mt-2">
                <li>Pick 1 beginner resource and start today (30–45 mins).</li>
                <li>Build a tiny practice project this week.</li>
                <li>Ask someone to check your progress after 7 days 😄</li>
              </ol>
            </div>

            <div className="mt-4 d-grid gap-3">

              <a
                href={whatsappHelpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-success"
              >
                Request a Call / Help Me Register
              </a>

              <a
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-primary"
              >
                Invite a Friend to Take the Test
              </a>

            </div>

            <div className="mt-3">
              {sendState === "sending" && (
                <div className="text-muted">Sending your result to your email…</div>
              )}
              {sendState === "sent" && (
                <div className="text-success">
                  ✅ We’ve sent your result to your email.
                </div>
              )}
              {sendState === "failed" && (
                <div className="text-danger">
                  Email sending failed. Please refresh to retry.
                </div>
              )}
            </div>

            <div className="text-muted small mt-4">
              Tip: If you feel “I’m not ready”, that’s normal. Start anyway.
              Readiness comes after action 😄
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}