"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SeedCapitalBracket = "below_50" | "50_100" | "100_200" | "200_400" | "above_400";
type UtilityReliability = "none" | "outages" | "stable";
type EquipmentAccess = "none" | "smartphone_only" | "laptop_pc";
type WorkspacePreference = "hands_on" | "desk" | "mix";
type SocialBattery = "Introvert" | "Extrovert" | "Mix";
type Mobility = "Remote" | "On-site" | "Hybrid";
type ProblemInstinct = "Creative" | "Analytical" | "Adversarial";
type Comfort = "Low" | "Moderate" | "High";
type LearningStyle = "set_and_forget" | "continuous";
type IncomeUrgency = "quick" | "long";
type PrimaryInterest = "Build" | "Solve" | "Protect" | "Create" | "Connect";

type AssessmentDraft = {
  state: string;
  city: string;
  area: string;

  equipment_access: EquipmentAccess | "";
  computer_proficiency: number | "";
  seed_capital: SeedCapitalBracket | "";
  utility_reliability: UtilityReliability | "";

  workspace_preference: WorkspacePreference | "";
  social_battery: SocialBattery | "";
  mobility: Mobility | "";

  problem_instinct: ProblemInstinct | "";
  math_logic_comfort: Comfort | "";
  patience_level: Comfort | "";
  learning_style: LearningStyle | "";

  income_urgency: IncomeUrgency | "";
  primary_interest: PrimaryInterest | "";
};

type RecommendPreviewResponse = {
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

const LS_KEY = "s2e_assessment_draft_v1";
const ASSESS_KEY = "s2e_last_assessment";
const PREVIEW_KEY = "s2e_last_preview";
const FULL_KEY = "s2e_last_full";
const SESSION_KEY = "s2e_session_id";

const emptyDraft: AssessmentDraft = {
  state: "",
  city: "",
  area: "",

  equipment_access: "",
  computer_proficiency: "",
  seed_capital: "",
  utility_reliability: "",

  workspace_preference: "",
  social_battery: "",
  mobility: "",

  problem_instinct: "",
  math_logic_comfort: "",
  patience_level: "",
  learning_style: "",

  income_urgency: "",
  primary_interest: "",
};

function isNonEmpty<T extends string>(v: T | ""): v is T {
  return v !== "";
}

function getApiErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

function makeSessionId(): string {
  // crypto.randomUUID is available in modern browsers; fallback just in case
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `s2e_${String(uuid).replace(/-/g, "")}_${Date.now()}`;
}

export default function AssessmentPage() {
  const router = useRouter();

  const [draft, setDraft] = useState<AssessmentDraft>(emptyDraft);
  const [step, setStep] = useState(0);

  // ✅ used in JSX (fixes unused warning)
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(() => {
    return ["Location", "Tools & Budget", "Utilities", "Work Style", "Brain & Temperament", "Goals"];
  }, []);

  const totalSteps = steps.length;
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  const needsComputerProficiency = useMemo(() => {
    // If user has no laptop/pc, computer proficiency becomes irrelevant
    return draft.equipment_access !== "" && draft.equipment_access !== "smartphone_only";
  }, [draft.equipment_access]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AssessmentDraft>;
      setDraft((d) => ({ ...d, ...parsed }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft]);

  // ✅ used in JSX (fixes unused warning)
  function update<K extends keyof AssessmentDraft>(key: K, value: AssessmentDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function canGoNext(): boolean {
    if (step === 0) return draft.state.trim() !== "" && draft.city.trim() !== "";

    if (step === 1) {
      if (!isNonEmpty(draft.equipment_access)) return false;
      if (needsComputerProficiency && (draft.computer_proficiency === "" || Number(draft.computer_proficiency) < 1))
        return false;
      return isNonEmpty(draft.seed_capital);
    }

    if (step === 2) return isNonEmpty(draft.utility_reliability);

    if (step === 3) return isNonEmpty(draft.workspace_preference) && isNonEmpty(draft.social_battery) && isNonEmpty(draft.mobility);

    if (step === 4) {
      return (
        isNonEmpty(draft.problem_instinct) &&
        isNonEmpty(draft.math_logic_comfort) &&
        isNonEmpty(draft.patience_level) &&
        isNonEmpty(draft.learning_style)
      );
    }

    if (step === 5) return isNonEmpty(draft.income_urgency) && isNonEmpty(draft.primary_interest);

    return true;
  }

  // ✅ used in JSX (fixes unused warning)
  function next() {
    setError(null);
    if (!canGoNext()) {
      setError("Please answer all required questions before continuing.");
      return;
    }
    setStep((s) => Math.min(totalSteps - 1, s + 1));
  }

  // ✅ used in JSX (fixes unused warning)
  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  // ✅ used in JSX (fixes unused warning)
  async function submit() {
    setError(null);
    if (!canGoNext()) {
      setError("Please answer all required questions before submitting.");
      return;
    }

    const finalOk =
      draft.state.trim() &&
      draft.city.trim() &&
      isNonEmpty(draft.equipment_access) &&
      (!needsComputerProficiency || draft.computer_proficiency !== "") &&
      isNonEmpty(draft.seed_capital) &&
      isNonEmpty(draft.utility_reliability) &&
      isNonEmpty(draft.workspace_preference) &&
      isNonEmpty(draft.social_battery) &&
      isNonEmpty(draft.mobility) &&
      isNonEmpty(draft.problem_instinct) &&
      isNonEmpty(draft.math_logic_comfort) &&
      isNonEmpty(draft.patience_level) &&
      isNonEmpty(draft.learning_style) &&
      isNonEmpty(draft.income_urgency) &&
      isNonEmpty(draft.primary_interest);

    if (!finalOk) {
      setError("Some required answers are missing.");
      return;
    }

    setLoading(true);

    try {
      // Always start a fresh session for a new submission
      const session_id = makeSessionId();
      localStorage.setItem(SESSION_KEY, session_id);

      // Reset cached results for a fresh run
      localStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(FULL_KEY);

      const payload = {
        session_id,

        state: draft.state.trim(),
        city: draft.city.trim(),
        area: draft.area.trim() || undefined,

        equipment_access: draft.equipment_access,
        computer_proficiency: needsComputerProficiency ? Number(draft.computer_proficiency) : undefined,

        seed_capital: draft.seed_capital,
        utility_reliability: draft.utility_reliability,

        workspace_preference: draft.workspace_preference,
        social_battery: draft.social_battery,
        mobility: draft.mobility,

        problem_instinct: draft.problem_instinct,
        math_logic_comfort: draft.math_logic_comfort,
        patience_level: draft.patience_level,
        learning_style: draft.learning_style,

        income_urgency: draft.income_urgency,
        primary_interest: draft.primary_interest,

        mode: "preview" as const,
      };

      localStorage.setItem(ASSESS_KEY, JSON.stringify(payload));

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Failed to generate recommendations";
        throw new Error(msg);
      }

      const response = json as RecommendPreviewResponse;

      // Keep server session if it responds with one
      if (response?.session_id) localStorage.setItem(SESSION_KEY, response.session_id);

      localStorage.setItem(PREVIEW_KEY, JSON.stringify(json));

      // IMPORTANT: always go to preview after assessment
      router.push("/preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold text-primary">Skill2Earn Padi</div>
            <div className="text-muted small">Answer a few questions and get 3 best skill matches.</div>
          </div>
          <div className="text-muted small">
            Step {step + 1} of {totalSteps}
          </div>
        </div>
      </div>

      <div className="container py-4">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="fw-semibold">{steps[step]}</div>
              <div className="text-muted small">{progressPct}%</div>
            </div>

            <div className="progress mb-4" style={{ height: 8 }}>
              <div className="progress-bar" role="progressbar" style={{ width: `${progressPct}%` }} />
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {/* ✅ STEP 0 */}
            {step === 0 && (
              <>
                <h2 className="h5 mb-3">Where are you located?</h2>

                <div className="row g-3">
                  <div className="col-12 col-md-4">
                    <label className="form-label">State *</label>
                    <input className="form-control" value={draft.state} onChange={(e) => update("state", e.target.value)} />
                  </div>
                  <div className="col-12 col-md-4">
                    <label className="form-label">City *</label>
                    <input className="form-control" value={draft.city} onChange={(e) => update("city", e.target.value)} />
                  </div>
                  <div className="col-12 col-md-4">
                    <label className="form-label">Area (optional)</label>
                    <input className="form-control" value={draft.area} onChange={(e) => update("area", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* ✅ STEP 1 */}
            {step === 1 && (
              <>
                <h2 className="h5 mb-3">Tools & Budget</h2>

                <div className="mb-3">
                  <label className="form-label">What device do you have access to? *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "none", label: "None" },
                      { v: "smartphone_only", label: "Smartphone only" },
                      { v: "laptop_pc", label: "Laptop/PC" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.equipment_access === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("equipment_access", o.v as EquipmentAccess)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {needsComputerProficiency && (
                  <div className="mb-3">
                    <label className="form-label">How comfortable are you using a computer? (1–10) *</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="form-control"
                      value={draft.computer_proficiency}
                      onChange={(e) => update("computer_proficiency", e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">How much seed capital can you start with? *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "below_50", label: "Below ₦50k" },
                      { v: "50_100", label: "₦50k – ₦100k" },
                      { v: "100_200", label: "₦100k – ₦200k" },
                      { v: "200_400", label: "₦200k – ₦400k" },
                      { v: "above_400", label: "Above ₦400k" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.seed_capital === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("seed_capital", o.v as SeedCapitalBracket)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ✅ STEP 2 */}
            {step === 2 && (
              <>
                <h2 className="h5 mb-3">Utilities</h2>

                <div className="mb-3">
                  <label className="form-label">How reliable is electricity/internet for you? *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "none", label: "Not reliable" },
                      { v: "outages", label: "Sometimes outages" },
                      { v: "stable", label: "Mostly stable" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.utility_reliability === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("utility_reliability", o.v as UtilityReliability)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ✅ STEP 3 */}
            {step === 3 && (
              <>
                <h2 className="h5 mb-3">Work Style</h2>

                <div className="mb-3">
                  <label className="form-label">Preferred work type *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "hands_on", label: "Hands-on" },
                      { v: "desk", label: "Desk/Computer" },
                      { v: "mix", label: "Mix" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.workspace_preference === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("workspace_preference", o.v as WorkspacePreference)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Social battery *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Introvert", label: "Introvert" },
                      { v: "Mix", label: "Mix" },
                      { v: "Extrovert", label: "Extrovert" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.social_battery === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("social_battery", o.v as SocialBattery)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Work location preference *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Remote", label: "Remote" },
                      { v: "Hybrid", label: "Hybrid" },
                      { v: "On-site", label: "On-site" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.mobility === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("mobility", o.v as Mobility)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ✅ STEP 4 */}
            {step === 4 && (
              <>
                <h2 className="h5 mb-3">Brain & Temperament</h2>

                <div className="mb-3">
                  <label className="form-label">How do you like to solve problems? *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Creative", label: "Creative" },
                      { v: "Analytical", label: "Analytical" },
                      { v: "Adversarial", label: "Adversarial" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.problem_instinct === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("problem_instinct", o.v as ProblemInstinct)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Comfort with math/logic *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Low", label: "Low" },
                      { v: "Moderate", label: "Moderate" },
                      { v: "High", label: "High" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.math_logic_comfort === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("math_logic_comfort", o.v as Comfort)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Patience level *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Low", label: "Low" },
                      { v: "Moderate", label: "Moderate" },
                      { v: "High", label: "High" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.patience_level === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("patience_level", o.v as Comfort)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Learning style *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "set_and_forget", label: "Set-and-forget" },
                      { v: "continuous", label: "Continuous learning" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.learning_style === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("learning_style", o.v as LearningStyle)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ✅ STEP 5 */}
            {step === 5 && (
              <>
                <h2 className="h5 mb-3">Goals</h2>

                <div className="mb-3">
                  <label className="form-label">Income urgency *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "quick", label: "Quick income" },
                      { v: "long", label: "Long-term income" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.income_urgency === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("income_urgency", o.v as IncomeUrgency)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Primary interest *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {[
                      { v: "Build", label: "Build" },
                      { v: "Solve", label: "Solve" },
                      { v: "Protect", label: "Protect" },
                      { v: "Create", label: "Create" },
                      { v: "Connect", label: "Connect" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn ${draft.primary_interest === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("primary_interest", o.v as PrimaryInterest)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card-footer bg-white border-0 pt-0 pb-4 px-4">
            <div className="d-flex gap-2">
              <button className="btn btn-outline-primary w-50" onClick={back} disabled={step === 0 || loading}>
                Back
              </button>

              {step < totalSteps - 1 ? (
                <button className="btn btn-primary w-50" onClick={next} disabled={loading}>
                  Next
                </button>
              ) : (
                <button className="btn btn-success w-50" onClick={submit} disabled={loading}>
                  {loading ? "Generating..." : "See My 3 Skill Matches"}
                </button>
              )}
            </div>

            <div className="text-muted small mt-3">
              You’ll pick 1 skill on the next page, then we’ll ask where to send your full result.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
