import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div>Processing payment...</div>}>
      <CallbackClient />
    </Suspense>
  );
}