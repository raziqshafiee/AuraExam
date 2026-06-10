import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-display font-bold whitespace-nowrap transition-all border-2 border-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lime text-ink shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg",
        secondary: "bg-card text-ink shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg",
        pink: "bg-pink text-ink shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg",
        violet: "bg-violet text-violet-foreground shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg",
        sky: "bg-sky text-ink shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg",
        ghost: "border-transparent shadow-none hover:bg-accent text-foreground",
        outline: "bg-transparent text-ink shadow-brut hover:-translate-y-0.5 hover:shadow-brut-lg hover:bg-card",
        destructive: "bg-destructive text-destructive-foreground shadow-brut hover:-translate-y-0.5",
      },
      size: {
        sm: "h-9 px-4 text-sm rounded-full",
        default: "h-11 px-6 text-base rounded-full",
        lg: "h-14 px-8 text-lg rounded-full",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface WakeoutButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const WakeoutButton = React.forwardRef<HTMLButtonElement, WakeoutButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
WakeoutButton.displayName = "WakeoutButton";

export { buttonVariants };
