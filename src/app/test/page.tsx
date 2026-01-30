"use client";

import { useEffect, useState } from "react";

type PreviewResponse = {
  session_id: string;
  unlocked: boolean;
  mode: "preview";
  recommendations: { skill_code: string; skill_name: string }[];
  message?: string;
};

type FullResponse = {
  session_id: string;
  unlocked: boolean;
  mode: "full";
  recommendations: { skill_code: string; skill_name: string; score: number; reasons: string[] }[];
};

export default function TestPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [full, setFull] = useState<FullResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // create/get session once
    (async () => {
      const existing = localStorage.getItem("s2e_session_id") || undefined;
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: existing }),
      });
      const data = await res.json();
      localStorage.setItem("s2e_session_id", data.session_id);
      setSessionId(data.session_id);
    })();
  }, []);

  const basePayload = () => ({
    session_id: sessionId,
    state: "FCT",
    city: "Abuja",
    area: "Garki Area 1",
    power: "low",
    internet: "fair",
    device: "smartphone_only",
    hoursPerWeek: "5-10",
    incomeUrgency: "1-3",
    learningStyle: "needs_accountability",
    schedulePredictability: "low",
    socialMediaHours: "5+",
    dropoutHistory: "dropped",
    difficultyResponse: "break_return",
  });

  async function getPreview() {
    setLoading(true);
    setError(null);
    setFull(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), mode: "preview" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Preview failed");
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function unlockFreeBeta() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, method: "free_beta" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Unlock failed");
      // refresh preview state
      await getPreview();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function getFull() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Full failed");
      setFull(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Skill2Earn Padi - Preview -&gt; Unlock -&gt; Full</h1>
      <p>Session: <code>{sessionId || "creating..."}</code></p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={getPreview} disabled={!sessionId || loading}>
          {loading ? "..." : "Get Preview"}
        </button>
        <button onClick={unlockFreeBeta} disabled={!sessionId || loading}>
          Unlock (Free Beta)
        </button>
        <button onClick={getFull} disabled={!sessionId || loading}>
          Get Full Results
        </button>
      </div>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {preview && (
        <>
          <h3>Preview</h3>
          <pre style={{ padding: 12, background: "#f6f6f6" }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        </>
      )}

      {full && (
        <>
          <h3>Full</h3>
          <pre style={{ padding: 12, background: "#f6f6f6" }}>
            {JSON.stringify(full, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
