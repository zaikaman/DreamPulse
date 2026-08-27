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
    | "success";
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
      "bg-primary text-primary-foreground",
    secondary:
      "bg-secondary text-secondary-foreground",
    destructive:
      "bg-destructive/15 text-destructive border-destructive/30 font-medium",
    success:
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium",
    outline:
      "border-border text-foreground bg-transparent",
    ghost:
      "hover:bg-muted text-muted-foreground",
    link:
      "text-primary underline-offset-4 hover:underline",
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
