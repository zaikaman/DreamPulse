import React from "react";
import { cn } from "../../lib/utils";

export interface BrandLogoProps {
  /** Size preset */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  /** Optional theme override */
  theme?: "dark" | "light" | "auto";
  /** Whether to display the text wordmark */
  showWordmark?: boolean;
  glow?: boolean;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Minimalist Sovereign Pulse & Diamond Swarm Emblem
 * Pure iconic monochrome silhouette with precision negative-space quantum pulse cutout.
 * Follows clean, timeless institutional design principles.
 */
export const BrandIcon: React.FC<{
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  theme?: "dark" | "light" | "auto";
  className?: string;
  glow?: boolean;
  interactive?: boolean;
}> = ({ size = "md", theme = "auto", className, glow = false }) => {
  const sizeClasses = {
    xs: "w-4 h-4 min-w-4 min-h-4",
    sm: "w-5 h-5 min-w-5 min-h-5",
    md: "w-6 h-6 min-w-6 min-h-6",
    lg: "w-7 h-7 min-w-7 min-h-7",
    xl: "w-8 h-8 min-w-8 min-h-8",
    hero: "w-10 h-10 min-w-10 min-h-10 md:w-12 h-12 md:min-w-12 md:min-h-12",
  };

  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none relative",
        isLight ? "text-zinc-900" : "text-foreground",
        sizeClasses[size] || sizeClasses.md,
        className
      )}
    >
      {glow && (
        <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md pointer-events-none scale-150" />
      )}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full block aspect-square shrink-0 relative z-10"
      >
        {/* Precision geometric pulse wave with diamond apex */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2L2 9.5L5.5 12.5L10 8.5V17L12 19L14 17V8.5L18.5 12.5L22 9.5L12 2ZM3.5 14L2 15.5L12 22L22 15.5L20.5 14L12 19.5L3.5 14Z"
        />
      </svg>
    </div>
  );
};

/**
 * Pure, Minimalist Typographic Wordmark for DreamPulse
 */
export const BrandWordmark: React.FC<{
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  theme?: "dark" | "light" | "auto";
  className?: string;
}> = ({ size = "md", theme = "auto", className }) => {
  const textSizes = {
    xs: "text-xs tracking-tight",
    sm: "text-sm tracking-tight",
    md: "text-base tracking-tight",
    lg: "text-lg md:text-xl tracking-tight",
    xl: "text-2xl md:text-3xl tracking-tight",
    hero: "text-3xl sm:text-4xl md:text-5xl tracking-tight font-bold",
  };

  const isLight = theme === "light";

  return (
    <span
      className={cn(
        "font-sans select-none inline-flex items-center leading-none",
        isLight ? "text-zinc-900" : "text-foreground",
        textSizes[size] || textSizes.md,
        className
      )}
    >
      <span className="font-light tracking-wide text-white/90">Dream</span>
      <span className="font-bold ml-[2px] text-white">Pulse</span>
    </span>
  );
};

/**
 * Unified DreamPulse Brand Logo Lockup
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  theme = "auto",
  showWordmark = true,
  glow = false,
  className,
  onClick,
}) => {
  const isLight = theme === "light";

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        isLight ? "text-zinc-900" : "text-foreground",
        onClick && "cursor-pointer group hover:opacity-90 transition-opacity",
        className
      )}
    >
      <BrandIcon size={size} theme={theme} glow={glow} />
      {showWordmark && <BrandWordmark size={size} theme={theme} />}
    </div>
  );
};

export default BrandLogo;
