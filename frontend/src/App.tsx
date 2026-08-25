import React, { useState, useEffect } from 'react';
import './styles/landing.css';

interface StatItemProps {
  glyph: string;
  target: number;
  suffix: string;
  decimals: number;
  label: string;
  delayMs: number;
  durationMs: number;
  styleDelay: string;
}

const StatCounter: React.FC<StatItemProps> = ({
  glyph,
  target,
  suffix,
  decimals,
  label,
  delayMs,
  durationMs,
  styleDelay,
}) => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    let startTime: number | null = null;

    const timer = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / durationMs, 1);
        // easeOutCubic easing
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = easeOut * target;
        setValue(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setValue(target);
        }
      };

      animationFrameId = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [target, durationMs, delayMs]);

  const formattedValue =
    decimals > 0
      ? value.toFixed(decimals)
      : Math.floor(value).toLocaleString();

  return (
    <div className="stat-item anim" style={{ ['--d' as string]: styleDelay }}>
      <div className="stat-top">
        <span className="stat-glyph">{glyph}</span>
        <span className="stat-value">
          {formattedValue}
          {suffix}
        </span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
};

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<'Terminal' | 'Swarm Cockpit' | 'Strategy Studio' | 'Docs'>('Terminal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on window resize > 720px or Escape key
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 720 && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    if (mobileMenuOpen) {
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('menu-open');
    };
  }, [mobileMenuOpen]);

  const navItems: Array<'Terminal' | 'Swarm Cockpit' | 'Strategy Studio' | 'Docs'> = [
    'Terminal',
    'Swarm Cockpit',
    'Strategy Studio',
    'Docs',
  ];

  return (
    <div className="page-wrapper">
      {/* Full-bleed cover video behind all UI */}
      <div className="bg">
        <video className="bg-video" autoPlay muted loop playsInline>
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
            type="video/mp4"
          />
        </video>
        <div className="bg-overlay"></div>
      </div>

      {/* 3-Region Single Viewport Layout */}
      <div className="page">
        {/* 1) HEADER */}
        <header className="header">
          {/* Logo Button */}
          <a href="#" className="logo-btn" aria-label="DreamPulse Terminal">
            <img
              src="/assets/logo.webp"
              alt="DreamPulse Logo"
              width="52"
              height="52"
              className="logo-img"
            />
          </a>

          {/* Desktop Nav Pill */}
          <nav className="nav-pill" aria-label="Main Navigation">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                className={`nav-link ${activeNav === item ? 'active' : ''}`}
                onClick={() => setActiveNav(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          {/* Desktop Launch Terminal */}
          <a href="#terminal" className="sign-in-btn">
            Launch Terminal
          </a>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className={`burger-btn ${mobileMenuOpen ? 'open' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <span className="burger-bar"></span>
            <span className="burger-bar"></span>
            <span className="burger-bar"></span>
          </button>
        </header>

        {/* Mobile Menu Overlay & Sheet */}
        <div
          className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        ></div>

        <div
          className={`mobile-sheet ${mobileMenuOpen ? 'active' : ''}`}
          aria-hidden={!mobileMenuOpen}
        >
          {navItems.map((item, idx) => (
            <button
              key={item}
              type="button"
              className={`mobile-link ${activeNav === item ? 'active' : ''}`}
              style={{ animationDelay: `${0.05 + idx * 0.05}s` }}
              onClick={() => {
                setActiveNav(item);
                setMobileMenuOpen(false);
              }}
            >
              {item}
            </button>
          ))}
          <a
            href="#terminal"
            className="sign-in-btn"
            onClick={() => setMobileMenuOpen(false)}
          >
            Launch Terminal
          </a>
        </div>

        {/* 2) HERO (CENTER) */}
        <main className="hero">
          {/* Trust Row */}
          <div className="trust-row anim" style={{ ['--d' as string]: '0.05s' }}>
            <div className="avatar-stack">
              <div className="avatar-ring" title="Somnia Layer 1 Network">
                <div className="avatar-inner">
                  <i className="fa-solid fa-cube" aria-hidden="true"></i>
                </div>
              </div>
              <div className="avatar-ring" title="DreamDEX Event Contracts CLOB">
                <div className="avatar-inner">
                  <i className="fa-solid fa-bolt" aria-hidden="true"></i>
                </div>
              </div>
              <div className="avatar-ring" title="Quantitative AI Engine">
                <div className="avatar-inner">
                  <i className="fa-solid fa-brain" aria-hidden="true"></i>
                </div>
              </div>
            </div>
            <div className="trust-pill">
              <span className="trust-text">Built for DreamDEX on Somnia L1</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="headline">
            <span className="headline-line">Autonomous Swarm</span>
            <span className="headline-line">Engineered For Somnia</span>
          </h1>

          {/* Subhead */}
          <p className="subhead anim" style={{ ['--d' as string]: '0.28s' }}>
            Autonomous quantitative multi-agent swarm, real-time Φ(z) edge radar,
            and non-custodial copy-vault engineered for DreamDEX Event Contracts.
          </p>

          {/* CTA */}
          <a
            href="#terminal"
            className="cta-btn anim-pulse"
            style={{ ['--d' as string]: '0.4s' }}
          >
            Launch Terminal
          </a>
        </main>

        {/* 3) STATS FOOTER */}
        <footer className="stats-footer">
          <StatCounter
            glyph="<"
            target={100}
            suffix="ms"
            decimals={0}
            label="Pricing & Execution Latency"
            delayMs={480}
            durationMs={1500}
            styleDelay="0.5s"
          />
          <StatCounter
            glyph="%"
            target={99.9}
            suffix="%"
            decimals={1}
            label="Black-Scholes Precision"
            delayMs={570}
            durationMs={1580}
            styleDelay="0.58s"
          />
          <StatCounter
            glyph="*"
            target={24}
            suffix="/7"
            decimals={0}
            label="Autonomous Swarm Loop"
            delayMs={660}
            durationMs={1660}
            styleDelay="0.66s"
          />
          <StatCounter
            glyph="#"
            target={50}
            suffix="K+"
            decimals={0}
            label="Historical Replay Fills"
            delayMs={750}
            durationMs={1740}
            styleDelay="0.74s"
          />
        </footer>
      </div>
    </div>
  );
};

export default App;
