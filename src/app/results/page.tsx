"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FullSkillReport = {
  skill_code: string;
  skill_name: string;
  match_score: number;
  logic_summary: string;
  strengths_alignment: string[];

  cost_of_entry: {
    tool_checklist: string[];
    startup_cost_breakdown: {
      training_fees_naira: number;
      tools_naira: number;
      data_power_naira: number;
      total_estimated_naira: number;
    };
    maintenance_needs: string[];
  };

  timeline: {
    time_to_junior_months: number;
    first_paycheck_months: number;
    prerequisites: string[];
  };

  market_insights: {
    demand_level: "Hot" | "Steady" | "Slow";
    income_potential_naira: {
      entry_level_monthly: string;
      professional_monthly: string;
    };
    top_industries: string[];
  };

  vibe_check: {
    day_in_the_life: string[];
    work_mode: "Remote" | "On-site" | "Hybrid";
    physical_demand: "Desk job" | "Field work" | "Mix";
  };

  next_steps: {
    steps: string[];
    training_centre_note: string;
  };
};

type ApiRespOk = {
  session_id: string;
  unlocked: boolean;
  cached?: boolean;
  model?: string | null;
  created_at?: string | null;
  recommendations: FullSkillReport[];
};

const SESSION_KEY = "s2e_session_id";

function naira(n: number) {
  return `₦${Number(n).toLocaleString()}`;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function getApiMessage(x: unknown): string | null {
  if (!isObj(x)) return null;
  return typeof x.message === "string" ? x.message : null;
}

type ViewState = {
  loading: boolean;
  error: string | null;
  data: ApiRespOk | null;
};

export default function ResultsPage() {
  const router = useRouter();

  const [state, setState] = useState<ViewState>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const session_id = localStorage.getItem(SESSION_KEY);

      if (!session_id) {
        // ✅ one state update (avoids the eslint warning)
        if (!cancelled) {
          setState({ loading: false, error: "No session found. Go back to preview and unlock first.", data: null });
        }
        return;
      }

      try {
        const r = await fetch("/api/results-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });

        const json: unknown = await r.json();

        if (!r.ok) {
          const msg = getApiMessage(json) ?? "Failed to load results";
          throw new Error(msg);
        }

        // basic shape check
        if (!isObj(json) || !Array.isArray((json as Record<string, unknown>).recommendations)) {
          throw new Error("Unexpected response from server.");
        }

        if (!cancelled) {
          setState({ loading: false, error: null, data: json as ApiRespOk });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (!cancelled) {
          setState({ loading: false, error: msg, data: null });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="container py-5" style={{ maxWidth: 960 }}>
        <div className="alert alert-info">Loading your full results…</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="container py-5" style={{ maxWidth: 960 }}>
        <div className="alert alert-danger">{state.error}</div>
        <button className="btn btn-outline-primary" onClick={() => router.push("/preview")}>
          Back to Preview
        </button>
      </div>
    );
  }

  const recs = (state.data?.recommendations ?? []).slice(0, 3);

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold text-primary">Skill2Earn Padi</div>
            <div className="text-muted small">Full Results</div>
          </div>
          <button className="btn btn-outline-primary" onClick={() => router.push("/preview")}>
            Back to Preview
          </button>
        </div>
      </div>

      <div className="container py-4" style={{ maxWidth: 960 }}>
        {recs.map((r) => (
          <div className="card shadow-sm border-0 mb-4" key={r.skill_code}>
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div>
                  <div className="text-muted small">Recommendation</div>
                  <h2 className="h4 mb-1">{r.skill_name}</h2>
                  <div className="text-muted small">Code: {r.skill_code}</div>
                </div>
                <span className="badge text-bg-primary">Match {r.match_score}%</span>
              </div>

              <hr />

              <h3 className="h6 mb-2">1) Why this fits you</h3>
              <div className="mb-2">{r.logic_summary}</div>
              <div className="fw-semibold small mb-1">Strengths alignment</div>
              <ul className="mb-3">
                {r.strengths_alignment.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>

              <h3 className="h6 mb-2">2) Financial & resource reality (Cost of entry)</h3>
              <div className="row g-3 mb-2">
                <div className="col-12 col-md-6">
                  <div className="fw-semibold small">Tool checklist</div>
                  <ul className="mb-0">
                    {r.cost_of_entry.tool_checklist.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div className="col-12 col-md-6">
                  <div className="fw-semibold small">Estimated startup cost</div>
                  <ul className="mb-0">
                    <li>Training: {naira(r.cost_of_entry.startup_cost_breakdown.training_fees_naira)}</li>
                    <li>Tools: {naira(r.cost_of_entry.startup_cost_breakdown.tools_naira)}</li>
                    <li>Data/Power: {naira(r.cost_of_entry.startup_cost_breakdown.data_power_naira)}</li>
                    <li className="fw-semibold">
                      Total: {naira(r.cost_of_entry.startup_cost_breakdown.total_estimated_naira)}
                    </li>
                  </ul>
                </div>
              </div>
              <div className="fw-semibold small">Maintenance needs</div>
              <ul className="mb-3">
                {r.cost_of_entry.maintenance_needs.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>

              <h3 className="h6 mb-2">3) Learning & earning roadmap (Timeline)</h3>
              <ul className="mb-2">
                <li>
                  Time to junior level: <b>{r.timeline.time_to_junior_months}</b> months
                </li>
                <li>
                  First paycheck milestone: <b>{r.timeline.first_paycheck_months}</b> months
                </li>
              </ul>
              <div className="fw-semibold small">Prerequisites</div>
              <ul className="mb-3">
                {r.timeline.prerequisites.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>

              <h3 className="h6 mb-2">4) Market insights (Profitability)</h3>
              <ul className="mb-2">
                <li>
                  Demand level: <b>{r.market_insights.demand_level}</b>
                </li>
                <li>Entry-level monthly: {r.market_insights.income_potential_naira.entry_level_monthly}</li>
                <li>Professional monthly: {r.market_insights.income_potential_naira.professional_monthly}</li>
              </ul>
              <div className="fw-semibold small">Top industries</div>
              <ul className="mb-3">
                {r.market_insights.top_industries.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>

              <h3 className="h6 mb-2">5) Daily life preview (Vibe check)</h3>
              <ul className="mb-2">
                {r.vibe_check.day_in_the_life.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <ul className="mb-3">
                <li>
                  Work mode: <b>{r.vibe_check.work_mode}</b>
                </li>
                <li>
                  Physical demand: <b>{r.vibe_check.physical_demand}</b>
                </li>
              </ul>

              <h3 className="h6 mb-2">6) Next steps</h3>
              <ul className="mb-2">
                {r.next_steps.steps.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <div className="alert alert-success mb-0">{r.next_steps.training_centre_note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
