import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-[13px] py-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // gold gradient pill — e.g. the 0DTE tag
        default: "aurora-gold shadow-[0_2px_8px_-2px_rgba(224,170,50,0.5)]",
        // glass pill with a cyan⇄gold edge — e.g. PRO
        secondary: "aurora-chip aurora-chip-cyan text-[#a5d8e6]",
        // rose — short / error
        destructive: "aurora-chip aurora-chip-rose text-[#fda4af]",
        // emerald — long / success
        success: "aurora-chip aurora-chip-emerald text-[#6ee7b7]",
        outline: "border border-[rgba(226,181,78,0.4)] text-[#e2b54e]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
