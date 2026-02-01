import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import nodemailer, { type Transporter } from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------- Types ----------------
type DeliveryStatus = "pending" | "sent" | "failed";

type RecommendationItem = {
  skill_code?: string;
  skill_name?: string;
  name?: string;
  score?: number;
  teaser?: string[];
  reasons?: string[];
};

type SubmissionRow = {
  id: string;
  session_id: string;

  full_name: string;
  email: string;
  phone: string;

  state: string;
  city: string;
  area: string | null;

  mode: string;
  unlocked: boolean;

  answers: Record<string, unknown>;
  preview: RecommendationItem[] | null;
  recommendations: RecommendationItem[] | null;

  email_status: DeliveryStatus;
  sms_status: DeliveryStatus;
  whatsapp_status: DeliveryStatus;

  email_sent_at: string | null;
  sms_sent_at: string | null;
  whatsapp_sent_at: string | null;

  // retry fields
  send_attempts: number;
  next_retry_at: string | null;
  last_send_attempt_at: string | null;
  last_send_error: string | null;

  created_at: string;
  updated_at: string;
};

// ---------------- Security ----------------
function requireAuth(req: Request): boolean {
  const key = req.headers.get("x-send-secret");
  return Boolean(key && key === process.env.SEND_RESULTS_SECRET);
}

// ---------------- Config ----------------
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const MAX_ATTEMPTS = 6;

// Cooldown schedule (minutes) by attempt number (1-based)
const COOLDOWN_MINUTES = [2, 5, 15, 60, 180, 720]; // 2m, 5m, 15m, 1h, 3h, 12h

function computeNextRetryAt(attemptsAfterFailure: number): string {
  const idx = Math.min(Math.max(attemptsAfterFailure, 1), COOLDOWN_MINUTES.length) - 1;
  const minutes = COOLDOWN_MINUTES[idx];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// ---------------- Helpers ----------------
function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizeTo234(phone: string) {
  const raw = normalizePhone(phone);

  if (raw.startsWith("+234")) return raw.slice(1); // "234..."
  if (raw.startsWith("234")) return raw;
  if (raw.startsWith("0")) return "234" + raw.slice(1);

  return raw.startsWith("+") ? raw.slice(1) : raw;
}

function isValidPhone(phone: string) {
  const p = normalizePhone(phone);
  const digits = p.startsWith("+") ? p.slice(1) : p;
  return /^\d{10,15}$/.test(digits);
}

function getBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function createMailer(): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_SMTP_USER!,
      pass: process.env.GMAIL_SMTP_APP_PASSWORD!,
    },
  });
}

// ---------------- Email Content ----------------
function buildEmailContent(sub: SubmissionRow) {
  const recs =
    sub.recommendations?.length
      ? sub.recommendations
      : sub.preview?.length
        ? sub.preview
        : [];

  const topSkills = recs.slice(0, 5);

  const listHtml = topSkills.length
    ? topSkills
        .map((r, i) => {
          const name = r.skill_name || r.name || r.skill_code || `Skill ${i + 1}`;
          const score = typeof r.score === "number" ? `Match Score: ${r.score}` : "";
          return `
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #eee;">
                <strong style="font-size:16px;">${escapeHtml(name)}</strong><br/>
                <span style="color:#555;font-size:13px;">${escapeHtml(score)}</span>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td>No recommendations available yet.</td></tr>`;

  const previewLink = `${getBaseUrl()}/preview?session=${encodeURIComponent(sub.session_id)}`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:30px 10px;">
    <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#0d6efd;color:white;padding:20px 24px;">
        <h2 style="margin:0;">Your Skill2Earn Padi Results 🎯</h2>
      </div>

      <div style="padding:24px;">
        <p>Hi <strong>${escapeHtml(sub.full_name)}</strong>,</p>
        <p>Based on your answers, these are the skill paths that best fit your tools, budget, and environment:</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
          ${listHtml}
        </table>

        <p style="margin-top:20px;">
          Want the full details? Click below to view your result page.
        </p>

        <div style="text-align:center;margin:30px 0;">
          <a href="${previewLink}"
             style="background:#0d6efd;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">
            View Results
          </a>
        </div>

        <p style="font-size:13px;color:#666;">
          Need help choosing the best one for your budget? Reply to this email and we’ll guide you.
        </p>
      </div>

      <div style="background:#f1f3f5;padding:16px 24px;font-size:12px;color:#666;text-align:center;">
        Skill2Earn Padi · Helping you earn with the right skills<br/>
        © ${new Date().getFullYear()}
      </div>
    </div>
  </div>
  `;

  const text = [
    `Hi ${sub.full_name},`,
    "",
    "Your Skill2Earn Padi results are ready:",
    "",
    ...topSkills.map((r, i) => {
      const name = r.skill_name || r.name || r.skill_code || `Skill ${i + 1}`;
      const score = typeof r.score === "number" ? ` (Match Score: ${r.score})` : "";
      return `${i + 1}. ${name}${score}`;
    }),
    "",
    `View your results: ${previewLink}`,
    "",
    "Reply if you need help choosing the best option.",
    "— Skill2Earn Padi",
  ].join("\n");

  return { html, text, previewLink };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------------- BulkSMSNigeria ----------------
async function sendSmsBulkNigeria(toPhone234: string, message: string) {
  const token = process.env.BULKSMSNIGERIA_API_TOKEN!;
  const from = process.env.BULKSMSNIGERIA_SENDER_ID!;
  const url = "https://www.bulksmsnigeria.com/api/v2/sms";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from,
      to: toPhone234,
      body: message,
    }),
  });

  const json: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    let msg = "BulkSMSNigeria send failed";
    if (json && typeof json === "object") {
      const o = json as Record<string, unknown>;
      if (typeof o.message === "string") msg = o.message;
      else if (typeof o.error === "string") msg = o.error;
    }
    throw new Error(msg);
  }

  return json;
}

// ---------------- Request Schema ----------------
const BodySchema = z
  .object({
    session_id: z.string().optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    send_email: z.boolean().optional().default(true),
    send_sms: z.boolean().optional().default(true),
    send_whatsapp: z.boolean().optional().default(false),
    force: z.boolean().optional().default(false), // admin override for retry window
  })
  .refine((v) => v.session_id || v.limit, { message: "Provide session_id OR limit" });

type SendBody = z.infer<typeof BodySchema>;

type SendResult = {
  session_id: string;
  email?: { attempted: boolean; ok: boolean };
  sms?: { attempted: boolean; ok: boolean };
  whatsapp?: { attempted: boolean; ok: boolean };
  attempts: number;
  next_retry_at: string | null;
  error?: string;
};

export async function POST(req: Request) {
  try {
    if (!requireAuth(req)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as unknown;
    const input: SendBody = BodySchema.parse(body);

    const nowIso = new Date().toISOString();

    // 1) Fetch submissions to process
    let rows: SubmissionRow[] = [];

    if (input.session_id) {
      const { data, error } = await supabase
        .from("assessment_submissions_v1")
        .select("*")
        .eq("session_id", input.session_id)
        .maybeSingle();

      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ message: "Submission not found" }, { status: 404 });

      rows = [data as SubmissionRow];
    } else {
      const limit = input.limit ?? DEFAULT_LIMIT;

      const base = supabase
        .from("assessment_submissions_v1")
        .select("*")
        .or("email_status.eq.pending,email_status.eq.failed,sms_status.eq.pending,sms_status.eq.failed")
        .lt("send_attempts", MAX_ATTEMPTS)
        .order("created_at", { ascending: true })
        .limit(limit);

      const { data, error } = input.force
        ? await base
        : await base.or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`);

      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      rows = (data as SubmissionRow[]) ?? [];
    }

    const mailer = input.send_email ? createMailer() : null;
    const results: SendResult[] = [];

    for (const sub of rows) {
      // session_id mode ignores retry window; batch mode respects it
      const attemptsAfterThisTry = (sub.send_attempts ?? 0) + 1;
      const attemptAt = new Date().toISOString();

      // record attempt
      await supabase
        .from("assessment_submissions_v1")
        .update({
          last_send_attempt_at: attemptAt,
          send_attempts: attemptsAfterThisTry,
        })
        .eq("id", sub.id);

      const { html, text } = buildEmailContent(sub);
      const smsText = text.length > 600 ? text.slice(0, 600) + "..." : text;

      let emailOk = false;
      let smsOk = false;
      let whatsappOk = false;

      try {
        // EMAIL
        if (input.send_email && sub.email_status !== "sent") {
          await mailer!.sendMail({
            from: `Skill2Earn Padi <${process.env.GMAIL_SMTP_USER!}>`,
            to: sub.email,
            subject: "Your Skill2Earn Padi Results",
            text,
            html,
          });

          emailOk = true;

          await supabase
            .from("assessment_submissions_v1")
            .update({
              email_status: "sent",
              email_sent_at: new Date().toISOString(),
              last_send_error: null,
            })
            .eq("id", sub.id);
        }

        // SMS
        if (input.send_sms && sub.sms_status !== "sent") {
          const to234 = normalizeTo234(sub.phone);
          if (!isValidPhone(to234)) throw new Error("Stored phone number is invalid");
          await sendSmsBulkNigeria(to234, smsText);

          smsOk = true;

          await supabase
            .from("assessment_submissions_v1")
            .update({
              sms_status: "sent",
              sms_sent_at: new Date().toISOString(),
              last_send_error: null,
            })
            .eq("id", sub.id);
        }

        // WhatsApp placeholder
        if (input.send_whatsapp && sub.whatsapp_status !== "sent") {
          whatsappOk = false; // implement provider later
        }

        // clear retry fields on success
        await supabase
          .from("assessment_submissions_v1")
          .update({
            next_retry_at: null,
            last_send_error: null,
          })
          .eq("id", sub.id);

        results.push({
          session_id: sub.session_id,
          email: { attempted: input.send_email, ok: emailOk },
          sms: { attempted: input.send_sms, ok: smsOk },
          whatsapp: { attempted: input.send_whatsapp, ok: whatsappOk },
          attempts: attemptsAfterThisTry,
          next_retry_at: null,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Send failed";
        const nextRetryAt = computeNextRetryAt(attemptsAfterThisTry);

        const patch: Partial<SubmissionRow> & {
          last_send_error: string;
          next_retry_at: string;
        } = {
          last_send_error: msg,
          next_retry_at: nextRetryAt,
        };

        if (input.send_email && sub.email_status !== "sent") patch.email_status = "failed";
        if (input.send_sms && sub.sms_status !== "sent") patch.sms_status = "failed";
        if (input.send_whatsapp && sub.whatsapp_status !== "sent") patch.whatsapp_status = "failed";

        await supabase.from("assessment_submissions_v1").update(patch).eq("id", sub.id);

        results.push({
          session_id: sub.session_id,
          attempts: attemptsAfterThisTry,
          next_retry_at: nextRetryAt,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      picked: rows.length,
      processed: results.length,
      limit_used: input.session_id ? 1 : input.limit ?? DEFAULT_LIMIT,
      results,
      defaults: { default_limit: DEFAULT_LIMIT, max_attempts: MAX_ATTEMPTS },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
