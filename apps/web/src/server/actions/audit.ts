"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RecordAuditLogParams {
  action: string;
  entityName: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  userId?: string | null;
}

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "service_role",
  "api_key",
  "embedding",
  "raw_app_meta_data",
  "encrypted_password",
]);

function sanitizeValues(obj?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Records an audit log entry in public.audit_logs.
 * Safely sanitizes keys to ensure no passwords or security tokens are ever logged.
 */
export async function recordAuditLog({
  action,
  entityName,
  entityId,
  oldValues,
  newValues,
  userId,
}: RecordAuditLogParams): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data } = await supabase.auth.getUser();
      resolvedUserId = data.user?.id || null;
    }

    await supabase.from("audit_logs").insert({
      user_id: resolvedUserId,
      action: action.toUpperCase(),
      entity_name: entityName.toLowerCase(),
      entity_id: entityId || null,
      old_values: sanitizeValues(oldValues),
      new_values: sanitizeValues(newValues),
    });
  } catch (err) {
    // Non-blocking: audit log failure should not crash core academic transactions,
    // but should be logged to server console
    console.error("Failed to record audit log:", err);
  }
}
