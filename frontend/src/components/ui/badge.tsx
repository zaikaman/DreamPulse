import * as React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link"
    | "success"
    | "protocol"
    | "anomaly"
    | "warning";
  size?: "default" | "sm";
}

export function Badge({
  className,
  variant = "default",
  size = "default",
  ...props
}: BadgeProps) {
  const baseStyles =
    "inline-flex shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all select-none [&>svg]:w-3 [&>svg]:h-3";

  const variantStyles = {
    default:
      "bg-[#00ffcc]/10 text-[#00ffcc] border-[#00ffcc]/30 font-medium",
    secondary:
      "bg-secondary text-secondary-foreground border-border",
    destructive:
      "bg-[#ff3366]/10 text-[#ff3366] border-[#ff3366]/30 font-medium",
    success:
      "bg-[#00e676]/10 text-[#00e676] border-[#00e676]/30 font-medium",
    protocol:
      "bg-[#7928ca]/10 text-[#d8b4fe] border-[#7928ca]/30 font-medium",
    anomaly:
      "bg-[#ffb700]/10 text-[#ffb700] border-[#ffb700]/30 font-medium",
    warning:
      "bg-[#ffb700]/10 text-[#ffb700] border-[#ffb700]/30 font-medium",
    outline:
      "border-border text-foreground bg-transparent",
    ghost:
      "hover:bg-muted text-muted-foreground border-transparent",
    link:
      "text-[#00ffcc] underline-offset-4 hover:underline border-transparent",
  };

  const sizeStyles = {
    default: "h-5 text-xs",
    sm: "h-4 text-[10px] px-1.5",
  };

  return (
    <span
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  );
}

export default Badge;
