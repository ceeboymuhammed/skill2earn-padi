"use client";

import { useEffect, useMemo, useState } from "react";

type DiscoveryRequest = {
  id: string;
  skill_code: string;
  state: string | null;
  city: string;
  area: string;
  status: string;
  created_at: string;
};

type DiscoveryListResponse =
  | { ok: true; requests: DiscoveryRequest[] }
  | { ok: false; error: string };

type CreateProspectPayload = {
  discovery_request_id: string;
  name: string;
  provider_type: "individual" | "school" | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  state: string | null;
  city: string;
  area: string;
  address: string | null;
  mode_supported: "Physical" | "Online" | null;
  source: string | null;
  source_url: string | null;
  evidence_urls: string[];
  notes: string | null;
};

type CreateProspectResponse =
  | { ok: true; prospect_id: string }
  | { ok: false; error: string };

function isErrorResponse(x: unknown): x is { ok: false; error: string } {
  return typeof x === "object" && x !== null && "ok" in x && (x as { ok: boolean }).ok === false;
}

export default function AdminDiscoveryPage() {
  const [adminKey, setAdminKey] = useState("");
  const [requests, setRequests] = useState<DiscoveryRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedReq, setSelectedReq] = useState<DiscoveryRequest | null>(null);

  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState<"individual" | "school" | "">("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [modeSupported, setModeSupported] = useState<"Physical" | "Online" | "">("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState("");
  const [notes, setNotes] = useState("");

  const canFetch = useMemo(() => adminKey.trim().length > 10, [adminKey]);

  async function fetchRequests(): Promise<void> {
    if (!canFetch) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/admin/discovery/requests", {
        headers: { "x-admin-key": adminKey.trim() },
      });

      const json: unknown = await res.json().catch(() => null);

      if (!res.ok || !json) {
        const msg =
          isErrorResponse(json) ? json.error : "Failed to load discovery requests";
        throw new Error(msg);
      }

      const data = json as DiscoveryListResponse;
      if (!data.ok) throw new Error(data.error);

      setRequests(data.requests);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

  async function submitProspect(): Promise<void> {
    if (!selectedReq) {
      setErr("Select a discovery request first.");
      return;
    }
    if (!name.trim()) {
      setErr("Provider name is required.");
      return;
    }

    const payload: CreateProspectPayload = {
      discovery_request_id: selectedReq.id,
      name: name.trim(),
      provider_type: providerType || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      state: selectedReq.state,
      city: selectedReq.city,
      area: selectedReq.area,
      address: address.trim() || null,
      mode_supported: modeSupported || null,
      source: "manual",
      source_url: sourceUrl.trim() || null,
      evidence_urls: evidenceUrls
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      notes: notes.trim() || null,
    };

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/admin/prospects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const json: unknown = await res.json().catch(() => null);

      if (!res.ok || !json) {
        const msg =
          isErrorResponse(json) ? json.error : "Failed to create prospect";
        throw new Error(msg);
      }

      const data = json as CreateProspectResponse;
      if (!data.ok) throw new Error(data.error);

      // Reset form
      setName("");
      setProviderType("");
      setPhone("");
      setWhatsapp("");
      setEmail("");
      setWebsite("");
      setAddress("");
      setModeSupported("");
      setSourceUrl("");
      setEvidenceUrls("");
      setNotes("");

      await fetchRequests();
      alert("Prospect saved.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create prospect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1>Discovery Requests (Admin)</h1>

      <div style={{ marginBottom: 12 }}>
        <label>Admin key</label>
        <input
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          style={{ width: "100%", padding: 8 }}
          placeholder="Enter ADMIN_API_KEY"
        />
        <button disabled={!canFetch || loading} onClick={() => void fetchRequests()} style={{ marginTop: 8 }}>
          {loading ? "Loading..." : "Load open requests"}
        </button>
      </div>

      {err && <div style={{ background: "#fee", padding: 12, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3>Open Requests</h3>
          {requests.length === 0 ? (
            <div>No open requests.</div>
          ) : (
            <ul>
              {requests.map((r) => (
                <li key={r.id} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => setSelectedReq(r)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 10,
                      border: selectedReq?.id === r.id ? "2px solid #333" : "1px solid #ccc",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <strong>{r.skill_code}</strong> — {r.area}, {r.city} {r.state ? `(${r.state})` : ""}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>status: {r.status}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Add Prospect</h3>
          {!selectedReq ? (
            <div>Select a request on the left.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                For: <strong>{selectedReq.skill_code}</strong> — {selectedReq.area}, {selectedReq.city}
              </div>

              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Provider name" />
              <select value={providerType} onChange={(e) => setProviderType(e.target.value as "individual" | "school" | "")}>
                <option value="">Provider type (optional)</option>
                <option value="school">Training school</option>
                <option value="individual">Individual tutor</option>
              </select>

              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="WhatsApp (optional)" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional)" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" />

              <select value={modeSupported} onChange={(e) => setModeSupported(e.target.value as "Physical" | "Online" | "")}>
                <option value="">Mode supported (optional)</option>
                <option value="Physical">Physical</option>
                <option value="Online">Online</option>
              </select>

              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" />

              <textarea
                value={evidenceUrls}
                onChange={(e) => setEvidenceUrls(e.target.value)}
                rows={4}
                placeholder="Evidence URLs (one per line)"
              />

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes (optional)" />

              <button disabled={loading || !canFetch} onClick={() => void submitProspect()}>
                {loading ? "Saving..." : "Save prospect"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
