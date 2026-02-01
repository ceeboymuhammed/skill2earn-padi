"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewRec = {
  skill_code: string;
  skill_name: string;
  score: number;
  teaser: string[];
};

type PreviewResp = {
  session_id: string;
  unlocked: boolean;
  mode: "preview";
  recommendations: PreviewRec[];
};

type FullRec = {
  skill_code: string;
  skill_name: string;
  score: number;
  reasons: string[];
  badges: string[];
  warnings: string[];
};

type FullResp = {
  session_id: string;
  unlocked: boolean;
  mode: "full";
  recommendations: FullRec[];
};

type AssessmentStored = {
  session_id?: string;

  state?: string;
  city?: string;
  area?: string;

  full_name?: string;
  email?: string;
  phone?: string;

  equipment_access?: string;
  computer_proficiency?: number;

  seed_capital?: string;
  utility_reliability?: string;

  workspace_preference?: string;
  social_battery?: string;
  mobility?: string;

  problem_instinct?: string;
  math_logic_comfort?: string;
  patience_level?: string;
  learning_style?: string;

  income_urgency?: string;
  primary_interest?: string;
};

const PREVIEW_KEY = "s2e_last_preview";
const FULL_KEY = "s2e_last_full";
const ASSESS_KEY = "s2e_last_assessment";
const SESSION_KEY = "s2e_session_id";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function getApiErrorMessage(json: unknown): string | null {
  if (!isObj(json)) return null;
  if (typeof json.message === "string") return json.message;
  if (typeof json.error === "string") return json.error;
  return null;
}

function isPreviewResp(x: unknown): x is PreviewResp {
  if (!isObj(x)) return false;
  return x.mode === "preview" && typeof x.session_id === "string" && Array.isArray(x.recommendations);
}

function isFullResp(x: unknown): x is FullResp {
  if (!isObj(x)) return false;
  return x.mode === "full" && typeof x.session_id === "string" && Array.isArray(x.recommendations);
}

function getPayLink(): string | null {
  const link = process.env.NEXT_PUBLIC_FLW_PAY_LINK;
  if (!link) return null;
  const trimmed = link.trim();
  return trimmed.length ? trimmed : null;
}

export default function PreviewPage() {
  const router = useRouter();
  const couponBoxRef = useRef<HTMLDivElement | null>(null);

  const [resp, setResp] = useState<PreviewResp | null>(null);
  const [assessment, setAssessment] = useState<AssessmentStored | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [whatLiked, setWhatLiked] = useState("");
  const [whatWrong, setWhatWrong] = useState("");

  const [unlockLoading, setUnlockLoading] = useState(false);

  // Coupon UI
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  // Pay UI
  const [payLoading, setPayLoading] = useState(false);

  useEffect(() => {
    const a = safeParse<AssessmentStored>(localStorage.getItem(ASSESS_KEY));
    setAssessment(a);

    const r = safeParse<unknown>(localStorage.getItem(PREVIEW_KEY));
    if (!isPreviewResp(r)) {
      setResp(null);
      setError("No preview results found. Please complete the assessment again.");
      return;
    }

    const storedSession = localStorage.getItem(SESSION_KEY);
    const session_id = storedSession || r.session_id || a?.session_id;

    if (!session_id) {
      setResp(null);
      setError("No session found. Please complete the assessment again.");
      return;
    }

    localStorage.setItem(SESSION_KEY, session_id);
    setResp({ ...r, session_id });
    setError(null);
  }, []);

  const top = useMemo(() => resp?.recommendations?.slice(0, 3) ?? [], [resp]);
  const topSkillCode = top[0]?.skill_code ?? null;

  async function tryLoadFullResults() {
    setError(null);
    setSavedMsg(null);

    const a = safeParse<AssessmentStored>(localStorage.getItem(ASSESS_KEY));
    const session_id = localStorage.getItem(SESSION_KEY) || a?.session_id || resp?.session_id;

    if (!a || !session_id) {
      setError("Missing assessment data. Please retake the assessment.");
      return;
    }

    setUnlockLoading(true);
    try {
      const payload = { ...a, session_id, mode: "full" as const };

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Unable to load full results yet.";
        setError(msg);
        return;
      }

      if (isFullResp(json)) {
        localStorage.setItem(FULL_KEY, JSON.stringify(json));
        router.push("/results");
        return;
      }

      if (isPreviewResp(json)) {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(json));
        setResp(json);
        setError("Still locked. Enter your coupon code to unlock full results.");
        return;
      }

      setError("Unexpected response. Please try again.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setUnlockLoading(false);
    }
  }

  function startPayment() {
    setError(null);
    setCouponMsg(null);

    const link = getPayLink();
    if (!link) {
      setError("Missing NEXT_PUBLIC_FLW_PAY_LINK in .env.local");
      return;
    }

    setPayLoading(true);

    // Open Flutterwave link in same tab (or use window.open for new tab)
    window.location.href = link;
  }

  async function verifyCoupon() {
    setError(null);
    setCouponMsg(null);

    const session_id = localStorage.getItem(SESSION_KEY) || resp?.session_id || assessment?.session_id;
    if (!session_id) {
      setError("No session found. Please retake the assessment.");
      return;
    }

    const code = couponCode.trim();
    if (!code) {
      setError("Enter a coupon code.");
      return;
    }

    setCouponLoading(true);
    try {
      const res = await fetch("/api/verify-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, coupon_code: code }),
      });

      const json = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Coupon verification failed.";
        setError(msg);
        return;
      }

      setCouponMsg("✅ Coupon verified. You’re unlocked — tap “Show my full results”.");
      if (resp) setResp({ ...resp, unlocked: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCouponLoading(false);
    }
  }

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
      const session_id = localStorage.getItem(SESSION_KEY) || resp.session_id || assessment?.session_id || null;

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id,
          rating,
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
        const msg = getApiErrorMessage(json) ?? "Failed to submit feedback";
        throw new Error(msg);
      }

      setSavedMsg("Thanks! Your feedback has been submitted.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function redoAssessment() {
    localStorage.removeItem(PREVIEW_KEY);
    localStorage.removeItem(FULL_KEY);
    localStorage.removeItem(SESSION_KEY);
    router.push("/assessment");
  }

  function scrollToCoupon() {
    couponBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="bg-light min-vh-100">
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
        {couponMsg && <div className="alert alert-success">{couponMsg}</div>}

        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-4">
            <div className="row g-4 align-items-center">
              <div className="col-12 col-lg-7">
                <div className="badge text-bg-primary mb-2">Preview is Ready</div>
                <h1 className="h3 mb-2">
                  Your best skill path is here — <span className="text-primary">unlock</span> to see everything.
                </h1>
                <p className="text-muted mb-0">
                  Pay to get a coupon on WhatsApp, then come back here and apply the coupon to unlock full results.
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

            <div className="row g-3 mt-4">
              <div className="col-12 col-lg-6">
                <div className="p-3 border rounded h-100 bg-white">
                  <div className="fw-semibold mb-1">Option 1: Pay to get your coupon</div>
                  <div className="text-muted small mb-3">
                    After successful payment, Flutterwave redirects you to WhatsApp (+2348026521855) to collect your coupon.
                    Then return to this page and apply it.
                  </div>

                  <button className="btn btn-primary btn-lg w-100" onClick={startPayment} disabled={payLoading}>
                    {payLoading ? "Redirecting..." : "Pay to Unlock (Get Coupon on WhatsApp)"}
                  </button>

                  <button className="btn btn-outline-primary w-100 mt-2" onClick={scrollToCoupon}>
                    I already have my coupon — enter it now
                  </button>
                </div>
              </div>

              <div className="col-12 col-lg-6" ref={couponBoxRef}>
                <div className="p-3 border rounded h-100 bg-white">
                  <div className="fw-semibold mb-1">Option 2: Enter coupon</div>
                  <div className="text-muted small mb-2">Paste the coupon you received on WhatsApp.</div>

                  <div className="d-flex gap-2">
                    <input
                      className="form-control form-control-lg"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                    <button className="btn btn-outline-primary btn-lg" onClick={verifyCoupon} disabled={couponLoading}>
                      {couponLoading ? "Verifying..." : "Verify"}
                    </button>
                  </div>

                  <div className="mt-3">
                    <button className="btn btn-success btn-lg w-100" onClick={tryLoadFullResults} disabled={unlockLoading}>
                      {unlockLoading ? "Loading..." : "Show my full results"}
                    </button>
                    <div className="text-muted small text-center mt-2">
                      Verify coupon first, then tap “Show my full results”.
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

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
                  <button className="btn btn-success w-100" onClick={tryLoadFullResults} disabled={unlockLoading}>
                    {unlockLoading ? "Loading..." : "Show Full Details"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

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
                <textarea className="form-control" rows={4} value={whatLiked} onChange={(e) => setWhatLiked(e.target.value)} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label fw-semibold">What did we miss? (optional)</label>
                <textarea className="form-control" rows={4} value={whatWrong} onChange={(e) => setWhatWrong(e.target.value)} />
              </div>
            </div>

            <div className="d-grid d-md-flex gap-2 mt-3">
              <button className="btn btn-primary" onClick={saveFeedback}>
                Submit Feedback
              </button>
              <button className="btn btn-outline-primary" onClick={startPayment} disabled={payLoading}>
                {payLoading ? "Redirecting..." : "Pay (Get Coupon on WhatsApp)"}
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-muted small mt-4">© {new Date().getFullYear()} Skill2Earn Padi</div>
      </div>
    </div>
  );
}