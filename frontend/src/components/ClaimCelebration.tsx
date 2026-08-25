import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';

interface ClaimCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  claimedAmount: string;
  txHash?: string;
  isCompounded?: boolean;
}

export const ClaimCelebration: React.FC<ClaimCelebrationProps> = ({
  isOpen,
  onClose,
  claimedAmount,
  txHash,
  isCompounded = true,
}) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; size: number; delay: number }>>([]);

  useEffect(() => {
    if (isOpen) {
      const colors = ['#00ffcc', '#00f0ff', '#00ff66', '#a855f7', '#ffaa00'];
      const newParticles = Array.from({ length: 36 }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 300 - 50,
        color: colors[i % colors.length],
        size: Math.random() * 6 + 3,
        delay: Math.random() * 0.3,
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortTx = txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Particle Confetti */}
      <div style={{ position: 'absolute', width: '1px', height: '1px' }}>
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: '50%',
              backgroundColor: p.color,
              transform: `translate(${p.x}px, ${p.y}px)`,
              opacity: 0,
              animation: `particleBurst 1.5s cubic-bezier(0.1, 0.8, 0.3, 1) ${p.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* Celebration Banner Card */}
      <div
        style={{
          pointerEvents: 'auto',
          background: 'rgba(14, 14, 18, 0.95)',
          border: '1px solid var(--trade-buy)',
          borderRadius: '12px',
          padding: '24px 32px',
          boxShadow: '0 0 40px rgba(0, 255, 102, 0.3), inset 0 0 20px rgba(0, 255, 102, 0.1)',
          backdropFilter: 'blur(16px)',
          textAlign: 'center',
          maxWidth: '440px',
          position: 'relative',
          animation: 'bannerPopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>

        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(0, 255, 102, 0.15)',
            border: '1px solid rgba(0, 255, 102, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            color: 'var(--trade-buy)',
          }}
        >
          <Sparkles size={24} />
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--foreground)' }}>
          Settlement Redemptions Claimed
        </h3>

        <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)', margin: '8px 0' }}>
          +{claimedAmount}
        </div>

        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 14px 0' }}>
          {isCompounded
            ? 'Winning proceeds auto-compounded back into active trading collateral pool.'
            : 'Payout transferred directly to your Somnia wallet balance.'}
        </p>

        {txHash && (
          <a
            href={`https://shannon-explorer.somnia.network/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              color: 'var(--brand-cyan)',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <CheckCircle2 size={12} />
            <span>View Somnia Shannon Tx: {shortTx}</span>
          </a>
        )}
      </div>

      <style>{`
        @keyframes bannerPopIn {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes particleBurst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
