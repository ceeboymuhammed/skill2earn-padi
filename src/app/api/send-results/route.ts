import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import nodemailer, { type Transporter } from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type DeliveryStatus = "pending" | "sent" | "failed";

type RecommendationItem = {
  skill_code?: string;
  skill_name?: string;
  score?: number;
  teaser?: string[];
  reasons?: string[];
  badges?: string[];
  warnings?: string[];
};

type SubmissionRow = {
  id: string;
  session_id: string;
  email: string;
  email_status: DeliveryStatus;
  email_sent_at: string | null;
  send_attempts: number;
  created_at?: string;
};

const BodySchema = z.object({
  session_id: z.string().min(6),

  state: z.string().optional().default(""),
  city: z.string().optional().default(""),
  area: z.string().optional().default(""),

  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),

  commence: z.enum(["NOW", "WITHIN_3_MONTHS"]),
  wants_training_centre: z.boolean().default(false),

  location: z
    .object({
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      text: z.string().optional(),
    })
    .nullable()
    .optional(),

  preview_recommendations: z.array(
    z.object({
      skill_code: z.string(),
      skill_name: z.string(),
      score: z.number(),
      teaser: z.array(z.string()).default([]),
    })
  ),

  selected_recommendation: z.object({
    skill_code: z.string(),
    skill_name: z.string(),
    score: z.number(),
    reasons: z.array(z.string()).default([]),
    badges: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),

  answers:z.record(z.string(), z.any()),
});

function scoreToPct(score: number) {
  if (!Number.isFinite(score)) return 0;
  return score > 1 ? Math.round(score) : Math.round(score * 100);
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createMailer(): Transporter {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Missing email credentials. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function buildWarmEmailHtml(args: {
  full_name: string;
  selected: RecommendationItem;
  commence: "NOW" | "WITHIN_3_MONTHS";
  wants_training_centre: boolean;
  locationText: string;
}) {
  const { full_name, selected, commence, wants_training_centre, locationText } = args;

  const skillName = selected.skill_name || selected.skill_code || "Your Selected Skill";
  const pct = scoreToPct(selected.score ?? 0);

  const reasons = (selected.reasons ?? []).slice(0, 4);
  const badges = (selected.badges ?? []).slice(0, 6);
  const warnings = (selected.warnings ?? []).slice(0, 2);

  const commenceLine =
    commence === "NOW"
      ? "You said you want to start now. That’s the kind of energy we like 😄"
      : "You said you want to start within 3 months. That’s smart — we’ll make it simple and practical.";

  const jokeLine =
    pct >= 90
      ? "This match is so strong it almost started learning on your behalf. Almost 😄"
      : "Great match. Not perfect — but perfection is expensive anyway 😄";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:30px 10px;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.06);overflow:hidden;">
      <div style="padding:20px;background:#0b5ed7;color:#fff;">
        <div style="font-size:18px;font-weight:700;">Skill2Earn Result</div>
        <div style="opacity:.95;margin-top:6px;">Hi ${escapeHtml(full_name)} — here’s your selected skill.</div>
      </div>

      <div style="padding:22px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:6px;">${escapeHtml(skillName)}</div>
        <div style="color:#065f46;background:#d1fae5;display:inline-block;padding:6px 10px;border-radius:999px;font-size:13px;">
          Match: ${pct}%
        </div>

        <p style="margin:14px 0 0;color:#111827;line-height:1.5;">
          ${escapeHtml(jokeLine)}
        </p>

        <p style="margin:10px 0 0;color:#111827;line-height:1.5;">
          <strong>Quick note:</strong> ${escapeHtml(commenceLine)}
        </p>

        ${
          badges.length
            ? `<div style="margin:12px 0 0;">
                ${badges
                  .map(
                    (b) =>
                      `<span style="display:inline-block;margin:4px 6px 0 0;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#1d4ed8;font-size:12px;">${escapeHtml(
                        b
                      )}</span>`
                  )
                  .join("")}
              </div>`
            : ""
        }

        ${
          reasons.length
            ? `<div style="margin-top:16px;font-weight:700;">Why this fits you</div>
               <ul style="margin:8px 0 0;padding-left:18px;color:#111827;line-height:1.6;">
                 ${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
               </ul>`
            : ""
        }

        ${
          warnings.length
            ? `<div style="margin-top:14px;font-weight:700;color:#b91c1c;">Small things to watch out for</div>
               <ul style="margin:8px 0 0;padding-left:18px;color:#111827;line-height:1.6;">
                 ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
               </ul>`
            : ""
        }

        <div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <div style="font-weight:700;margin-bottom:6px;">Your next 3 steps</div>
          <ol style="margin:0;padding-left:18px;line-height:1.6;">
            <li>Learn 30–45 mins daily (consistency beats motivation).</li>
            <li>Start a tiny project this week — small enough to finish.</li>
            <li>Tell someone you trust you’re starting (accountability is free 😄).</li>
          </ol>
        </div>

        ${
          wants_training_centre
            ? `<div style="margin-top:14px;padding:12px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;">
                <strong>Training centre request:</strong> You asked us to connect you to the nearest training centre.
                <div style="margin-top:6px;color:#7c2d12;">Location: ${escapeHtml(locationText || "Not provided")}</div>
              </div>`
            : ""
        }

        <div style="margin-top:18px;color:#6b7280;font-size:12px;">
          You can retake the assessment anytime on the website.
        </div>
      </div>
    </div>
  </div>`;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // ✅ Idempotency: if already sent for same session_id + email, don’t send again.
    // This prevents spam when user refreshes / results page calls again.
    const { data: existing } = await supabase
      .from("assessment_submissions_v1")
      .select("id,session_id,email,email_status,email_sent_at,send_attempts,created_at")
      .eq("session_id", body.session_id)
      .eq("email", body.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubmissionRow>();

    // Save to DB if not exists
    let rowId = existing?.id ?? null;

    if (!existing) {
      const insertPayload = {
        session_id: body.session_id,

        full_name: body.full_name,
        email: body.email,
        phone: body.phone,

        state: body.state ?? "",
        city: body.city ?? "",
        area: body.area ? body.area : null,

        mode: "selected",
        unlocked: true,

        answers: {
          ...(body.answers ?? {}),
          commence: body.commence,
          wants_training_centre: body.wants_training_centre,
          location: body.location ?? null,
          selected_skill_code: body.selected_recommendation.skill_code,
        },

        preview: body.preview_recommendations ?? [],
        recommendations: [body.selected_recommendation],

        email_status: "pending" as DeliveryStatus,
        sms_status: "pending" as DeliveryStatus,
        whatsapp_status: "pending" as DeliveryStatus,

        email_sent_at: null,
        sms_sent_at: null,
        whatsapp_sent_at: null,

        send_attempts: 0,
        next_retry_at: null,
        last_send_attempt_at: null,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("assessment_submissions_v1")
        .insert(insertPayload)
        .select("id,session_id,email,email_status,email_sent_at,send_attempts,created_at")
        .single<SubmissionRow>();

      if (insErr) return NextResponse.json({ message: insErr.message }, { status: 500 });
      rowId = inserted.id;
    } else {
      // If exists, update with latest payload so database always has newest details from preview
      await supabase
        .from("assessment_submissions_v1")
        .update({
          full_name: body.full_name,
          phone: body.phone,
          state: body.state ?? "",
          city: body.city ?? "",
          area: body.area ? body.area : null,
          preview: body.preview_recommendations ?? [],
          recommendations: [body.selected_recommendation],
          answers: {
            ...(body.answers ?? {}),
            commence: body.commence,
            wants_training_centre: body.wants_training_centre,
            location: body.location ?? null,
            selected_skill_code: body.selected_recommendation.skill_code,
          },
        })
        .eq("id", existing.id);
      rowId = existing.id;
    }

    // If already sent, return success without resending
    if (existing?.email_status === "sent") {
      return NextResponse.json({
        ok: true,
        already_sent: true,
        message: "Email already sent",
        id: rowId,
      });
    }

    // Send email now
    const mailer = createMailer();

    const html = buildWarmEmailHtml({
      full_name: body.full_name,
      selected: body.selected_recommendation,
      commence: body.commence,
      wants_training_centre: body.wants_training_centre,
      locationText: body.location?.text ?? "",
    });

    try {
      await mailer.sendMail({
        from: process.env.GMAIL_SMTP_USER!,
        to: body.email,
        subject: `Your Skill2Earn Result: ${body.selected_recommendation.skill_name}`,
        html,
      });

      await supabase
        .from("assessment_submissions_v1")
        .update({
          email_status: "sent",
          email_sent_at: new Date().toISOString(),
          send_attempts: (existing?.send_attempts ?? 0) + 1,
          last_send_attempt_at: new Date().toISOString(),
        })
        .eq("id", rowId!);

      return NextResponse.json({
        ok: true,
        already_sent: false,
        message: "Sent successfully",
        id: rowId,
      });
    } catch (mailErr: unknown) {
      const msg = mailErr instanceof Error ? mailErr.message : "Email send failed";

      await supabase
        .from("assessment_submissions_v1")
        .update({
          email_status: "failed",
          send_attempts: (existing?.send_attempts ?? 0) + 1,
          last_send_attempt_at: new Date().toISOString(),
        })
        .eq("id", rowId!);

      return NextResponse.json({ message: msg }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
