"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function CallbackClient() {
  const params = useSearchParams();

  useEffect(() => {
    const status = params.get("status");
    const reference = params.get("reference");
    // TODO: call your verification endpoint / show UI
    console.log({ status, reference });
  }, [params]);

  return <div>Payment callback received. Finishing up…</div>;
}
