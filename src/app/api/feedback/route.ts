import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5),

  whatLiked: z.string().optional(),
  whatWrong: z.string().optional(),

  top_skill_code: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = Schema.parse(body);

    const { error } = await supabase.from("recommendation_feedback").insert({
      session_id: payload.session_id ?? null,
      rating: payload.rating,
      what_liked: payload.whatLiked?.trim() || null,
      what_wrong: payload.whatWrong?.trim() || null,

      top_skill_code: payload.top_skill_code ?? null,
      state: payload.state ?? null,
      city: payload.city ?? null,
      area: payload.area ?? null,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
