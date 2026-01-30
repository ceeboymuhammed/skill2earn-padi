import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Schema = z.object({
  session_id: z.string().optional(),
  full_name: z.string().min(2),
  phone: z.string().min(7),
  whatsapp: z.string().optional(),
  state: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),
  requested_skill_code: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { message: "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    const body = Schema.parse(await req.json());

    const { error } = await supabase.from("leads").insert({
      session_id: body.session_id ?? null,
      full_name: body.full_name,
      phone: body.phone,
      whatsapp: body.whatsapp ?? null,
      state: body.state,
      city: body.city,
      area: body.area ?? null,
      requested_skill_code: body.requested_skill_code ?? null,
      notes: body.notes ?? null,
      status: "new",
    });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
