"use client";

import { useMemo, useState } from "react";

type ProviderType = "individual" | "school";
type ModeSupported = "Physical" | "Online";

type SkillOption = { skill_code: string; name: string };

export default function ProviderApplyPage() {
  // Replace this with a real fetch from your skills table later.
  const skillOptions: SkillOption[] = useMemo(
    () => [
      { skill_code: "COMPUTER_BASIC", name: "Computer Basics" },
      { skill_code: "WEB_DEV", name: "Web Development" },
      { skill_code: "DIGITAL_MARKETING", name: "Digital Marketing" },
    ],
    []
  );

  const [providerType, setProviderType] = useState<ProviderType>("school");
  const [modeSupported, setModeSupported] = useState<ModeSupported>("Physical");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState("FCT");
  const [city, setCity] = useState("Abuja");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [scheduleOptions, setScheduleOptions] = useState<string>(""); // comma separated
  const [paymentPlan, setPaymentPlan] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  function toggleSkill(skill_code: string): void {
    setSelectedSkills((prev) => {
      if (prev.includes(skill_code)) return prev.filter((s) => s !== skill_code);
      return [...prev, skill_code];
    });
  }

  async function onSubmit(): Promise<void> {
    setResultMsg(null);

    if (!name.trim() || !phone.trim() || !state.trim() || !city.trim() || !area.trim()) {
      setResultMsg("Please fill name, phone, state, city and area.");
      return;
    }
    if (selectedSkills.length === 0) {
      setResultMsg("Please select at least one skill you teach.");
      return;
    }

    const scheduleArr =
      scheduleOptions
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    setSubmitting(true);
    try {
      const res = await fetch("/api/providers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_type: providerType,
          name,
          phone,
          whatsapp: whatsapp || null,
          email: email || null,
          website: website || null,
          country: "Nigeria",
          state,
          city,
          area,
          address: address || null,
          mode_supported: modeSupported,
          schedule_options: scheduleArr,
          payment_plan_available: paymentPlan,
          notes: notes || null,
          skill_codes: selectedSkills,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const err = data as { ok?: boolean; error?: string };
        setResultMsg(err.error ?? "Failed to submit application.");
        return;
      }

      const okData = data as { ok: true; provider_id: string };
      setResultMsg(`Submitted! Provider ID: ${okData.provider_id}. We will contact you shortly.`);
      // optional: reset form
    } catch {
      setResultMsg("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Training Provider Application</h1>

      <label>Provider Type</label>
      <select value={providerType} onChange={(e) => setProviderType(e.target.value as ProviderType)}>
        <option value="school">Training School</option>
        <option value="individual">Individual Tutor</option>
      </select>

      <label>Mode Supported</label>
      <select value={modeSupported} onChange={(e) => setModeSupported(e.target.value as ModeSupported)}>
        <option value="Physical">Physical</option>
        <option value="Online">Online</option>
      </select>

      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />

      <label>Phone</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} />

      <label>WhatsApp</label>
      <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />

      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Website</label>
      <input value={website} onChange={(e) => setWebsite(e.target.value)} />

      <h3>Location</h3>
      <label>State</label>
      <input value={state} onChange={(e) => setState(e.target.value)} />
      <label>City</label>
      <input value={city} onChange={(e) => setCity(e.target.value)} />
      <label>Area</label>
      <input value={area} onChange={(e) => setArea(e.target.value)} />
      <label>Address</label>
      <input value={address} onChange={(e) => setAddress(e.target.value)} />

      <h3>Skills you teach</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {skillOptions.map((s) => (
          <label key={s.skill_code} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={selectedSkills.includes(s.skill_code)}
              onChange={() => toggleSkill(s.skill_code)}
            />
            {s.name} ({s.skill_code})
          </label>
        ))}
      </div>

      <label>Schedule options (comma separated)</label>
      <input
        value={scheduleOptions}
        onChange={(e) => setScheduleOptions(e.target.value)}
        placeholder="weekdays, weekends"
      />

      <label>
        <input type="checkbox" checked={paymentPlan} onChange={(e) => setPaymentPlan(e.target.checked)} />
        Payment plan available
      </label>

      <label>Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />

      <button disabled={submitting} onClick={() => void onSubmit()}>
        {submitting ? "Submitting..." : "Submit Application"}
      </button>

      {resultMsg && <p style={{ marginTop: 12 }}>{resultMsg}</p>}
    </div>
  );
}
