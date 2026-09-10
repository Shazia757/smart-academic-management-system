import React from "react";
import { Badge } from "@/components/ui/badge";
import { UserRole } from "@/types/database";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Shield,
  ShieldAlert,
  GraduationCap,
  Users,
} from "lucide-react";

interface StatusBadgeProps {
  status: boolean | string;
  activeText?: string;
  inactiveText?: string;
}

export function StatusBadge({
  status,
  activeText = "Active",
  inactiveText = "Inactive",
}: StatusBadgeProps) {
  if (typeof status === "boolean") {
    return status ? (
      <Badge
        variant="default"
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors gap-1.5 font-medium px-2.5 py-0.5 text-xs"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {activeText}
      </Badge>
    ) : (
      <Badge
        variant="secondary"
        className="bg-muted text-muted-foreground border border-border/50 hover:bg-muted/80 transition-colors gap-1.5 font-medium px-2.5 py-0.5 text-xs"
      >
        <XCircle className="w-3.5 h-3.5" />
        {inactiveText}
      </Badge>
    );
  }

  // String status variants
  const upper = String(status).toUpperCase();
  if (upper === "AVAILABLE" || upper === "ACTIVE" || upper === "PUBLISHED" || upper === "ASSIGNED") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 gap-1.5 font-medium px-2.5 py-0.5 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {status}
      </Badge>
    );
  }

  if (upper === "UNAVAILABLE" || upper === "INACTIVE" || upper === "CANCELLED" || upper === "REVOKED") {
    return (
      <Badge variant="destructive" className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 gap-1.5 font-medium px-2.5 py-0.5 text-xs">
        <XCircle className="w-3.5 h-3.5" />
        {status}
      </Badge>
    );
  }

  if (upper === "PREFERRED" || upper === "OPTIMIZING" || upper === "DRAFT") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 gap-1.5 font-medium px-2.5 py-0.5 text-xs">
        <AlertCircle className="w-3.5 h-3.5" />
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 gap-1.5 font-medium px-2.5 py-0.5 text-xs">
      <Clock className="w-3.5 h-3.5" />
      {status}
    </Badge>
  );
}

/**
 * RoleBadge: Displays a formatted badge for user roles
 */
export function RoleBadge({ role }: { role: UserRole | string }) {
  switch (role) {
    case "super_admin":
      return (
        <Badge
          variant="default"
          className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] py-0 px-2 font-semibold gap-1"
        >
          <ShieldAlert className="w-3 h-3" />
          Super Admin
        </Badge>
      );
    case "college_admin":
      return (
        <Badge
          variant="default"
          className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[10px] py-0 px-2 font-semibold gap-1"
        >
          <Shield className="w-3 h-3" />
          College Admin
        </Badge>
      );
    case "faculty":
      return (
        <Badge
          variant="default"
          className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] py-0 px-2 font-semibold gap-1"
        >
          <Users className="w-3 h-3" />
          Faculty
        </Badge>
      );
    case "student":
      return (
        <Badge
          variant="default"
          className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] py-0 px-2 font-semibold gap-1"
        >
          <GraduationCap className="w-3 h-3" />
          Student
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] py-0 px-2">
          {role}
        </Badge>
      );
  }
}
