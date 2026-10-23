import * as React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-5 shadow-card hover:shadow-card-hover transition-all duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </span>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shrink-0 shadow-xs">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </div>
        {(description || trend) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[11px]",
                  trend.positive
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                )}
              >
                {trend.value}
              </span>
            )}
            {description && (
              <span className="text-muted-foreground truncate font-medium">{description}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
