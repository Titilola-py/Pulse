import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section className="page landing">
      <div className="landing-hero">
        <div className="landing-copy">
          <span className="landing-eyebrow">Real-time communication</span>
          <h1 className="landing-title">Real-time conversations that feel human.</h1>
          <p className="landing-subtitle">
            Pulse is a calm, fast workspace for teams who want to talk, decide, and
            move together without the noise.
          </p>
          <div className="landing-actions">
            <Link className="button" to="/register">
              Sign up
            </Link>
            <Link className="button button-secondary" to="/login">
              Sign in
            </Link>
          </div>
          <div className="landing-proof">
            <div className="proof-card">
              <span className="proof-label">Instant delivery</span>
              <span className="proof-value">{"< 1s"}</span>
            </div>
            <div className="proof-card">
              <span className="proof-label">Secure by design</span>
              <span className="proof-value">JWT</span>
            </div>
            <div className="proof-card">
              <span className="proof-label">Focused threads</span>
              <span className="proof-value">24/7</span>
            </div>
          </div>
        </div>

        <div className="landing-visual" aria-hidden="true">
          <div className="visual-frame">
            <div className="visual-card visual-card--primary">
              <div className="visual-top">
                <span className="visual-pill">Pulse Studio</span>
                <span className="visual-status">3 online</span>
              </div>
              <div className="visual-bubbles">
                <div className="visual-bubble visual-bubble--left">
                  Kickoff notes are live. Reviewing now.
                </div>
                <div className="visual-bubble visual-bubble--right">
                  Love it. Pushing the update in 5.
                </div>
                <div className="visual-bubble visual-bubble--left">
                  Perfect - I will share the link.
                </div>
              </div>
            </div>

            <div className="visual-card visual-card--secondary">
              <div className="preview-row">
                <span className="preview-avatar" />
                <div className="preview-text">
                  <span className="preview-title">Launch squad</span>
                  <span className="preview-subtitle">Ship checklist looks great.</span>
                </div>
              </div>
              <div className="preview-row">
                <span className="preview-avatar preview-avatar--accent" />
                <div className="preview-text">
                  <span className="preview-title">Ops</span>
                  <span className="preview-subtitle">Monitoring is all green.</span>
                </div>
              </div>
              <div className="preview-row">
                <span className="preview-avatar preview-avatar--warm" />
                <div className="preview-text">
                  <span className="preview-title">Design</span>
                  <span className="preview-subtitle">New visuals are approved.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="visual-glow" />
        </div>
      </div>
    </section>
  )
}


