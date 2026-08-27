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
        "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
      outline:
        "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost:
        "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      link: "text-primary underline-offset-4 hover:underline",
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
