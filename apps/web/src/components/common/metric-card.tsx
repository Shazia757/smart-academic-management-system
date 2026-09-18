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
        "rounded-lg border border-border bg-card p-4 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2">
        <div className="text-xl font-bold tracking-tight text-foreground">
          {value}
        </div>
        {(description || trend) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {trend && (
              <span
                className={cn(
                  "font-medium",
                  trend.positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {trend.value}
              </span>
            )}
            {description && (
              <span className="text-muted-foreground truncate">{description}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
