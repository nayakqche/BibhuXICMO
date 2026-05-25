import * as React from "react";
import { cn } from "@/shared/utils";

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Clamped. */
  value?: number;
}

/**
 * Lightweight indeterminate-friendly progress bar (no Radix dep).
 * Pass `value` between 0 and 100. Falls back to 0 if undefined.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    const v = Math.max(0, Math.min(100, value ?? 0));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-muted",
          className
        )}
        {...props}
      >
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${v}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
