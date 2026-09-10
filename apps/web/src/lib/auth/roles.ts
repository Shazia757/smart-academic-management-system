import { UserRole } from "@/types/database";

/**
 * Standardized Role Constants matching the database enum values
 */
export const ROLES = {
  SUPER_ADMIN: "super_admin" as const,
  COLLEGE_ADMIN: "college_admin" as const,
  FACULTY: "faculty" as const,
  STUDENT: "student" as const,
};

export const ALL_ROLES: UserRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.COLLEGE_ADMIN,
  ROLES.FACULTY,
  ROLES.STUDENT,
];

export const ADMIN_ROLES: UserRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.COLLEGE_ADMIN,
];

export const STAFF_ROLES: UserRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.COLLEGE_ADMIN,
  ROLES.FACULTY,
];

/**
 * Role hierarchy for permission escalation checks
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [ROLES.SUPER_ADMIN]: 4,
  [ROLES.COLLEGE_ADMIN]: 3,
  [ROLES.FACULTY]: 2,
  [ROLES.STUDENT]: 1,
};

/**
 * Checks if a given role meets or exceeds a minimum required role in the hierarchy
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 999);
}

/**
 * Checks if a user has any of the specified roles
 */
export function hasAnyRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Human-readable display label for each role
 */
export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return "Super Administrator";
    case ROLES.COLLEGE_ADMIN:
      return "College Administrator";
    case ROLES.FACULTY:
      return "Faculty Member";
    case ROLES.STUDENT:
      return "Student";
    default:
      return role;
  }
}

/**
 * Route-to-Role Authorization Matrix
 * Used by server layouts and page guards
 */
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/": ALL_ROLES,
  "/dashboard": ALL_ROLES,
  "/departments": ADMIN_ROLES,
  "/academic-structure": ADMIN_ROLES,
  "/classrooms": ADMIN_ROLES,
  "/faculty/availability": STAFF_ROLES,
  "/faculty": ADMIN_ROLES,
  "/students": STAFF_ROLES,
  "/subjects": ADMIN_ROLES,
  "/assignments": ADMIN_ROLES,
  "/enrollments": ADMIN_ROLES,
  "/timetable": ALL_ROLES,
  "/timetable/configuration": ALL_ROLES,
  "/attendance": ALL_ROLES,
  "/analytics": ALL_ROLES,
  "/reports": STAFF_ROLES,
  "/notifications": ALL_ROLES,
  "/audit-logs": [ROLES.SUPER_ADMIN, ROLES.COLLEGE_ADMIN],
  "/ai-monitor": [ROLES.SUPER_ADMIN, ROLES.COLLEGE_ADMIN],
};

/**
 * Validates whether a specific user role is permitted to access a given path
 */
export function isRouteAuthorized(pathname: string, userRole: UserRole): boolean {
  // Exact match or prefix match
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(
    (route) => pathname === route || (route !== "/" && pathname.startsWith(route))
  );

  if (!matchedRoute) {
    // Default to requiring at least standard authentication
    return true;
  }

  const allowedRoles = ROUTE_PERMISSIONS[matchedRoute];
  return allowedRoles.includes(userRole);
}
