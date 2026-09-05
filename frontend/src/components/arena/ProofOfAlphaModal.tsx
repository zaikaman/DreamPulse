import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
  PaintBrushIcon,
  AdjustmentsHorizontalIcon,
  EyeIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import type { ProofOfAlphaCardConfig } from '../../types/index.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

const SOMNIA_SHANNON_EXPLORER = 'https://shannon-explorer.somnia.network';

export type CardThemeKey = 'cyber' | 'shannon' | 'apex' | 'crimson' | 'mono';
export type CardRatioKey = 'landscape' | 'square';

interface CardThemeConfig {
  name: string;
  badge: string;
  bgDark: string;
  bgGrad1: string;
  bgGrad2: string;
  primaryGlow: string;
  secondaryGlow: string;
  accent: string;
  accentSecondary: string;
  accentText: string;
  borderGlow: string;
  boxBg: string;
  boxBorder: string;
  gridColor: string;
  hudColor: string;
}

const CARD_THEMES: Record<CardThemeKey, CardThemeConfig> = {
  cyber: {
    name: 'Cyber Emerald',
    badge: 'CYBERPUNK OBSIDIAN',
    bgDark: '#05080c',
    bgGrad1: 'rgba(0, 230, 118, 0.18)',
    bgGrad2: 'rgba(6, 182, 212, 0.12)',
    primaryGlow: '#00e676',
    secondaryGlow: '#06b6d4',
    accent: '#00e676',
    accentSecondary: '#22d3ee',
    accentText: '#a7f3d0',
    borderGlow: 'rgba(0, 230, 118, 0.4)',
    boxBg: 'rgba(6, 12, 18, 0.75)',
    boxBorder: 'rgba(0, 230, 118, 0.18)',
    gridColor: 'rgba(0, 230, 118, 0.05)',
    hudColor: '#00e676',
  },
  shannon: {
    name: 'Shannon Quantum',
    badge: 'QUANTUM SOMNIA',
    bgDark: '#040714',
    bgGrad1: 'rgba(59, 130, 246, 0.22)',
    bgGrad2: 'rgba(14, 165, 233, 0.16)',
    primaryGlow: ' #00ffcc',
    secondaryGlow: '#0ea5e9',
    accent: ' #00ffcc',
    accentSecondary: '#60a5fa',
    accentText: '#bae6fd',
    borderGlow: 'rgba(56, 189, 248, 0.45)',
    boxBg: 'rgba(5, 11, 26, 0.75)',
    boxBorder: 'rgba(56, 189, 248, 0.2)',
    gridColor: 'rgba(56, 189, 248, 0.06)',
    hudColor: ' #00ffcc',
  },
  apex: {
    name: 'Apex Gold',
    badge: 'TITANIUM APEX',
    bgDark: '#0c0904',
    bgGrad1: 'rgba(255, 183, 0, 0.2)',
    bgGrad2: 'rgba(234, 179, 8, 0.14)',
    primaryGlow: '#ffb700',
    secondaryGlow: '#eab308',
    accent: '#ffb700',
    accentSecondary: '#ffb700',
    accentText: '#fde68a',
    borderGlow: 'rgba(255, 183, 0, 0.45)',
    boxBg: 'rgba(18, 13, 5, 0.75)',
    boxBorder: 'rgba(255, 183, 0, 0.22)',
    gridColor: 'rgba(255, 183, 0, 0.05)',
    hudColor: '#ffb700',
  },
  crimson: {
    name: 'Crimson Titan',
    badge: 'NEBULA NOVA',
    bgDark: '#0c0408',
    bgGrad1: 'rgba(255, 51, 102, 0.22)',
    bgGrad2: 'rgba(168, 85, 247, 0.15)',
    primaryGlow: '#ff3366',
    secondaryGlow: ' #7928ca',
    accent: '#fb7185',
    accentSecondary: '#d8b4fe',
    accentText: '#fecdd3',
    borderGlow: 'rgba(251, 113, 133, 0.45)',
    boxBg: 'rgba(18, 6, 12, 0.75)',
    boxBorder: 'rgba(251, 113, 133, 0.2)',
    gridColor: 'rgba(255, 51, 102, 0.05)',
    hudColor: '#fb7185',
  },
  mono: {
    name: 'Dark Monochrome',
    badge: 'STEALTH PROTOCOL',
    bgDark: '#08080a',
    bgGrad1: 'rgba(255, 255, 255, 0.12)',
    bgGrad2: 'rgba(161, 161, 170, 0.08)',
    primaryGlow: '#ffffff',
    secondaryGlow: '#a1a1aa',
    accent: '#e4e4e7',
    accentSecondary: '#d4d4d8',
    accentText: '#f4f4f5',
    borderGlow: 'rgba(255, 255, 255, 0.3)',
    boxBg: 'rgba(18, 18, 22, 0.75)',
    boxBorder: 'rgba(255, 255, 255, 0.14)',
    gridColor: 'rgba(255, 255, 255, 0.04)',
    hudColor: '#e4e4e7',
  },
};

interface ProofOfAlphaModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ProofOfAlphaCardConfig | null;
}

export const ProofOfAlphaModal: React.FC<ProofOfAlphaModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Customization States
  const [selectedTheme, setSelectedTheme] = useState<CardThemeKey>('cyber');
  const [selectedRatio, setSelectedRatio] = useState<CardRatioKey>('landscape');
  const [customTagline, setCustomTagline] = useState<string>('Autonomous Prediction Alpha on Somnia');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCornerHud, setShowCornerHud] = useState<boolean>(true);
  const [showCurve, setShowCurve] = useState<boolean>(true);
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [resolutionScale, setResolutionScale] = useState<number>(2); // 2x or 4x

  // Preset Taglines
  const PRESET_TAGLINES = useMemo(() => [
    'Autonomous Prediction Alpha on Somnia',
    'Verified On-Chain CLOB Alpha',
    'Institutional Precision • Zero Latency',
    'Never Bet Against The Swarm',
    '100% On-Chain Shannon Settlement',
  ], []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render high-resolution canvas card
  useEffect(() => {
    if (!isOpen || !config || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = CARD_THEMES[selectedTheme];

    // Card Dimensions based on Aspect Ratio
    const isLandscape = selectedRatio === 'landscape';
    const baseW = isLandscape ? 680 : 540;
    const baseH = isLandscape ? 390 : 540;

    const scale = resolutionScale;
    canvas.width = baseW * scale;
    canvas.height = baseH * scale;
    ctx.scale(scale, scale);

    // 1. Base Dark Background
    ctx.fillStyle = theme.bgDark;
    ctx.fillRect(0, 0, baseW, baseH);

    // 2. High-Tech Matrix / Dot Grid Texture
    if (showGrid) {
      ctx.strokeStyle = theme.gridColor;
      ctx.lineWidth = 1;
      const gridSize = 24;
      for (let x = 0; x <= baseW; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, baseH);
        ctx.stroke();
      }
      for (let y = 0; y <= baseH; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(baseW, y);
        ctx.stroke();
      }
    }

    // 3. Ambient Dual-Bloom Radial Glows
    // Glow 1: Top-Right
    const glow1 = ctx.createRadialGradient(baseW - 60, 50, 10, baseW - 60, 50, isLandscape ? 320 : 360);
    glow1.addColorStop(0, theme.bgGrad1);
    glow1.addColorStop(1, 'transparent');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, baseW, baseH);

    // Glow 2: Bottom-Left
    const glow2 = ctx.createRadialGradient(80, baseH - 60, 10, 80, baseH - 60, 260);
    glow2.addColorStop(0, theme.bgGrad2);
    glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, baseW, baseH);

    // 4. Outer Glowing Frame & Holographic Border
    const pad = 14;
    const frameW = baseW - pad * 2;
    const frameH = baseH - pad * 2;

    ctx.strokeStyle = theme.borderGlow;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(pad, pad, frameW, frameH, 10);
    ctx.stroke();

    // Top Glowing Laser Beam Accent Line
    const laserGrad = ctx.createLinearGradient(pad, pad, baseW - pad, pad);
    laserGrad.addColorStop(0, 'transparent');
    laserGrad.addColorStop(0.3, theme.accent);
    laserGrad.addColorStop(0.7, theme.accentSecondary);
    laserGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = laserGrad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad + 20, pad);
    ctx.lineTo(baseW - pad - 20, pad);
    ctx.stroke();

    // 5. Cyberpunk Corner HUD Brackets
    if (showCornerHud) {
      const hudLen = 14;
      ctx.strokeStyle = theme.hudColor;
      ctx.lineWidth = 2;

      // Top-Left Corner
      ctx.beginPath();
      ctx.moveTo(pad - 2, pad + hudLen);
      ctx.lineTo(pad - 2, pad - 2);
      ctx.lineTo(pad + hudLen, pad - 2);
      ctx.stroke();

      // Top-Right Corner
      ctx.beginPath();
      ctx.moveTo(baseW - pad + 2 - hudLen, pad - 2);
      ctx.lineTo(baseW - pad + 2, pad - 2);
      ctx.lineTo(baseW - pad + 2, pad + hudLen);
      ctx.stroke();

      // Bottom-Left Corner
      ctx.beginPath();
      ctx.moveTo(pad - 2, baseH - pad - hudLen);
      ctx.lineTo(pad - 2, baseH - pad + 2);
      ctx.lineTo(pad + hudLen, baseH - pad + 2);
      ctx.stroke();

      // Bottom-Right Corner
      ctx.beginPath();
      ctx.moveTo(baseW - pad + 2 - hudLen, baseH - pad + 2);
      ctx.lineTo(baseW - pad + 2, baseH - pad + 2);
      ctx.lineTo(baseW - pad + 2, baseH - pad - hudLen);
      ctx.stroke();
    }

    // 6. Header: Brand Shield & Verified On-Chain Badge
    const headerY = pad + 22;

    // Brand Logo Glyph (Diamond Shield)
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(pad + 22, headerY + 6);
    ctx.lineTo(pad + 28, headerY);
    ctx.lineTo(pad + 34, headerY + 6);
    ctx.lineTo(pad + 28, headerY + 12);
    ctx.closePath();
    ctx.fill();

    // Brand Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace, Inter, sans-serif';
    ctx.fillText('DREAMPULSE', pad + 40, headerY + 10);

    // Network Subtext
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px monospace, Inter, sans-serif';
    ctx.fillText('SOMNIA SHANNON 50312', pad + 40, headerY + 24);

    // Verified Tier Pill Badge (Top-Right)
    const badgeText = `${config.badge.toUpperCase()}`;
    ctx.font = 'bold 10px monospace, Inter, sans-serif';
    const badgeWidth = ctx.measureText(badgeText).width + 24;
    const badgeX = baseW - pad - 18 - badgeWidth;
    const badgeY = headerY - 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, 24, 6);
    ctx.fill();
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pulsing Neon Dot inside Badge
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(badgeX + 11, badgeY + 12, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.accentText;
    ctx.fillText(badgeText, badgeX + 20, badgeY + 16);

    // 7. Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 18, headerY + 36);
    ctx.lineTo(baseW - pad - 18, headerY + 36);
    ctx.stroke();

    // 8. Main Identity (Title & Tagline)
    const titleY = headerY + 62;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillText(config.title, pad + 18, titleY);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '11px monospace, Inter, sans-serif';
    ctx.fillText(`${config.subtitle} • ${customTagline}`, pad + 18, titleY + 18);

    // 9. KPI Glass Panels (PnL & Win Rate)
    const boxY = titleY + 30;
    const gap = 12;
    const boxMargin = pad + 18;
    const totalContentW = baseW - boxMargin * 2;
    const boxW = (totalContentW - gap) / 2;
    const boxH = isLandscape ? 84 : 96;

    // --- Box 1: Realized Net PnL ---
    ctx.fillStyle = theme.boxBg;
    ctx.beginPath();
    ctx.roundRect(boxMargin, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Box 1 Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px monospace, Inter, sans-serif';
    ctx.fillText(config.primaryMetricLabel.toUpperCase(), boxMargin + 14, boxY + 24);

    // Box 1 Value (with neon text bloom)
    ctx.fillStyle = config.primaryMetricPositive !== false ? theme.accent : '#ff3366';
    ctx.font = 'bold 26px monospace, Inter, sans-serif';
    ctx.shadowColor = config.primaryMetricPositive !== false ? theme.primaryGlow : '#ff3366';
    ctx.shadowBlur = 10;
    ctx.fillText(config.primaryMetricValue, boxMargin + 14, boxY + 58);
    ctx.shadowBlur = 0; // reset shadow

    // --- Box 2: Win Rate & Secondary Metric ---
    const box2X = boxMargin + boxW + gap;
    ctx.fillStyle = theme.boxBg;
    ctx.beginPath();
    ctx.roundRect(box2X, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Box 2 Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px monospace, Inter, sans-serif';
    ctx.fillText(config.secondaryMetricLabel.toUpperCase(), box2X + 14, boxY + 24);

    // Box 2 Value
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace, Inter, sans-serif';
    ctx.fillText(config.secondaryMetricValue, box2X + 14, boxY + 58);

    // 10. Bottom Section (Performance Area Sparkline or Strategy Rules)
    const box3Y = boxY + boxH + 12;
    const box3H = isLandscape ? (baseH - box3Y - pad - 32) : (baseH - box3Y - pad - 36);

    ctx.fillStyle = theme.boxBg;
    ctx.beginPath();
    ctx.roundRect(boxMargin, box3Y, totalContentW, box3H, 8);
    ctx.fill();
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (showCurve && config.sparkline && config.sparkline.length > 1) {
      // Curve Title
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px monospace, Inter, sans-serif';
      ctx.fillText('CUMULATIVE ALPHA TRAJECTORY', boxMargin + 14, box3Y + 20);

      const pts = config.sparkline;
      const minVal = Math.min(...pts);
      const maxVal = Math.max(...pts);
      const valRange = maxVal - minVal || 1;

      const chartLeft = boxMargin + 14;
      const chartRight = boxMargin + totalContentW - 14;
      const chartTop = box3Y + 30;
      const chartBottom = box3Y + box3H - 12;

      // Area Gradient fill below curve
      const areaGrad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
      areaGrad.addColorStop(0, theme.bgGrad1);
      areaGrad.addColorStop(1, 'transparent');

      ctx.beginPath();
      pts.forEach((val, i) => {
        const x = chartLeft + (i / (pts.length - 1)) * (chartRight - chartLeft);
        const y = chartBottom - ((val - minVal) / valRange) * (chartBottom - chartTop);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(chartRight, chartBottom);
      ctx.lineTo(chartLeft, chartBottom);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Glowing Line Stroke
      ctx.beginPath();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = theme.primaryGlow;
      ctx.shadowBlur = 8;

      pts.forEach((val, i) => {
        const x = chartLeft + (i / (pts.length - 1)) * (chartRight - chartLeft);
        const y = chartBottom - ((val - minVal) / valRange) * (chartBottom - chartTop);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Final Current Apex Node Dot
      const lastX = chartRight;
      const lastY = chartBottom - ((pts[pts.length - 1] - minVal) / valRange) * (chartBottom - chartTop);

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (config.rulesSummary && config.rulesSummary.length > 0) {
      // Rules summary chips
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px monospace, Inter, sans-serif';
      ctx.fillText('QUANTITATIVE EXECUTION DNA & LOGIC', boxMargin + 14, box3Y + 20);

      const rulesStr = config.rulesSummary.join('   •   ');
      ctx.fillStyle = theme.accentText;
      ctx.font = '11px monospace, Inter, sans-serif';
      ctx.fillText(rulesStr.slice(0, 85), boxMargin + 14, box3Y + 44);
      if (rulesStr.length > 85) {
        ctx.fillText(rulesStr.slice(85, 175), boxMargin + 14, box3Y + 62);
      }
    } else {
      // Fallback
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px monospace, Inter, sans-serif';
      ctx.fillText('ON-CHAIN VERIFIED PROTOCOL ORDER', boxMargin + 14, box3Y + 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace, Inter, sans-serif';
      ctx.fillText(`Target Hash: ${config.walletOrAgentId}`, boxMargin + 14, box3Y + 48);
    }

    // 11. Footer: Verification, URL & Stamp
    if (showWatermark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '10px monospace, Inter, sans-serif';
      ctx.fillText('dreampulse-ai.vercel.app/#arena', boxMargin, baseH - pad - 8);

      const targetShort = `${config.walletOrAgentId.slice(0, 12)}...${config.walletOrAgentId.slice(-6)}`;
      ctx.fillText(`Proof: ${targetShort}`, baseW - boxMargin - ctx.measureText(`Proof: ${targetShort}`).width, baseH - pad - 8);
    }
  }, [
    isOpen,
    config,
    selectedTheme,
    selectedRatio,
    customTagline,
    showGrid,
    showCornerHud,
    showCurve,
    showWatermark,
    resolutionScale,
  ]);

  // Copy Image to Clipboard
  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      });
    } catch {
      setIsCopied(false);
    }
  };

  // Download High-Res PNG
  const handleDownloadImage = () => {
    if (!canvasRef.current || !config) return;
    setIsDownloading(true);
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `dreampulse-alpha-${config.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${selectedTheme}.png`;
    link.href = dataUrl;
    link.click();
    setIsDownloading(false);
  };

  // Share to X / Twitter Intent
  const handleShareToTwitter = () => {
    if (!config) return;
    const text = encodeURIComponent(
      `Check out ${config.title} on @DreamPulse on @Somnia_Network Shannon!\n\n` +
      `[ALPHA] ${config.primaryMetricLabel}: ${config.primaryMetricValue}\n` +
      `[TARGET] ${config.secondaryMetricLabel}: ${config.secondaryMetricValue}\n` +
      `>> ${customTagline}\n\n`
    );
    const shareUrl = typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
      ? `${window.location.origin}/#arena`
      : 'https://dreampulse-ai.vercel.app/#arena';
    const url = encodeURIComponent(shareUrl);
    const hashtags = 'Somnia,DreamDEX,DreamPulse,AI,PredictionMarkets';
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (!isOpen || !config) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl bg-card/95 border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="p-3.5 px-5 border-b border-border/50 flex items-center justify-between bg-card/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary/70 border border-border/60 flex items-center justify-center">
              <SparklesIcon className="w-4 h-4 text-[#00e676]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-foreground font-mono">Proof-of-Alpha Card Studio</h3>
                <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 bg-[#00e676]/10 text-[#00e676] border-[#00e676]/30">
                  SOMNIA RETINA
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">Customizable institutional alpha badges for Twitter & community</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Main Body: Live Preview + Studio Customizer Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 border-b border-border/50">
          {/* Canvas Live Preview (7 cols) */}
          <div className="lg:col-span-7 p-5 md:p-6 flex flex-col items-center justify-center bg-background/70 border-b lg:border-b-0 lg:border-r border-border/50">
            <div className="relative rounded-xl overflow-hidden shadow-2xl border border-border/80 max-w-full group">
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  maxWidth: selectedRatio === 'landscape' ? '560px' : '400px',
                  height: 'auto',
                  display: 'block',
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono mt-3 flex items-center gap-1.5">
              <EyeIcon className="w-3 h-3" />
              <span>Real-time {resolutionScale}x Retina Preview • {selectedRatio === 'landscape' ? '16:9 Landscape' : '1:1 Square'}</span>
            </span>
          </div>

          {/* Studio Customizer Controls (5 cols) */}
          <div className="lg:col-span-5 p-4 md:p-5 flex flex-col gap-4 bg-card/40 overflow-y-auto max-h-[460px]">
            {/* 1. Theme Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-mono">
                <PaintBrushIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Card Aesthetic Theme</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(CARD_THEMES) as CardThemeKey[]).map((key) => {
                  const t = CARD_THEMES[key];
                  const isSelected = selectedTheme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedTheme(key)}
                      className={cn(
                        "p-2 rounded-lg border text-left text-[11px] font-mono transition-all flex items-center justify-between",
                        isSelected
                          ? "bg-secondary/80 border-border/90 text-foreground ring-1 ring-emerald-400/30"
                          : "bg-secondary/20 border-border/40 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: t.accent }}
                        />
                        <span className="truncate">{t.name}</span>
                      </div>
                      {isSelected && <CheckIcon className="w-3 h-3 text-[#00e676]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Aspect Ratio & Resolution */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground font-mono">
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Aspect Ratio & DPI</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex rounded-lg border border-border/50 p-0.5 bg-secondary/30">
                  <button
                    type="button"
                    onClick={() => setSelectedRatio('landscape')}
                    className={cn(
                      "flex-1 py-1 text-[11px] font-mono rounded transition-colors text-center",
                      selectedRatio === 'landscape' ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    16:9 Landscape
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRatio('square')}
                    className={cn(
                      "flex-1 py-1 text-[11px] font-mono rounded transition-colors text-center",
                      selectedRatio === 'square' ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    1:1 Square
                  </button>
                </div>

                <div className="flex rounded-lg border border-border/50 p-0.5 bg-secondary/30">
                  <button
                    type="button"
                    onClick={() => setResolutionScale(2)}
                    className={cn(
                      "flex-1 py-1 text-[11px] font-mono rounded transition-colors text-center",
                      resolutionScale === 2 ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    2x HD
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionScale(4)}
                    className={cn(
                      "flex-1 py-1 text-[11px] font-mono rounded transition-colors text-center",
                      resolutionScale === 4 ? "bg-background text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    4x Ultra
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Custom Tagline */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground font-mono">
                <span className="flex items-center gap-1.5">
                  <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Custom Tagline</span>
                </span>
                <span className="text-[10px] text-muted-foreground">{customTagline.length}/50</span>
              </div>
              <input
                type="text"
                value={customTagline}
                maxLength={50}
                onChange={(e) => setCustomTagline(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg bg-background/80 border border-border/60 text-xs font-mono text-foreground focus:outline-none focus:border-border"
                placeholder="Enter custom slogan..."
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {PRESET_TAGLINES.slice(0, 3).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setCustomTagline(tag)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/30 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Visual Toggles */}
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <span className="text-xs font-semibold text-foreground font-mono block">Cyber Elements</span>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-border/60 bg-secondary/50 accent-emerald-500"
                  />
                  <span>Matrix Grid</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showCornerHud}
                    onChange={(e) => setShowCornerHud(e.target.checked)}
                    className="rounded border-border/60 bg-secondary/50 accent-emerald-500"
                  />
                  <span>HUD Corners</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showCurve}
                    onChange={(e) => setShowCurve(e.target.checked)}
                    className="rounded border-border/60 bg-secondary/50 accent-emerald-500"
                  />
                  <span>Performance Curve</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="rounded border-border/60 bg-secondary/50 accent-emerald-500"
                  />
                  <span>Somnia Stamp</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-3.5 px-5 border-t border-border/50 bg-card/60 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyImage}
              className="h-8 text-xs font-medium text-foreground hover:bg-secondary/60 gap-1.5 font-mono px-3"
            >
              {isCopied ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-[#00e676]" />
                  <span className="text-[#00e676]">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  <span>Copy Image</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="h-8 text-xs font-normal text-muted-foreground hover:text-foreground gap-1.5 font-mono px-3"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              <span>Download {resolutionScale}x PNG</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {config && (
              <a
                href={`${SOMNIA_SHANNON_EXPLORER}/address/${config.walletOrAgentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-md border border-border/50 bg-secondary/30 text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors h-8"
              >
                <span>Explorer</span>
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={handleShareToTwitter}
              className="h-8 text-xs font-semibold gap-1.5 font-mono px-4"
            >
              <span>Share on X</span>
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
