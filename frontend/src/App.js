import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import './styles/landing.css';
const StatCounter = ({ glyph, target, suffix, decimals, label, delayMs, durationMs, styleDelay, }) => {
    const [value, setValue] = useState(0);
    useEffect(() => {
        let animationFrameId;
        let startTime = null;
        const timer = setTimeout(() => {
            const step = (timestamp) => {
                if (!startTime)
                    startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / durationMs, 1);
                // easeOutCubic easing
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = easeOut * target;
                setValue(current);
                if (progress < 1) {
                    animationFrameId = requestAnimationFrame(step);
                }
                else {
                    setValue(target);
                }
            };
            animationFrameId = requestAnimationFrame(step);
        }, delayMs);
        return () => {
            clearTimeout(timer);
            if (animationFrameId)
                cancelAnimationFrame(animationFrameId);
        };
    }, [target, durationMs, delayMs]);
    const formattedValue = decimals > 0
        ? value.toFixed(decimals)
        : Math.floor(value).toLocaleString();
    return (_jsxs("div", { className: "stat-item anim", style: { ['--d']: styleDelay }, children: [_jsxs("div", { className: "stat-top", children: [_jsx("span", { className: "stat-glyph", children: glyph }), _jsxs("span", { className: "stat-value", children: [formattedValue, suffix] })] }), _jsx("span", { className: "stat-label", children: label })] }));
};
export const App = () => {
    const [activeNav, setActiveNav] = useState('Terminal');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // Close mobile menu on window resize > 720px or Escape key
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 720 && mobileMenuOpen) {
                setMobileMenuOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && mobileMenuOpen) {
                setMobileMenuOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyDown);
        if (mobileMenuOpen) {
            document.body.classList.add('menu-open');
        }
        else {
            document.body.classList.remove('menu-open');
        }
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.classList.remove('menu-open');
        };
    }, [mobileMenuOpen]);
    const navItems = [
        'Terminal',
        'Swarm Cockpit',
        'Strategy Studio',
        'Docs',
    ];
    return (_jsxs("div", { className: "page-wrapper", children: [_jsxs("div", { className: "bg", children: [_jsx("video", { className: "bg-video", autoPlay: true, muted: true, loop: true, playsInline: true, children: _jsx("source", { src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4", type: "video/mp4" }) }), _jsx("div", { className: "bg-overlay" })] }), _jsxs("div", { className: "page", children: [_jsxs("header", { className: "header", children: [_jsx("a", { href: "#", className: "logo-btn", "aria-label": "DreamPulse Terminal", children: _jsx("img", { src: "/assets/logo.webp", alt: "DreamPulse Logo", width: "52", height: "52", className: "logo-img" }) }), _jsx("nav", { className: "nav-pill", "aria-label": "Main Navigation", children: navItems.map((item) => (_jsx("button", { type: "button", className: `nav-link ${activeNav === item ? 'active' : ''}`, onClick: () => setActiveNav(item), children: item }, item))) }), _jsx("a", { href: "#terminal", className: "sign-in-btn", children: "Launch Terminal" }), _jsxs("button", { type: "button", className: `burger-btn ${mobileMenuOpen ? 'open' : ''}`, onClick: () => setMobileMenuOpen(!mobileMenuOpen), "aria-expanded": mobileMenuOpen, "aria-label": "Toggle navigation menu", children: [_jsx("span", { className: "burger-bar" }), _jsx("span", { className: "burger-bar" }), _jsx("span", { className: "burger-bar" })] })] }), _jsx("div", { className: `mobile-overlay ${mobileMenuOpen ? 'active' : ''}`, onClick: () => setMobileMenuOpen(false) }), _jsxs("div", { className: `mobile-sheet ${mobileMenuOpen ? 'active' : ''}`, "aria-hidden": !mobileMenuOpen, children: [navItems.map((item, idx) => (_jsx("button", { type: "button", className: `mobile-link ${activeNav === item ? 'active' : ''}`, style: { animationDelay: `${0.05 + idx * 0.05}s` }, onClick: () => {
                                    setActiveNav(item);
                                    setMobileMenuOpen(false);
                                }, children: item }, item))), _jsx("a", { href: "#terminal", className: "sign-in-btn", onClick: () => setMobileMenuOpen(false), children: "Launch Terminal" })] }), _jsxs("main", { className: "hero", children: [_jsxs("div", { className: "trust-row anim", style: { ['--d']: '0.05s' }, children: [_jsxs("div", { className: "avatar-stack", children: [_jsx("div", { className: "avatar-ring", title: "Somnia Layer 1 Network", children: _jsx("div", { className: "avatar-inner", children: _jsx("i", { className: "fa-solid fa-cube", "aria-hidden": "true" }) }) }), _jsx("div", { className: "avatar-ring", title: "DreamDEX Event Contracts CLOB", children: _jsx("div", { className: "avatar-inner", children: _jsx("i", { className: "fa-solid fa-bolt", "aria-hidden": "true" }) }) }), _jsx("div", { className: "avatar-ring", title: "Quantitative AI Engine", children: _jsx("div", { className: "avatar-inner", children: _jsx("i", { className: "fa-solid fa-brain", "aria-hidden": "true" }) }) })] }), _jsx("div", { className: "trust-pill", children: _jsx("span", { className: "trust-text", children: "Built for DreamDEX on Somnia L1" }) })] }), _jsxs("h1", { className: "headline", children: [_jsx("span", { className: "headline-line", children: "Autonomous Swarm" }), _jsx("span", { className: "headline-line", children: "Engineered For Somnia" })] }), _jsx("p", { className: "subhead anim", style: { ['--d']: '0.28s' }, children: "Autonomous quantitative multi-agent swarm, real-time \u03A6(z) edge radar, and non-custodial copy-vault engineered for DreamDEX Event Contracts." }), _jsx("a", { href: "#terminal", className: "cta-btn anim-pulse", style: { ['--d']: '0.4s' }, children: "Launch Terminal" })] }), _jsxs("footer", { className: "stats-footer", children: [_jsx(StatCounter, { glyph: "<", target: 100, suffix: "ms", decimals: 0, label: "Pricing & Execution Latency", delayMs: 480, durationMs: 1500, styleDelay: "0.5s" }), _jsx(StatCounter, { glyph: "%", target: 99.9, suffix: "%", decimals: 1, label: "Black-Scholes Precision", delayMs: 570, durationMs: 1580, styleDelay: "0.58s" }), _jsx(StatCounter, { glyph: "*", target: 24, suffix: "/7", decimals: 0, label: "Autonomous Swarm Loop", delayMs: 660, durationMs: 1660, styleDelay: "0.66s" }), _jsx(StatCounter, { glyph: "#", target: 50, suffix: "K+", decimals: 0, label: "Historical Replay Fills", delayMs: 750, durationMs: 1740, styleDelay: "0.74s" })] })] })] }));
};
export default App;
