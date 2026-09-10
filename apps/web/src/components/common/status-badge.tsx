import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { UserRole, TimetableStatus, AttendanceStatus } from "@/types/database";

interface RoleBadgeProps {
  role: UserRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  switch (role) {
    case "super_admin":
      return <Badge variant="destructive">Super Admin</Badge>;
    case "college_admin":
      return <Badge variant="accent">College Admin</Badge>;
    case "faculty":
      return <Badge variant="default">Faculty</Badge>;
    case "student":
      return <Badge variant="secondary">Student</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

export function TimetableStatusBadge({ status }: { status: TimetableStatus }) {
  switch (status) {
    case "PUBLISHED":
      return <Badge variant="success">Published</Badge>;
    case "GENERATED":
      return <Badge variant="accent">Generated</Badge>;
    case "OPTIMIZING":
      return <Badge variant="warning">Optimizing...</Badge>;
    case "DRAFT":
      return <Badge variant="secondary">Draft</Badge>;
    case "ARCHIVED":
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  switch (status) {
    case "PRESENT":
      return <Badge variant="success">Present</Badge>;
    case "LATE":
      return <Badge variant="warning">Late</Badge>;
    case "ABSENT":
      return <Badge variant="destructive">Absent</Badge>;
    case "EXCUSED":
      return <Badge variant="secondary">Excused</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
