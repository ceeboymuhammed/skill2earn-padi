"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewRec = {
  skill_code: string;
  skill_name: string;
  score: number;
  teaser: string[];
};

type PreviewResp = {
  session_id: string | null;
  unlocked: boolean;
  mode: "preview";
  recommendations: PreviewRec[];
};

type AssessmentStored = {
  session_id?: string;
  state?: string;
  city?: string;
  area?: string;
};

const PREVIEW_KEY = "s2e_last_preview";
const ASSESS_KEY = "s2e_last_assessment";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function PreviewPage() {
  const router = useRouter();

  const [resp, setResp] = useState<PreviewResp | null>(null);
  const [assessment, setAssessment] = useState<AssessmentStored | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [whatLiked, setWhatLiked] = useState("");
  const [whatWrong, setWhatWrong] = useState("");

  useEffect(() => {
    const r = safeParse<PreviewResp>(localStorage.getItem(PREVIEW_KEY));
    const a = safeParse<AssessmentStored>(localStorage.getItem(ASSESS_KEY));

    if (!r || r.mode !== "preview" || !Array.isArray(r.recommendations)) {
      setResp(null);
      setAssessment(a);
      setError("No preview results found. Please complete the assessment again.");
      return;
    }

    setResp(r);
    setAssessment(a);
    setError(null);
  }, []);

  const top = useMemo(() => resp?.recommendations?.slice(0, 3) ?? [], [resp]);
  const topSkillCode = top[0]?.skill_code ?? null;

  async function saveFeedback() {
    setSavedMsg(null);
    setError(null);

    if (!resp) {
      setError("Preview not loaded.");
      return;
    }
    if (!rating) {
      setError("Please rate the recommendations (1–5).");
      return;
    }

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: resp.session_id ?? assessment?.session_id ?? null,
          rating, // narrowed to 1..5 here

          whatLiked: whatLiked.trim() || undefined,
          whatWrong: whatWrong.trim() || undefined,

          top_skill_code: topSkillCode ?? undefined,
          state: assessment?.state,
          city: assessment?.city,
          area: assessment?.area,
        }),
      });

      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "message" in json
            ? String((json as Record<string, unknown>).message)
            : "Failed to submit feedback";
        throw new Error(msg);
      }

      setSavedMsg("Thanks! Your feedback has been submitted.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function goPay() {
    // Payment page will handle coupon + unlock
    router.push("/pay");
  }

  function redoAssessment() {
    localStorage.removeItem(PREVIEW_KEY);
    router.push("/assessment");
  }

  return (
    <div className="bg-light min-vh-100">
      {/* Header */}
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold text-primary">Skill2Earn Padi</div>
            <div className="text-muted small">Preview Results</div>
          </div>
          <button className="btn btn-outline-primary" onClick={redoAssessment}>
            Retake Assessment
          </button>
        </div>
      </div>

      <div className="container py-4" style={{ maxWidth: 960 }}>
        {error && <div className="alert alert-danger">{error}</div>}

        {/* Hero */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-4">
            <div className="row g-4 align-items-center">
              <div className="col-12 col-lg-7">
                <div className="badge text-bg-primary mb-2">Preview is Ready</div>
                <h1 className="h3 mb-2">
                  Your best skill path is here — <span className="text-primary">unlock</span> to see everything.
                </h1>
                <p className="text-muted mb-0">
                  This preview shows your top matches. Full Results unlocks the complete “Why this fits you” breakdown +
                  training centres closest to you.
                </p>
              </div>

              <div className="col-12 col-lg-5">
                <div className="p-3 rounded bg-primary bg-opacity-10 border border-primary border-opacity-25">
                  <div className="fw-semibold mb-1">When you unlock, you get:</div>
                  <ul className="mb-0 small">
                    <li>Nearest verified training centres with address + WhatsApp</li>
                    <li>Prerequisite warnings (e.g. Computer Fundamentals)</li>
                    <li>Timeline realism: learn time + earn time</li>
                    <li>Cost reality based on your profile</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="d-grid gap-2 mt-4">
              <button className="btn btn-primary btn-lg" onClick={goPay}>
                Pay to Unlock Full Results (Coupons Available)
              </button>
              <div className="text-muted small text-center">
                Early testers can use promo coupons to unlock access.
              </div>
            </div>
          </div>
        </div>

        {/* Preview cards */}
        <div className="row g-3 mb-4">
          {top.map((r) => (
            <div className="col-12 col-md-6 col-lg-4" key={r.skill_code}>
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="text-muted small">Top Match</div>
                      <div className="fw-bold">{r.skill_name}</div>
                      <div className="text-muted small">Code: {r.skill_code}</div>
                    </div>
                    <span className="badge text-bg-primary">Score {r.score}</span>
                  </div>

                  <hr />

                  <div className="fw-semibold mb-2">Why it’s showing up</div>
                  <ul className="small mb-0">
                    {(r.teaser ?? []).slice(0, 2).map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="card-footer bg-white border-0 pt-0 pb-3 px-3">
                  <button className="btn btn-outline-primary w-100" onClick={goPay}>
                    Unlock Full Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Feedback */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-4">
            <h2 className="h5 mb-2">Rate the accuracy of these recommendations</h2>
            <p className="text-muted mb-3">
              Your feedback helps us improve the engine for Nigeria and helps us validate skills vs. real outcomes.
            </p>

            {savedMsg && <div className="alert alert-success">{savedMsg}</div>}

            <div className="mb-3">
              <div className="fw-semibold mb-2">Your rating *</div>
              <div className="d-flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn ${rating === n ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => setRating(n as 1 | 2 | 3 | 4 | 5)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="text-muted small mt-1">1 = poor fit, 5 = perfect fit</div>
            </div>

            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label fw-semibold">What did we get right? (optional)</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={whatLiked}
                  onChange={(e) => setWhatLiked(e.target.value)}
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label fw-semibold">What did we miss? (optional)</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={whatWrong}
                  onChange={(e) => setWhatWrong(e.target.value)}
                />
              </div>
            </div>

            <div className="d-grid d-md-flex gap-2 mt-3">
              <button className="btn btn-primary" onClick={saveFeedback}>
                Submit Feedback
              </button>
              <button className="btn btn-outline-primary" onClick={goPay}>
                Pay to Unlock Full Results
              </button>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <h2 className="h5 mb-2">Unlock training centres closest to your address</h2>
            <p className="text-muted mb-3">
              Full Results shows nearby providers, contact info, and delivery mode (physical/hybrid/online).
            </p>
            <button className="btn btn-primary btn-lg w-100" onClick={goPay}>
              Go to Payment (Coupon Supported)
            </button>
          </div>
        </div>

        <div className="text-center text-muted small mt-4">
          © {new Date().getFullYear()} Skill2Earn Padi
        </div>
      </div>
    </div>
  );
}
