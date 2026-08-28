import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='w-'])]:w-4 [&_svg:not([class*='w-'])]:h-4 cursor-pointer";

    const variantStyles = {
      default:
        "bg-[#00ffcc] text-[#060709] border-[#00ffcc] hover:brightness-[1.08] hover:bg-[#00ffcc] shadow-[0_0_14px_rgba(0,255,204,0.25)] font-semibold",
      outline:
        "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#c4c2c3] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#ffffff] hover:border-[rgba(255,255,255,0.12)]",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border",
      ghost:
        "bg-transparent text-[#8e94a0] hover:bg-[hsl(var(--muted)/0.5)] hover:text-foreground border-transparent",
      destructive:
        "bg-[rgba(255,51,102,0.12)] text-[#ff3366] border-[rgba(255,51,102,0.30)] hover:bg-[rgba(255,51,102,0.18)] hover:border-[rgba(255,51,102,0.45)] hover:text-[#ff3366] shadow-none",
      link: "text-[#00ffcc] underline-offset-4 hover:underline border-transparent",
    };

    const sizeStyles = {
      default: "h-8 gap-1.5 px-3 text-xs",
      xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='w-'])]:w-3 [&_svg:not([class*='w-'])]:h-3",
      sm: "h-7 gap-1 rounded-md px-2.5 text-xs [&_svg:not([class*='w-'])]:w-3.5 [&_svg:not([class*='w-'])]:h-3.5",
      lg: "h-9 gap-1.5 px-3.5 text-sm",
      icon: "w-8 h-8",
      "icon-xs": "w-6 h-6 rounded-md [&_svg:not([class*='w-'])]:w-3 [&_svg:not([class*='w-'])]:h-3",
      "icon-sm": "w-7 h-7 rounded-md",
      "icon-lg": "w-9 h-9",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
export default Button;
