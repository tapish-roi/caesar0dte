import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, ...props }, ref) => {
    return (
      <input
        type={type}
        // A focused type="number" input treats the wheel as a stepper, so simply
        // scrolling the page silently rewrites whatever field the cursor is over
        // — and fields that auto-save (account size, risk) persist that change.
        // Dropping focus on wheel keeps the page scrolling and the value intact.
        onWheel={(e) => {
          if (type === "number" && document.activeElement === e.currentTarget) {
            e.currentTarget.blur();
          }
          onWheel?.(e);
        }}
        className={cn(
          "aurora-field flex h-[46px] w-full rounded-2xl px-4 py-2 text-[15px] text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[#5f7680] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
