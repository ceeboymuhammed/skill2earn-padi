import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-light min-vh-100">
      {/* Navbar */}
      <div className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "var(--s2e-purple)",
              }}
            />
            <div>
              <div className="fw-bold text-primary">Skill2Earn Padi</div>
              <div className="text-muted small">Own Your Skills from the closest trainers</div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <Link href="/assessment" className="btn btn-primary">
              Start
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="container py-4 py-md-5">
        <div className="row align-items-center g-4">
          <div className="col-12 col-lg-6">
            <div className="badge text-bg-light border mb-3">
              🇳🇬 Built for Nigeria realities (power, device, budget)
            </div>

            <h1 className="display-6 fw-bold lh-sm">
            Discover the one SKILL that matches your CURRENT reality and lifestyle.
            </h1>

            <p className="text-muted mt-3" style={{ fontSize: 16, lineHeight: 1.7 }}>
              People waste months choosing skills based on hype. Skill2Earn Padi recommends skills based on your
              <strong> location</strong>, <strong>power supply</strong>, <strong>device</strong>, <strong>budget</strong>, 
              <strong>time</strong>, and <strong>personality</strong> then show you training centres near you (with{" "}
              <strong>virtual or physical</strong> delivery).
            </p>

            <div className="d-grid gap-2 d-sm-flex mt-4">
              <Link href="/assessment" className="btn btn-primary btn-lg">
                Start Assessment
              </Link>
              <Link href="/preview" className="btn btn-outline-primary btn-lg">
                Continue (if started)
              </Link>
            </div>

            <div className="mt-3 text-muted small">
              Launch locations: <span className="fw-semibold">Abuja, Lagos, Kano, Portharcourt</span>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            {/* Simple mobile-friendly “illustration” card (no images needed) */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4 p-md-5">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="fw-bold">How it works</div>
                  <span className="badge bg-primary">3 steps</span>
                </div>

                <div className="mt-4 d-grid gap-3">
                  <div className="p-3 rounded-3" style={{ background: "#f7f4ff" }}>
                    <div className="fw-semibold">1) Quick assessment</div>
                    <div className="text-muted small mt-1">
                      Answer questions honestly about your resources, education/experience, distractions, and personality.
                    </div>
                  </div>

                  <div className="p-3 rounded-3" style={{ background: "#f7f4ff" }}>
                    <div className="fw-semibold">2) Preview top skills</div>
                    <div className="text-muted small mt-1">
                      You’ll see a preview first, then full results unlock after.
                    </div>
                  </div>

                  <div className="p-3 rounded-3" style={{ background: "#f7f4ff" }}>
                    <div className="fw-semibold">3) Full results + providers</div>
                    <div className="text-muted small mt-1">
                      See full details about the skill + reasons + nearest verified training options in your area.
                    </div>
                  </div>
                </div>

                <div className="alert alert-light border mt-4 mb-0">
                  <div className="fw-semibold">Why this is different</div>
                  <ul className="small text-muted mt-2 mb-0">
                    <li>Physical-first training (minimum 10% physical delivery)</li>
                    <li>Built for Nigeria constraints (power & devices)</li>
                    <li>Focus on completion + earning, not hype</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-muted small mt-3 text-center text-lg-start">
              This is a beta. Some areas may have limited verified providers for now.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-muted small mt-5">
          © {new Date().getFullYear()} Skill2Earn Padi
        </div>
      </div>
    </div>
  );
}
