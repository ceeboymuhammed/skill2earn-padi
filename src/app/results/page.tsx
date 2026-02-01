"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

type PreviewResp = {
  session_id: string;
  unlocked: boolean;
  mode: "preview";
  recommendations: Array<{
    skill_code: string;
    skill_name: string;
    score: number;
    teaser: string[];
  }>;
};

type ProviderLocked = {
  provider_id: string;
  name: string;
  provider_type: "Individual" | "TrainingCenter";
  state: string;
  city: string;
  area: string | null;
  mode_supported: "Physical" | "Online" | "Hybrid" | null;
  physical_delivery_percent: number;
  course_fee_min_ngn: number | null;
  course_fee_max_ngn: number | null;
  duration_weeks: number | null;
  rank: number;
};

type ProviderUnlocked = ProviderLocked & {
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  capabilities?: {
    has_power_backup: boolean;
    has_training_laptops: boolean;
    has_internet: boolean;
  };
};

type ProvidersResp =
  | { locked: true; unlocked: false; message: string; providers: ProviderLocked[] }
  | { locked: false; unlocked: true; providers: ProviderUnlocked[] };

const FULL_KEY = "s2e_last_full";
const PREVIEW_KEY = "s2e_last_preview";
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

function isFullResp(x: unknown): x is FullResp {
  return isObj(x) && x.mode === "full" && typeof x.session_id === "string" && Array.isArray(x.recommendations);
}

function isPreviewResp(x: unknown): x is PreviewResp {
  return isObj(x) && x.mode === "preview" && typeof x.session_id === "string" && Array.isArray(x.recommendations);
}

function isProvidersResp(x: unknown): x is ProvidersResp {
  return isObj(x) && Array.isArray((x as Record<string, unknown>).providers);
}

function getApiErrorMessage(json: unknown): string | null {
  if (!isObj(json)) return null;
  if (typeof json.message === "string") return json.message;
  if (typeof json.error === "string") return json.error;
  return null;
}

export default function ResultsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState<FullResp | null>(null);
  const [providersBySkill, setProvidersBySkill] = useState<Record<string, ProviderUnlocked[] | ProviderLocked[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Lead form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [requestedSkill, setRequestedSkill] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccessMsg, setLeadSuccessMsg] = useState<string | null>(null);
  const [leadErrorMsg, setLeadErrorMsg] = useState<string | null>(null);

  const lastAssessment = useMemo(() => {
    return safeParse<Record<string, unknown>>(typeof window !== "undefined" ? localStorage.getItem(ASSESS_KEY) : null);
  }, []);

  const top3 = useMemo(() => {
    return full?.recommendations?.slice(0, 3) ?? [];
  }, [full]);

  const loadFull = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1) Use cached full if present
      const cached = safeParse<unknown>(localStorage.getItem(FULL_KEY));
      if (isFullResp(cached)) {
        // Safety: if somehow cached says unlocked=false, push back
        if (!cached.unlocked) {
          router.push("/preview");
          return;
        }
        setFull(cached);

        if (!requestedSkill && cached.recommendations.length > 0) {
          setRequestedSkill(cached.recommendations[0].skill_code);
        }
        return;
      }

      // 2) Otherwise fetch full (but backend will return preview if locked)
      const raw = localStorage.getItem(ASSESS_KEY);
      if (!raw) {
        router.push("/preview");
        return;
      }

      const payload = safeParse<Record<string, unknown>>(raw);
      if (!payload) {
        router.push("/preview");
        return;
      }

      const session_id =
        localStorage.getItem(SESSION_KEY) ||
        (typeof payload.session_id === "string" ? payload.session_id : "");

      if (!session_id) {
        router.push("/preview");
        return;
      }

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, session_id, mode: "full" }),
      });

      const json: unknown = await res.json();

      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Full results failed";
        throw new Error(msg);
      }

      // If locked, backend will send preview — send user back
      if (isPreviewResp(json)) {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(json));
        localStorage.removeItem(FULL_KEY);
        router.push("/preview");
        return;
      }

      if (!isFullResp(json)) {
        router.push("/preview");
        return;
      }

      if (!json.unlocked) {
        localStorage.removeItem(FULL_KEY);
        router.push("/preview");
        return;
      }

      // cache + show
      localStorage.setItem(FULL_KEY, JSON.stringify(json));
      setFull(json);

      if (!requestedSkill && json.recommendations.length > 0) {
        setRequestedSkill(json.recommendations[0].skill_code);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [router, requestedSkill]);

  const loadProviders = useCallback(async (fullJson: FullResp) => {
    try {
      const payload = safeParse<Record<string, unknown>>(localStorage.getItem(ASSESS_KEY));
      const session_id =
        localStorage.getItem(SESSION_KEY) ||
        (typeof payload?.session_id === "string" ? payload.session_id : fullJson.session_id);

      const state = (typeof payload?.state === "string" ? payload.state : "") ?? "";
      const city = (typeof payload?.city === "string" ? payload.city : "") ?? "";
      const area = (typeof payload?.area === "string" ? payload.area : undefined) ?? undefined;

      // only providers for top 3
      const recs = fullJson.recommendations.slice(0, 3);

      const entries = await Promise.all(
        recs.map(async (rec) => {
          const pRes = await fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id,
              skill_code: rec.skill_code,
              state,
              city,
              area,
            }),
          });

          const pJson: unknown = await pRes.json();
          const providers = isProvidersResp(pJson) ? pJson.providers : [];
          return [rec.skill_code, providers] as const;
        })
      );

      const map: Record<string, ProviderUnlocked[] | ProviderLocked[]> = {};
      for (const [code, providers] of entries) map[code] = providers;

      setProvidersBySkill(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  useEffect(() => {
    if (full) loadProviders(full);
  }, [full, loadProviders]);

  const hasAnyMissingProviders = useMemo(() => {
    if (!full) return false;
    return top3.some((r) => (providersBySkill[r.skill_code] ?? []).length === 0);
  }, [full, top3, providersBySkill]);

  async function submitLead() {
    setLeadLoading(true);
    setLeadSuccessMsg(null);
    setLeadErrorMsg(null);

    try {
      if (!fullName.trim() || phone.trim().length < 7) {
        setLeadErrorMsg("Please enter your full name and a valid phone number.");
        return;
      }

      const state = (typeof lastAssessment?.state === "string" ? lastAssessment.state : "") ?? "";
      const city = (typeof lastAssessment?.city === "string" ? lastAssessment.city : "") ?? "";
      const area = (typeof lastAssessment?.area === "string" ? lastAssessment.area : "") ?? "";

      const session_id =
        (typeof lastAssessment?.session_id === "string" ? lastAssessment.session_id : "") ||
        localStorage.getItem(SESSION_KEY) ||
        full?.session_id ||
        "";

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id,
          full_name: fullName.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || undefined,
          state,
          city,
          area: area || undefined,
          requested_skill_code: requestedSkill || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const json: unknown = await res.json();
      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Failed to submit.";
        throw new Error(msg);
      }

      setFullName("");
      setPhone("");
      setWhatsapp("");
      setNotes("");

      setLeadSuccessMsg(
        hasAnyMissingProviders
          ? "Thanks! We’ll reach out within 48 hours with the closest verified training option near your location."
          : "Thanks! We’ll follow up to help you choose the best training option."
      );
    } catch (e: unknown) {
      setLeadErrorMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLeadLoading(false);
    }
  }

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold text-primary">Skill2Earn Padi</div>
            <div className="text-muted small">Your personalized results</div>
          </div>

          <div className="d-flex gap-2">
            <Link href="/assessment" className="btn btn-outline-primary">
              Retake
            </Link>
          </div>
        </div>
      </div>

      <div className="container py-4">
        {loading && <div className="alert alert-info">Loading results...</div>}
        {error && <div className="alert alert-danger">Error: {error}</div>}

        {/* Lead capture */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-4">
            <div className="d-flex flex-wrap gap-2 mb-2">
              <span className="badge bg-primary">Next steps</span>
              <span className="badge text-bg-light border">WhatsApp friendly</span>
              {hasAnyMissingProviders ? (
                <span className="badge text-bg-light border">48 hours response</span>
              ) : (
                <span className="badge text-bg-light border">Provider guidance</span>
              )}
            </div>

            <h2 className="h5 mb-2">
              {hasAnyMissingProviders
                ? "We don’t have a verified provider near you for at least one of your top skills."
                : "Want help choosing the best provider?"}
            </h2>

            <p className="text-muted mb-3">
              {hasAnyMissingProviders
                ? "Share your contact and we’ll reach out within 48 hours with the closest verified training option near your location."
                : "Share your contact and we’ll follow up to help you choose the best training option for your situation."}
            </p>

            {leadSuccessMsg && (
              <div className="alert alert-success alert-dismissible fade show" role="alert">
                {leadSuccessMsg}
                <button type="button" className="btn-close" onClick={() => setLeadSuccessMsg(null)} />
              </div>
            )}

            {leadErrorMsg && (
              <div className="alert alert-danger alert-dismissible fade show" role="alert">
                {leadErrorMsg}
                <button type="button" className="btn-close" onClick={() => setLeadErrorMsg(null)} />
              </div>
            )}

            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label">Full name</label>
                <input className="form-control" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Phone number</label>
                <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">WhatsApp (optional)</label>
                <input className="form-control" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Which skill should we help you with?</label>
                <select className="form-select" value={requestedSkill} onChange={(e) => setRequestedSkill(e.target.value)}>
                  {top3.map((r) => (
                    <option key={r.skill_code} value={r.skill_code}>
                      {r.skill_name} ({r.skill_code})
                    </option>
                  ))}
                  {!full && <option value="">(loading...)</option>}
                </select>
              </div>

              <div className="col-12">
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>

            <button className="btn btn-primary w-100 mt-3 py-2" onClick={submitLead} disabled={leadLoading}>
              {leadLoading ? "Submitting..." : hasAnyMissingProviders ? "Request provider within 48 hours" : "Request follow-up"}
            </button>
          </div>
        </div>

        {/* Top 3 only */}
        {full && (
          <div className="row g-3">
            {top3.map((r) => {
              const providers = providersBySkill[r.skill_code] ?? [];
              const hasProviders = providers.length > 0;

              return (
                <div className="col-12" key={r.skill_code}>
                  <div className="card shadow-sm border-0">
                    <div className="card-body p-4">
                      <div className="d-flex flex-column flex-md-row justify-content-between gap-2">
                        <div>
                          <h3 className="h5 mb-1">
                            <Link href={`/skills/${r.skill_code}`} className="text-decoration-underline">
                              {r.skill_name}
                            </Link>{" "}
                            <span className="text-muted small">({r.skill_code})</span>
                          </h3>

                          <div className="d-flex flex-wrap gap-2 mt-2">
                            <span className="badge text-bg-light border">Match: {r.score}%</span>

                            {r.badges.map((b, i) => (
                              <span key={`b-${i}`} className="badge text-bg-primary">
                                {b}
                              </span>
                            ))}

                            {hasProviders ? (
                              <span className="badge text-bg-light border">Providers available</span>
                            ) : (
                              <span className="badge text-bg-light border">No provider yet</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <hr className="my-3" />

                      <div>
                        <div className="fw-semibold mb-2">Why this fits you</div>
                        <ul className="text-muted mb-0">
                          {r.reasons.map((x, idx) => (
                            <li key={idx}>{x}</li>
                          ))}
                        </ul>
                      </div>

                      {r.warnings.length > 0 && (
                        <>
                          <hr className="my-3" />
                          <div>
                            <div className="fw-semibold mb-2">Warnings</div>
                            <ul className="mb-0">
                              {r.warnings.map((w, idx) => (
                                <li key={idx}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}

                      <hr className="my-3" />

                      <div>
                        <div className="fw-semibold mb-2">Nearest Providers</div>

                        {!hasProviders ? (
                          <div className="alert alert-light border mb-0">
                            No verified provider found yet for this skill in your area. Use the form above and we’ll contact you within 48 hours.
                          </div>
                        ) : (
                          <div className="d-grid gap-2">
                            {(providers as Array<ProviderLocked | ProviderUnlocked>).map((p) => (
                              <div key={p.provider_id} className="border rounded-3 p-3 bg-white">
                                <div className="fw-semibold">
                                  {p.name}{" "}
                                  <span className="text-muted fw-normal">
                                    — {p.city}
                                    {p.area ? ` (${p.area})` : ""}
                                  </span>
                                </div>

                                {"address" in p && p.address ? (
                                  <div className="text-muted small mt-1">Address: {p.address}</div>
                                ) : null}

                                <div className="d-flex flex-wrap gap-2 mt-2">
                                  <span className="badge text-bg-light border">Mode: {p.mode_supported ?? "Hybrid"}</span>
                                  <span className="badge text-bg-light border">Physical: {p.physical_delivery_percent}%</span>
                                  {p.duration_weeks ? (
                                    <span className="badge text-bg-light border">Duration: {p.duration_weeks} weeks</span>
                                  ) : null}
                                  {p.course_fee_min_ngn && p.course_fee_max_ngn ? (
                                    <span className="badge text-bg-light border">
                                      Fee: ₦{p.course_fee_min_ngn.toLocaleString()}–₦{p.course_fee_max_ngn.toLocaleString()}
                                    </span>
                                  ) : null}
                                </div>

                                {"whatsapp" in p && p.whatsapp ? (
                                  <div className="small mt-2">
                                    WhatsApp:{" "}
                                    <a
                                      className="text-primary fw-semibold"
                                      target="_blank"
                                      rel="noreferrer"
                                      href={`https://wa.me/${String(p.whatsapp).replace(/\D/g, "")}`}
                                    >
                                      {p.whatsapp}
                                    </a>
                                  </div>
                                ) : null}

                                {"phone" in p && p.phone ? (
                                  <div className="small">
                                    Phone:{" "}
                                    <a className="text-primary fw-semibold" href={`tel:${p.phone}`}>
                                      {p.phone}
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center text-muted small mt-4">© {new Date().getFullYear()} Skill2Earn Padi</div>
      </div>
    </div>
  );
}
