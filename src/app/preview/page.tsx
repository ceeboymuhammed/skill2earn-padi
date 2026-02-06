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

  full_name?: string;
  email?: string;
  phone?: string;
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

  // Optional enhancements (not required for MVP)
  lat: number | null;
  lng: number | null;

  created_at_iso: string;
};

const PREVIEW_KEY = "s2e_last_preview";
const ASSESS_KEY = "s2e_last_assessment";
const SESSION_KEY = "s2e_session_id";
const FULL_KEY = "s2e_last_full";

// for results page
const SELECTED_RESULT_KEY = "s2e_selected_result_v1";

// ✅ new: provider search input store
const PROVIDER_SEARCH_CONTEXT_KEY = "s2e_provider_search_context_v1";

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

function isPreviewRec(x: unknown): x is PreviewRec {
  if (!isObj(x)) return false;
  if (typeof x.skill_code !== "string") return false;
  if (typeof x.skill_name !== "string") return false;
  if (typeof x.score !== "number") return false;
  if (!Array.isArray(x.teaser)) return false;
  return x.teaser.every((t) => typeof t === "string");
}

function isPreviewResp(x: unknown): x is PreviewResp {
  return (
    isObj(x) &&
    x.mode === "preview" &&
    typeof x.session_id === "string" &&
    typeof x.unlocked === "boolean" &&
    Array.isArray(x.recommendations) &&
    x.recommendations.every(isPreviewRec)
  );
}

function isFullRec(x: unknown): x is FullRec {
  if (!isObj(x)) return false;
  if (typeof x.skill_code !== "string") return false;
  if (typeof x.skill_name !== "string") return false;
  if (typeof x.score !== "number") return false;

  const reasons = x.reasons;
  const badges = x.badges;
  const warnings = x.warnings;

  if (!Array.isArray(reasons) || !reasons.every((r) => typeof r === "string")) return false;
  if (!Array.isArray(badges) || !badges.every((b) => typeof b === "string")) return false;
  if (!Array.isArray(warnings) || !warnings.every((w) => typeof w === "string")) return false;

  return true;
}

function isFullResp(x: unknown): x is FullResp {
  return (
    isObj(x) &&
    x.mode === "full" &&
    typeof x.session_id === "string" &&
    typeof x.unlocked === "boolean" &&
    Array.isArray(x.recommendations) &&
    x.recommendations.every(isFullRec)
  );
}

function clampTop3(recs: PreviewRec[]) {
  return [...recs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
}

function getApiErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

function scoreToPct(score: number) {
  if (!Number.isFinite(score)) return 0;
  return score > 1 ? Math.round(score) : Math.round(score * 100);
}

function norm(s: string) {
  return s.trim();
}

function buildAddressText(area: string, city: string, state: string) {
  const parts = [area, city, state, "Nigeria"].map((x) => x.trim()).filter(Boolean);
  return parts.join(", ");
}

type Commence = "NOW" | "WITHIN_3_MONTHS";

export default function PreviewPage() {
  const router = useRouter();

  const [assessment, setAssessment] = useState<AssessmentStored | null>(null);
  const [resp, setResp] = useState<PreviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedSkillCode, setSelectedSkillCode] = useState<string>("");

  // send form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [commence, setCommence] = useState<Commence>("NOW");

  // ✅ Default YES
  const [wantsTrainingCentre, setWantsTrainingCentre] = useState(true);

  // optional GPS/manual location enhancements
  const [geoLoading, setGeoLoading] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationText, setLocationText] = useState("");

  const [sendLoading, setSendLoading] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

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

    // Prefill if we have them
    setFullName(a?.full_name ?? "");
    setEmail(a?.email ?? "");
    setPhone(a?.phone ?? "");

    // Default-select first recommendation
    if (r.recommendations.length) {
      setSelectedSkillCode(r.recommendations[0].skill_code);
    }

    // If they already provided city/area in assessment, prefill text helper
    const aCity = norm(a?.city ?? "");
    const aArea = norm(a?.area ?? "");
    const aState = norm(a?.state ?? "");
    const derived = buildAddressText(aArea, aCity, aState);
    if (derived && derived !== "Nigeria") {
      setLocationText(derived);
    }
  }, []);

  const top3 = useMemo(() => {
    if (!resp?.recommendations?.length) return [];
    return clampTop3(resp.recommendations);
  }, [resp]);

  const selectedPreview = useMemo(() => {
    if (!selectedSkillCode) return null;
    return top3.find((x) => x.skill_code === selectedSkillCode) ?? null;
  }, [top3, selectedSkillCode]);

  // ✅ Core: persist provider-search context whenever skill/location is available
  useEffect(() => {
    if (!resp?.session_id) return;
    if (!assessment) return;
    if (!selectedSkillCode) return;

    const city = norm(assessment.city ?? "");
    const area = norm(assessment.area ?? "");
    const state = norm(assessment.state ?? "");

    // only store if we have at least city+area (your flow says user provides these)
    if (!city || !area) return;

    const ctx: ProviderSearchContext = {
      version: "v1",
      session_id: resp.session_id,
      skill_code: selectedSkillCode,
      country: "Nigeria",
      state,
      city,
      area,
      address_text: buildAddressText(area, city, state),
      lat,
      lng,
      created_at_iso: new Date().toISOString(),
    };

    localStorage.setItem(PROVIDER_SEARCH_CONTEXT_KEY, JSON.stringify(ctx));
  }, [resp?.session_id, assessment, selectedSkillCode, lat, lng]);

  function requestLocation() {
    setGeoLoading(true);
    setSendErr(null);

    if (!("geolocation" in navigator)) {
      setGeoLoading(false);
      setSendErr("Geolocation is not supported on this device. Please type your location manually.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setSendErr("Could not access your location. Please type your location manually.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function validateSend(): string | null {
    if (!resp?.session_id) return "Session missing. Please retake the assessment.";
    if (!selectedSkillCode) return "Please select one skill to continue.";

    if (!fullName.trim()) return "Please enter your full name.";
    if (!email.trim()) return "Please enter your email.";
    if (!phone.trim()) return "Please enter your phone number.";

    // ✅ Your updated rule: user already provided city/area before final result
    // So if they want training centre, we only require assessment city/area.
    if (wantsTrainingCentre) {
      const city = norm(assessment?.city ?? "");
      const area = norm(assessment?.area ?? "");
      if (!city || !area) {
        return "Your location (city/area) is missing. Please retake the assessment and enter your city/area.";
      }
      // GPS/manual text are optional enhancements (not mandatory)
    }

    return null;
  }

  async function fetchFullAndPickSelected(code: string): Promise<FullRec> {
    if (!resp || !assessment) throw new Error("Missing session or assessment.");

    const payload = {
      ...assessment,
      session_id: resp.session_id,
      mode: "full" as const,
    };

    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as unknown;

    if (!res.ok) {
      const msg = getApiErrorMessage(json) ?? "Failed to load full details.";
      throw new Error(msg);
    }

    if (!isFullResp(json)) {
      throw new Error("Invalid full details response.");
    }

    localStorage.setItem(FULL_KEY, JSON.stringify(json));

    const selected = json.recommendations.find((r) => r.skill_code === code);
    if (!selected) throw new Error("Selected skill not found in full recommendations.");

    return selected;
  }

  async function sendResult() {
    setSendMsg(null);
    setSendErr(null);

    const v = validateSend();
    if (v) {
      setSendErr(v);
      return;
    }

    if (!resp || !assessment) return;

    setSendLoading(true);
    try {
      const selectedFull = await fetchFullAndPickSelected(selectedSkillCode);

      const state = norm(assessment.state ?? "");
      const city = norm(assessment.city ?? "");
      const area = norm(assessment.area ?? "");

      // ✅ Build provider search context (authoritative source is assessment)
      const providerCtx: ProviderSearchContext | null =
        city && area
          ? {
              version: "v1",
              session_id: resp.session_id,
              skill_code: selectedSkillCode,
              country: "Nigeria",
              state,
              city,
              area,
              address_text: buildAddressText(area, city, state),
              lat,
              lng,
              created_at_iso: new Date().toISOString(),
            }
          : null;

      if (providerCtx) {
        localStorage.setItem(PROVIDER_SEARCH_CONTEXT_KEY, JSON.stringify(providerCtx));
      }

      const body = {
        session_id: resp.session_id,

        state,
        city,
        area,

        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),

        commence,
        wants_training_centre: wantsTrainingCentre,

        // Optional GPS/manual enhancement
        location: wantsTrainingCentre
          ? {
              lat,
              lng,
              text: norm(locationText) || undefined,
            }
          : null,

        // ✅ key integration: include provider search context for downstream APIs (optional but useful)
        provider_search_context: wantsTrainingCentre ? providerCtx : null,

        preview_recommendations: top3,
        selected_recommendation: selectedFull,
        answers: assessment,
      };

      const res = await fetch("/api/send-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Failed to send your result. Please try again.";
        throw new Error(msg);
      }

      setSendMsg("✅ Your selected skill details have been sent successfully.");

      localStorage.setItem(
        SELECTED_RESULT_KEY,
        JSON.stringify({
          session_id: resp.session_id,
          selected: selectedFull,
          commence,
          wants_training_centre: wantsTrainingCentre,
          location: body.location,
          provider_search_context: body.provider_search_context,
          contact: { full_name: body.full_name, email: body.email, phone: body.phone },
          preview: top3,
        })
      );

      router.push("/results");
    } catch (e: unknown) {
      setSendErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSendLoading(false);
    }
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">{error}</div>
        <button className="btn btn-primary" onClick={() => router.push("/assessment")}>
          Go to Assessment
        </button>
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="container py-5">
        <div className="text-muted">Loading preview…</div>
      </div>
    );
  }

  const cityDisplay = norm(assessment?.city ?? "");
  const areaDisplay = norm(assessment?.area ?? "");
  const stateDisplay = norm(assessment?.state ?? "");
  const locationSummary =
    cityDisplay && areaDisplay ? `${areaDisplay}, ${cityDisplay}${stateDisplay ? ", " + stateDisplay : ""}` : "";

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3">
          <div className="fw-bold text-primary">Your Top 3 Skill Matches</div>
          <div className="text-muted small">
            Select <strong>one</strong> skill. Then fill your details and send to see the full breakdown.
          </div>

          {locationSummary ? (
            <div className="mt-2 small text-muted">
              Your location: <strong>{locationSummary}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="container py-4">
        {/* TOP 3 */}
        <div className="row g-3">
          {top3.map((r) => {
            const selected = r.skill_code === selectedSkillCode;
            return (
              <div className="col-12 col-md-4" key={r.skill_code}>
                <div className={`card shadow-sm border-0 h-100 ${selected ? "border border-primary" : ""}`}>
                  <div className="card-body">
                    <div className="d-flex align-items-start justify-content-between">
                      <div className="fw-bold">{r.skill_name}</div>
                      <span className="badge bg-primary-subtle text-primary">{scoreToPct(r.score)}%</span>
                    </div>

                    {r.teaser.length ? (
                      <ul className="mt-3 mb-0 small text-muted">
                        {r.teaser.slice(0, 3).map((t, i) => (
                          <li key={`${r.skill_code}-teaser-${i}`}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-3 small text-muted">No teaser available.</div>
                    )}
                  </div>

                  <div className="card-footer bg-white border-0 pt-0">
                    <button
                      type="button"
                      className={`btn w-100 ${selected ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setSelectedSkillCode(r.skill_code)}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* SELECTED SUMMARY */}
        <div className="mt-4">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <div className="fw-semibold mb-2">Selected Skill</div>

              {!selectedPreview && <div className="text-muted">Select one of the 3 recommendations above.</div>}

              {selectedPreview && (
                <>
                  <div className="d-flex align-items-center justify-content-between">
                    <h2 className="h5 mb-0">{selectedPreview.skill_name}</h2>
                    <span className="badge bg-success-subtle text-success">
                      Match Score: {scoreToPct(selectedPreview.score)}%
                    </span>
                  </div>

                  {selectedPreview.teaser.length ? (
                    <>
                      <div className="mt-3 fw-semibold">Quick reasons</div>
                      <ul className="mb-0">
                        {selectedPreview.teaser.slice(0, 3).map((x, i) => (
                          <li key={`${selectedPreview.skill_code}-reason-${i}`}>{x}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <div className="text-muted small mt-3">
                    Full details will load after you click <strong>Send My Selected Skill Result</strong>.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SEND FORM */}
        <div className="mt-4">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <div className="fw-semibold mb-2">Receive Your Result</div>
              <div className="text-muted small mb-3">
                We’ll send only the full details of your <strong>selected</strong> skill.
              </div>

              {sendMsg && <div className="alert alert-success">{sendMsg}</div>}
              {sendErr && <div className="alert alert-danger">{sendErr}</div>}

              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <label className="form-label">Full name *</label>
                  <input className="form-control" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label">Email *</label>
                  <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label">Phone *</label>
                  <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              <hr className="my-4" />

              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label">Are you willing to commence now or within 3 months? *</label>
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className={`btn ${commence === "NOW" ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setCommence("NOW")}
                    >
                      Commence Now
                    </button>
                    <button
                      type="button"
                      className={`btn ${commence === "WITHIN_3_MONTHS" ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => setCommence("WITHIN_3_MONTHS")}
                    >
                      Within 3 Months
                    </button>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Do you want us to connect you with the nearest training centre?</label>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={wantsTrainingCentre}
                      onChange={(e) => setWantsTrainingCentre(e.target.checked)}
                      id="tcSwitch"
                    />
                    <label className="form-check-label" htmlFor="tcSwitch">
                      {wantsTrainingCentre ? "Yes, connect me" : "No, not now"}
                    </label>
                  </div>
                  {wantsTrainingCentre && locationSummary ? (
                    <div className="small text-muted mt-1">
                      We’ll use <strong>{locationSummary}</strong> to find centres near you.
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Optional GPS/manual enhancements */}
              {wantsTrainingCentre && (
                <>
                  <hr className="my-4" />
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label">Share your location (optional, improves accuracy)</label>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-outline-primary"
                          type="button"
                          onClick={requestLocation}
                          disabled={geoLoading}
                        >
                          {geoLoading ? "Getting location…" : "Use my current location"}
                        </button>
                        <div className="text-muted small d-flex align-items-center">
                          {lat !== null && lng !== null ? "✅ Location captured" : "Optional"}
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label">Location details (optional)</label>
                      <input
                        className="form-control"
                        value={locationText}
                        onChange={(e) => setLocationText(e.target.value)}
                        placeholder="e.g. Ikeja, Lagos"
                      />
                      <div className="small text-muted mt-1">
                        This is optional. Your assessment location is already enough to proceed.
                      </div>
                    </div>
                  </div>
                </>
              )}

              <hr className="my-4" />

              <button className="btn btn-success w-100" onClick={sendResult} disabled={sendLoading || !selectedSkillCode}>
                {sendLoading ? "Sending…" : "Send My Selected Skill Result"}
              </button>

              <div className="text-muted small mt-2">
                Tip: pick one skill above first. We’ll send only the full details of that skill.
              </div>
            </div>
          </div>
        </div>

        {/* RETAKE */}
        <div className="mt-4 text-center">
          <button className="btn btn-link" onClick={() => router.push("/assessment")}>
            Retake assessment
          </button>
        </div>

        {/* FOOTER PARTNERSHIP */}
        <div className="text-center text-muted small mt-4">
          Partnership & Collaboration:{" "}
          <a href="tel:+2347034536719" className="text-decoration-none fw-semibold">
            +2347034536719
          </a>{" "}
          |{" "}
          <a href="mailto:skill2earn-padi@gmail.com" className="text-decoration-none fw-semibold">
            skill2earn-padi@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
