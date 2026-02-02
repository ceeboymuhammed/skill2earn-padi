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

type StoredSelected = {
  session_id: string;
  selected: SelectedRec;
  commence: "NOW" | "WITHIN_3_MONTHS";
  wants_training_centre: boolean;
  location: { lat?: number | null; lng?: number | null; text?: string } | null;
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

/**
 * Tiny external store for reading "send status" from localStorage.
 * This avoids:
 * - setState inside useEffect (your lint rule)
 * - reading refs during render (your lint rule)
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);

  const onStorage = (e: StorageEvent) => {
    // any relevant storage update can cause a refresh
    if (e.key && e.key.startsWith("s2e_sent_")) cb();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const l of listeners) l();
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

  // ✅ This is safe to use during render
  const sendState = useSyncExternalStore(
    subscribe,
    () => getSendStatus(flagKey),
    () => "idle"
  );

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

  // ✅ Effect does only side-effects (no setState, no refs read in render)
  useEffect(() => {
    if (!data || !flagKey) return;

    const current = localStorage.getItem(flagKey);
    if (current === "1") return; // already sent
    if (current === "sending") return; // already in progress

    // mark as sending
    localStorage.setItem(flagKey, "sending");
    notify();

    const payload = {
      session_id: data.session_id,
      state: "",
      city: "",
      area: "",

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
      },
    };

    fetch("/api/send-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json && (json.message || json.error)) || "Failed to send email");
        localStorage.setItem(flagKey, "1");
        notify();
      })
      .catch(() => {
        localStorage.setItem(flagKey, "failed");
        notify();
      });
  }, [data, flagKey]);

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
                  You asked us to connect you to the nearest training centre — we’ll follow up using your details.
                </div>
              )}
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
                <ul className="mb-0 mt-2">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4">
                <div className="fw-semibold text-danger">Small things to watch out for</div>
                <ul className="mb-0 mt-2">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
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
