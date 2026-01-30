"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PayCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  const message = useMemo(() => {
    const status = params.get("status") || params.get("payment_status") || "unknown";
    const tx =
      params.get("transaction_id") || params.get("transaction") || params.get("tx_ref") || "";

    const raw = localStorage.getItem("s2e_pay_intent");
    const intent = raw ? (JSON.parse(raw) as { session_id?: string }) : null;

    if (!intent?.session_id) {
      return "We could not find your session. Please go back and try again.";
    }

    localStorage.setItem(
      "s2e_payment_receipt",
      JSON.stringify({
        session_id: intent.session_id,
        status,
        tx,
        at: new Date().toISOString(),
      })
    );

    return "Payment recorded. If you used a coupon, unlock instantly on the Pay page. If you paid via payment link, we will unlock your account after confirmation.";
  }, [params]);

  return (
    <main className="container py-5" style={{ maxWidth: 720 }}>
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <h1 className="h4 mb-2">Payment Update</h1>
          <p className="text-muted">{message}</p>

          <div className="d-grid gap-2">
            <button className="btn btn-primary" onClick={() => router.push("/pay")}>
              Continue
            </button>
            <button className="btn btn-outline-secondary" onClick={() => router.push("/preview")}>
              Back to Preview
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
