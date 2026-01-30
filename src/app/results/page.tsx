"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FullResp = {
  session_id: string;
  unlocked: boolean;
  mode: "full";
  recommendations: { skill_code: string; skill_name: string; score: number; reasons: string[] }[];
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

function isProvidersResp(x: unknown): x is ProvidersResp {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  return Array.isArray(obj.providers);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
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
    const raw = typeof window !== "undefined" ? localStorage.getItem("s2e_last_assessment") : null;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, []);

  const loadFull = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const raw = localStorage.getItem("s2e_last_assessment");
      if (!raw) throw new Error("No assessment found. Please complete the assessment.");

      const payload = JSON.parse(raw) as Record<string, unknown>;

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, mode: "full" }),
      });

      const json = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = isObj(json) && "message" in json ? String(json.message) : "Full results failed";
        throw new Error(msg);
      }

      if (!json || typeof json !== "object") {
        router.push("/preview");
        return;
      }

      const obj = json as Record<string, unknown>;
      if (obj.mode !== "full") {
        router.push("/preview");
        return;
      }

      const fullJson = obj as unknown as FullResp;
      setFull(fullJson);

      // default requested skill
      if (!requestedSkill && fullJson.recommendations.length > 0) {
        setRequestedSkill(fullJson.recommendations[0].skill_code);
      }

      const map: Record<string, ProviderUnlocked[] | ProviderLocked[]> = {};

      for (const rec of fullJson.recommendations) {
        const pRes = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: payload.session_id,
            skill_code: rec.skill_code,
            state: payload.state,
            city: payload.city,
            area: payload.area,
          }),
        });

        const pJson = (await pRes.json()) as unknown;
        map[rec.skill_code] = isProvidersResp(pJson) ? pJson.providers : [];
      }

      setProvidersBySkill(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [router, requestedSkill]);

  useEffect(() => {
    loadFull();
  }, [loadFull]);

  const hasAnyMissingProviders = useMemo(() => {
    if (!full) return false;
    return full.recommendations.some((r) => (providersBySkill[r.skill_code] ?? []).length === 0);
  }, [full, providersBySkill]);

  async function submitLead() {
    setLeadLoading(true);
    setLeadSuccessMsg(null);
    setLeadErrorMsg(null);

    try {
      if (!fullName.trim() || phone.trim().length < 7) {
        setLeadErrorMsg("Please enter your full name and a valid phone number.");
        return;
      }

      const state = (lastAssessment?.state as string | undefined) ?? "";
      const city = (lastAssessment?.city as string | undefined) ?? "";
      const area = (lastAssessment?.area as string | undefined) ?? "";

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: lastAssessment?.session_id,
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
        const msg = isObj(json) && "message" in json ? String(json.message) : "Failed to submit.";
        throw new Error(msg);
      }

      // Clear form after success
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
      {/* Header */}
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
        {/* Alerts */}
        {loading && <div className="alert alert-info">Loading results...</div>}
        {error && <div className="alert alert-danger">Error: {error}</div>}

        {/* Lead capture */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-4">
            <div className="d-flex flex-wrap gap-2 mb-2">
              <span className="badge bg-primary">Follow-up</span>
              <span className="badge text-bg-light border">WhatsApp friendly</span>
              {hasAnyMissingProviders ? (
                <span className="badge text-bg-light border">48 hours response</span>
              ) : (
                <span className="badge text-bg-light border">Provider guidance</span>
              )}
            </div>

            <h2 className="h5 mb-2">
              {hasAnyMissingProviders
                ? "We don’t have a verified provider near you for at least one skill."
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
                <input
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Chinedu Okafor"
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Phone number</label>
                <input
                  className="form-control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 070..."
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">WhatsApp (optional)</label>
                <input
                  className="form-control"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="e.g. 070..."
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label">Which skill should we help you with?</label>
                <select
                  className="form-select"
                  value={requestedSkill}
                  onChange={(e) => setRequestedSkill(e.target.value)}
                >
                  {full?.recommendations.map((r) => (
                    <option key={r.skill_code} value={r.skill_code}>
                      {r.skill_name} ({r.skill_code})
                    </option>
                  ))}
                  {!full && <option value="">(loading...)</option>}
                </select>
              </div>

              <div className="col-12">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  className="form-control"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Budget, schedule, nearby landmarks, anything that will help us assist you..."
                />
              </div>
            </div>

            <button
              className="btn btn-primary w-100 mt-3 py-2"
              onClick={submitLead}
              disabled={leadLoading}
            >
              {leadLoading
                ? "Submitting..."
                : hasAnyMissingProviders
                ? "Request provider within 48 hours"
                : "Request follow-up"}
            </button>
          </div>
        </div>

        {/* Recommendations */}
        {full && (
          <div className="row g-3">
            {full.recommendations.map((r) => {
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
                            <span className="badge text-bg-light border">Score: {r.score}</span>
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

                      <hr className="my-3" />

                      <div>
                        <div className="fw-semibold mb-2">Nearest Providers</div>

                        {!hasProviders ? (
                          <div className="alert alert-light border mb-0">
                            No verified provider found yet for this skill in your area. Use the form above and we’ll
                            contact you within 48 hours.
                          </div>
                        ) : (
                          <div className="d-grid gap-2">
                            {providers.map((p) => (
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
                                  <span className="badge text-bg-light border">
                                    Mode: {p.mode_supported ?? "Hybrid"}
                                  </span>
                                  <span className="badge text-bg-light border">
                                    Physical: {p.physical_delivery_percent}%
                                  </span>
                                  {p.duration_weeks ? (
                                    <span className="badge text-bg-light border">Duration: {p.duration_weeks} weeks</span>
                                  ) : null}
                                  {p.course_fee_min_ngn && p.course_fee_max_ngn ? (
                                    <span className="badge text-bg-light border">
                                      Fee: ₦{p.course_fee_min_ngn.toLocaleString()}–₦
                                      {p.course_fee_max_ngn.toLocaleString()}
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
                                      href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`}
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

        <div className="text-center text-muted small mt-4">
          © {new Date().getFullYear()} Skill2Earn Padi
        </div>
      </div>
    </div>
  );
}
