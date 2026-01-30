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
  // location
  state: string;
  city: string;
  area: string;

  // Q1-4
  equipment_access: EquipmentAccess | "";
  computer_proficiency: number | ""; // only if laptop
  seed_capital: SeedCapitalBracket | "";
  utility_reliability: UtilityReliability | "";

  // Q5-7
  workspace_preference: WorkspacePreference | "";
  social_battery: SocialBattery | "";
  mobility: Mobility | "";

  // Q8-11
  problem_instinct: ProblemInstinct | "";
  math_logic_comfort: Comfort | "";
  patience_level: Comfort | "";
  learning_style: LearningStyle | "";

  // Q12-13
  income_urgency: IncomeUrgency | "";
  primary_interest: PrimaryInterest | "";
};

const LS_KEY = "s2e_assessment_draft_v1";

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

export default function AssessmentPage() {
  const router = useRouter();

  const [draft, setDraft] = useState<AssessmentDraft>(emptyDraft);
  const [step, setStep] = useState(0); // 0..N-1
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load draft from localStorage
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

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft]);

  const needsComputerProficiency = draft.equipment_access === "laptop_pc";

  // Build steps dynamically so progress stays correct if question 2 is skipped
  const steps = useMemo(() => {
    const base = [
      "Location",
      "Tools & Budget",
      "Utilities",
      "Work Style",
      "Brain & Temperament",
      "Goals",
    ];

    // Still same step titles; conditional question handled inside step 1
    return base;
  }, []);

  const totalSteps = steps.length;

  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  function update<K extends keyof AssessmentDraft>(key: K, value: AssessmentDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function canGoNext(): boolean {
    setError(null);

    // Step validation
    if (step === 0) {
      return draft.state.trim() !== "" && draft.city.trim() !== "";
    }

    if (step === 1) {
      if (!isNonEmpty(draft.equipment_access)) return false;
      if (needsComputerProficiency && (draft.computer_proficiency === "" || Number(draft.computer_proficiency) < 1))
        return false;
      return isNonEmpty(draft.seed_capital);
    }

    if (step === 2) {
      return isNonEmpty(draft.utility_reliability);
    }

    if (step === 3) {
      return isNonEmpty(draft.workspace_preference) && isNonEmpty(draft.social_battery) && isNonEmpty(draft.mobility);
    }

    if (step === 4) {
      return (
        isNonEmpty(draft.problem_instinct) &&
        isNonEmpty(draft.math_logic_comfort) &&
        isNonEmpty(draft.patience_level) &&
        isNonEmpty(draft.learning_style)
      );
    }

    if (step === 5) {
      return isNonEmpty(draft.income_urgency) && isNonEmpty(draft.primary_interest);
    }

    return true;
  }

  function next() {
    if (!canGoNext()) {
      setError("Please answer all required questions on this page.");
      return;
    }
    setStep((s) => Math.min(totalSteps - 1, s + 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    setError(null);
    if (!canGoNext()) {
      setError("Please answer all required questions before submitting.");
      return;
    }

    // Final validation (all steps)
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
      // Create a session id if you already do that elsewhere, keep it.
      // For now, make a simple client session id.
      const session_id =
        (localStorage.getItem("s2e_session_id") as string | null) ??
        `s2e_${Math.random().toString(36).slice(2)}_${Date.now()}`;

      localStorage.setItem("s2e_session_id", session_id);

      // Build payload for /api/recommend
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

      // Save the “last assessment” used by preview/results pages
      localStorage.setItem("s2e_last_assessment", JSON.stringify(payload));

      // Hit preview now so user gets immediate feedback
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "message" in json
            ? String((json as Record<string, unknown>).message)
            : "Failed to generate recommendations";
        throw new Error(msg);
      }

      // Store last preview response for preview page if needed
      localStorage.setItem("s2e_last_preview", JSON.stringify(json));

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
            <div className="text-muted small">Skill Fit Assessment</div>
          </div>
          <button
            className="btn btn-outline-primary"
            onClick={() => {
              localStorage.removeItem(LS_KEY);
              setDraft(emptyDraft);
              setStep(0);
              setError(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="container py-4" style={{ maxWidth: 860 }}>
        {/* Progress */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-semibold">
              Step {step + 1} of {totalSteps}: {steps[step]}
            </div>
            <div className="text-muted small">{progressPct}%</div>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <div className="progress-bar bg-primary" role="progressbar" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {/* Card */}
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            {/* STEP 0: Location */}
            {step === 0 && (
              <>
                <h2 className="h5 mb-3">Where are you located?</h2>

                <div className="row g-3">
                  <div className="col-12 col-md-4">
                    <label className="form-label">State *</label>
                    <input
                      className="form-control"
                      value={draft.state}
                      onChange={(e) => update("state", e.target.value)}
                      placeholder="e.g. FCT"
                    />
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label">City *</label>
                    <input
                      className="form-control"
                      value={draft.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="e.g. Abuja"
                    />
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label">Area (optional)</label>
                    <input
                      className="form-control"
                      value={draft.area}
                      onChange={(e) => update("area", e.target.value)}
                      placeholder="e.g. Garki Area 1"
                    />
                  </div>
                </div>

                <div className="text-muted small mt-3">
                  We use this to show you the nearest verified training options.
                </div>
              </>
            )}

            {/* STEP 1: Tools & Budget */}
            {step === 1 && (
              <>
                <h2 className="h5 mb-3">Your tools and budget</h2>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">1) Which of these tools do you currently own or have 24/7 access to? *</div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "none", label: "None (Manual tools only)" },
                      { v: "smartphone_only", label: "Smartphone only" },
                      { v: "laptop_pc", label: "Laptop or Desktop PC" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.equipment_access === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          update("equipment_access", o.v as EquipmentAccess);
                          // reset proficiency if they switch away from laptop
                          if (o.v !== "laptop_pc") update("computer_proficiency", "");
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {needsComputerProficiency && (
                  <div className="mb-4">
                    <div className="fw-semibold mb-2">
                      2) On a scale of 1–5, how comfortable are you with computer fundamentals? *
                      <div className="text-muted small">
                        Organizing files, keyboard shortcuts, and basic troubleshooting.
                      </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`btn ${draft.computer_proficiency === n ? "btn-primary" : "btn-outline-primary"}`}
                          onClick={() => update("computer_proficiency", n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    <div className="text-muted small mt-2">
                      If you score 1–2, we’ll recommend Computer Fundamentals first for digital skills.
                    </div>
                  </div>
                )}

                <div className="mb-2">
                  <div className="fw-semibold mb-2">3) How much total seed capital do you have for tools + training? *</div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "below_50", label: "Below ₦50,000" },
                      { v: "50_100", label: "₦50,000 – ₦100,000" },
                      { v: "100_200", label: "₦100,000 – ₦200,000" },
                      { v: "200_400", label: "₦200,000 – ₦400,000" },
                      { v: "above_400", label: "Above ₦400,000" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.seed_capital === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("seed_capital", o.v as SeedCapitalBracket)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* STEP 2: Utilities */}
            {step === 2 && (
              <>
                <h2 className="h5 mb-3">Your electricity & internet reality</h2>

                <div className="fw-semibold mb-2">
                  4) How reliable is the electricity and internet in your daily environment? *
                </div>

                <div className="d-grid gap-2">
                  {[
                    { v: "none", label: "No reliable access (Need 'Zero' or 'Low' dependency skills)" },
                    { v: "outages", label: "Frequent outages (Need offline/battery-friendly skills)" },
                    { v: "stable", label: "Always stable (Can handle high/critical dependency skills)" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      className={`btn text-start ${draft.utility_reliability === o.v ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => update("utility_reliability", o.v as UtilityReliability)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                <div className="text-muted small mt-3">
                  This is one of the biggest success factors in Nigeria — we’ll filter accordingly.
                </div>
              </>
            )}

            {/* STEP 3: Work style */}
            {step === 3 && (
              <>
                <h2 className="h5 mb-3">Your work style</h2>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    5) Do you prefer hands-on physical work or desk-based digital work? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "hands_on", label: "Hands-on / Physical" },
                      { v: "desk", label: "Desk-based / Digital" },
                      { v: "mix", label: "A mix of both" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${
                          draft.workspace_preference === o.v ? "btn-primary" : "btn-outline-primary"
                        }`}
                        onClick={() => update("workspace_preference", o.v as WorkspacePreference)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    6) Are you energized by people or prefer focusing alone? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "Introvert", label: "Mostly alone (Introvert)" },
                      { v: "Extrovert", label: "Mostly with people (Extrovert)" },
                      { v: "Mix", label: "A mix of both" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.social_battery === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("social_battery", o.v as SocialBattery)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-0">
                  <div className="fw-semibold mb-2">
                    7) Do you want remote work or can you travel to client sites? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "Remote", label: "Remote (Home-based)" },
                      { v: "On-site", label: "On-site (Travel required)" },
                      { v: "Hybrid", label: "Hybrid (Mix of both)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.mobility === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("mobility", o.v as Mobility)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* STEP 4: Brain & Temperament */}
            {step === 4 && (
              <>
                <h2 className="h5 mb-3">Your brain & temperament</h2>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    8) When you face a problem, what’s your first instinct? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "Creative", label: "Create something new or artistic (Creative)" },
                      { v: "Analytical", label: "Follow logic and figure out how it works (Analytical/Structural)" },
                      { v: "Adversarial", label: "Look for weaknesses and security gaps (Adversarial)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.problem_instinct === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("problem_instinct", o.v as ProblemInstinct)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    9) How do you feel about numbers, statistics, or strict logic rules? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "High", label: "I enjoy it (High)" },
                      { v: "Moderate", label: "I can manage if necessary (Moderate)" },
                      { v: "Low", label: "I prefer to avoid it (Low)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.math_logic_comfort === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("math_logic_comfort", o.v as Comfort)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    10) How do you feel about long trial-and-error learning? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "Low", label: "I need quick wins (Low patience)" },
                      { v: "Moderate", label: "I can handle some delay (Moderate)" },
                      { v: "High", label: "I enjoy the long deep process (High)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.patience_level === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("patience_level", o.v as Comfort)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-0">
                  <div className="fw-semibold mb-2">
                    11) Do you prefer a “master once” trade or continuous learning career? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "set_and_forget", label: "Master once (Set-and-Forget)" },
                      { v: "continuous", label: "Keep learning forever (Continuous Learning)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.learning_style === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("learning_style", o.v as LearningStyle)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* STEP 5: Goals */}
            {step === 5 && (
              <>
                <h2 className="h5 mb-3">Your goals & interests</h2>

                <div className="mb-4">
                  <div className="fw-semibold mb-2">
                    12) How soon do you realistically need to start earning? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "quick", label: "Within 1–3 months (Quick to earn)" },
                      { v: "long", label: "I can invest 6+ months (Build a bigger career)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.income_urgency === o.v ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => update("income_urgency", o.v as IncomeUrgency)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-0">
                  <div className="fw-semibold mb-2">
                    13) Which sounds most exciting to you? *
                  </div>

                  <div className="d-grid gap-2">
                    {[
                      { v: "Build", label: "Building/Manufacturing (Furniture, Home Automation, Programming)" },
                      { v: "Solve", label: "Solving/Discovering (Data Analytics, Research)" },
                      { v: "Protect", label: "Protecting/Securing (Cybersecurity, Networking, CCTV)" },
                      { v: "Create", label: "Creating/Designing (Fashion, Graphics, UI/UX, Acting)" },
                      { v: "Connect", label: "Connecting/Serving (Event Planning, Marketing, Sales)" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-start ${draft.primary_interest === o.v ? "btn-primary" : "btn-outline-primary"}`}
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

          {/* Footer controls */}
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
                <button className="btn btn-primary w-50" onClick={submit} disabled={loading}>
                  {loading ? "Submitting..." : "See Preview Results"}
                </button>
              )}
            </div>

            <div className="text-muted small mt-3">
              Tip: Answer honestly. We filter out skills that don’t match your tools, budget, and environment.
            </div>
          </div>
        </div>

        <div className="text-center text-muted small mt-4">
          © {new Date().getFullYear()} Skill2Earn Padi
        </div>
      </div>
    </div>
  );
}
