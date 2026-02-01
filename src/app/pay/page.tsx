"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type VerifyResp =
  | { ok: true; message: string; coupon: { code: string; description?: string } }
  | { ok: false; message: string };

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

function getApiErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

export default function PayPage() {
  const router = useRouter();

  const PRICE_NGN = 1999;
  const ORIGINAL_NGN = 7500;

  const [sessionId, setSessionId] = useState("");
  const [coupon, setCoupon] = useState("");
  const couponUpper = useMemo(() => coupon.trim().toUpperCase(), [coupon]);

  const [verify, setVerify] = useState<VerifyResp | null>(null);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingUnlock, setLoadingUnlock] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const paymentLink = process.env.NEXT_PUBLIC_FLW_PAYMENT_LINK || "";

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_KEY);
    const a = safeParse<{ session_id?: string }>(localStorage.getItem(ASSESS_KEY));
    const sid = storedSession || a?.session_id || "";

    if (sid) {
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, sid);
    }
  }, []);

  async function verifyCoupon() {
    setError(null);
    setOkMsg(null);
    setVerify(null);

    if (!couponUpper) return setError("Enter a coupon code first.");

    setLoadingVerify(true);
    try {
      const res = await fetch("/api/coupon/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponUpper }),
      });

      const json = (await res.json()) as VerifyResp;
      setVerify(json);

      if (json.ok) setOkMsg(`${json.coupon.code} verified. You can unlock now.`);
      else setError(json.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setLoadingVerify(false);
    }
  }

  async function unlockWithCoupon() {
    setError(null);
    setOkMsg(null);

    if (!sessionId) return setError("Missing session. Please retake the assessment.");
    if (!couponUpper) return setError("Coupon code is required.");

    setLoadingUnlock(true);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, coupon_code: couponUpper, free_unlock: false }),
      });

      const json = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = getApiErrorMessage(json) ?? "Unlock failed";
        throw new Error(msg);
      }

      // expect { ok: true }
     const ok = typeof json === "object" && json !== null && Boolean((json as Record<string, unknown>).ok);

      if (!ok) {
        const msg = getApiErrorMessage(json) ?? "Unlock failed";
        throw new Error(msg);
      }

      setOkMsg("Unlocked successfully! Loading your full results...");

      // ✅ best flow: go to preview, let it fetch full, store s2e_last_full, then route to /results
      router.push("/preview?paid=1");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setLoadingUnlock(false);
    }
  }

  function openPaymentLink() {
    setError(null);
    setOkMsg(null);

    if (!paymentLink) {
      setError("Payment link is not configured. Set NEXT_PUBLIC_FLW_PAYMENT_LINK in .env.local");
      return;
    }

    const url = new URL(paymentLink);
    if (sessionId) url.searchParams.set("s2e_session_id", sessionId);

    window.location.href = url.toString();
  }

  return (
    <div className="bg-light min-vh-100">
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold text-primary">Skill2Earn Padi</div>
            <div className="text-muted small">Unlock Full Results</div>
          </div>
          <button className="btn btn-outline-primary" onClick={() => router.push("/preview")}>
            Back to Preview
          </button>
        </div>
      </div>

      <div className="container py-4" style={{ maxWidth: 860 }}>
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            <div className="row g-4 align-items-center">
              <div className="col-12 col-lg-7">
                <h1 className="h4 mb-2">Unlock Full Results</h1>
                <p className="text-muted mb-0">
                  Full Results includes nearest training centres, full address, WhatsApp/phone, and your detailed skill-fit breakdown.
                </p>
              </div>

              <div className="col-12 col-lg-5">
                <div className="p-3 rounded bg-primary bg-opacity-10 border border-primary border-opacity-25">
                  <div className="fw-semibold">Promo Price</div>
                  <div className="d-flex align-items-end gap-2">
                    <div className="fs-3 fw-bold text-primary">₦{PRICE_NGN.toLocaleString()}</div>
                    <div className="text-muted text-decoration-line-through">₦{ORIGINAL_NGN.toLocaleString()}</div>
                  </div>
                  <div className="text-muted small">Early launch discount (limited time)</div>
                </div>
              </div>
            </div>

            <hr className="my-4" />

            {error && <div className="alert alert-danger">{error}</div>}
            {okMsg && <div className="alert alert-success">{okMsg}</div>}

            {/* Coupon section */}
            <div className="p-3 rounded border mb-3 bg-white">
              <div className="fw-semibold mb-1">Have a tester coupon?</div>
              <div className="text-muted small mb-2">
                Coupons unlock full access instantly (for promos & early testers).
              </div>

              <div className="row g-2 align-items-center">
                <div className="col-12 col-md-7">
                  <input
                    className="form-control"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="e.g. TESTA1B2C3D4"
                  />
                </div>

                <div className="col-12 col-md-5 d-grid d-md-flex gap-2">
                  <button
                    className="btn btn-outline-primary"
                    onClick={verifyCoupon}
                    disabled={loadingVerify || !couponUpper}
                  >
                    {loadingVerify ? "Verifying..." : "Verify Coupon"}
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={unlockWithCoupon}
                    disabled={loadingUnlock || !couponUpper || !sessionId}
                  >
                    {loadingUnlock ? "Unlocking..." : "Unlock with Coupon"}
                  </button>
                </div>
              </div>

              {verify?.ok && (
                <div className="mt-2 small text-muted">
                  <strong>{verify.coupon.code}:</strong> {verify.coupon.description || "Coupon validated."}
                </div>
              )}
            </div>

            {/* Payment link section */}
            <div className="p-3 rounded border bg-white">
              <div className="fw-semibold mb-1">No coupon?</div>
              <div className="text-muted small mb-3">
                You can still pay via our payment page. After payment, we will unlock your full results manually (early launch).
              </div>

              <button className="btn btn-primary w-100 btn-lg" onClick={openPaymentLink}>
                Pay with Flutterwave (Payment Link)
              </button>

              <div className="d-grid gap-2 mt-3">
                {/* Optional helper for manual unlock */}
                <button className="btn btn-outline-primary" onClick={() => router.push("/preview?paid=1")}>
                  I already paid — check unlock
                </button>
              </div>

              <div className="text-muted small mt-2">
                Session: <code>{sessionId || "not found"}</code>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-muted small mt-4">© {new Date().getFullYear()} Skill2Earn Padi</div>
      </div>
    </div>
  );
}
