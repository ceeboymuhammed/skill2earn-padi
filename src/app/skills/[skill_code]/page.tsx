"use client";

import { notFound } from "next/navigation";
import { MVP_SKILLS } from "@/lib/skills";
import { useEffect, useMemo } from "react";

type PageProps = {
  params: {
    skill_code: string;
  };
};

export default function SkillPage({ params }: PageProps) {
  const skill = useMemo(() => {
    return MVP_SKILLS.find((item) => item.skill_code === params.skill_code) ?? null;
  }, [params.skill_code]);

  useEffect(() => {
    if (!skill) return;

    const sessionRaw = localStorage.getItem("s2e_last_assessment");
    if (!sessionRaw) return;

    try {
      const parsed = JSON.parse(sessionRaw) as { session_id?: string };
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: parsed.session_id ?? null,
          event_type: "view_skill_detail",
          skill_code: skill.skill_code,
        }),
      });
    } catch {
      // ignore
    }
  }, [skill]);

  if (!skill) return notFound();

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Skill
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-neutral-900">
          {skill.skill_name}
        </h1>
        <div className="mt-3 text-sm text-neutral-600">{skill.skill_code}</div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Category
            </div>
            <div className="mt-2 text-base text-neutral-900">
              {skill.category.replace(/_/g, " ")}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Delivery
            </div>
            <div className="mt-2 text-base text-neutral-900">
              {skill.online_possible ? "Online possible" : "In-person only"}
              {skill.physical_recommended ? " • Physical recommended" : null}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Tags
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
              >
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}