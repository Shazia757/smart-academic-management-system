"use client";

import * as React from "react";
import {
  Database,
  Search,
  Calendar,
  User,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileJson,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/common/status-badge";

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_name: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  } | null;
}

interface AuditLedgerClientProps {
  initialLogs: AuditLogEntry[];
}

export function AuditLedgerClient({ initialLogs }: AuditLedgerClientProps) {
  const [logs] = React.useState<AuditLogEntry[]>(initialLogs);
  const [search, setSearch] = React.useState("");
  const [selectedEntity, setSelectedEntity] = React.useState<string>("all");
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  const entityOptions = React.useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.entity_name) set.add(log.entity_name);
    });
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      const matchesEntity =
        selectedEntity === "all" || log.entity_name === selectedEntity;

      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        log.action.toLowerCase().includes(q) ||
        log.entity_name.toLowerCase().includes(q) ||
        (log.entity_id && log.entity_id.toLowerCase().includes(q)) ||
        (log.profile &&
          (`${log.profile.first_name} ${log.profile.last_name} ${log.profile.email}`)
            .toLowerCase()
            .includes(q));

      return matchesEntity && matchesSearch;
    });
  }, [logs, search, selectedEntity]);

  const getActionBadgeVariant = (action: string) => {
    const a = action.toUpperCase();
    if (a.includes("DELETE") || a.includes("UNPUBLISH")) return "destructive";
    if (a.includes("PUBLISH") || a.includes("CREATE")) return "success";
    if (a.includes("UPDATE") || a.includes("EDIT")) return "warning";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search action, actor, entity ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Entities ({logs.length})</option>
            {entityOptions.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      {filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground mb-3">
              <Database className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No Audit Records Found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {logs.length === 0
                ? "No administrative mutations have been recorded in the security ledger yet."
                : "No log entries match your current search or entity filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity Target</th>
                  <th className="px-4 py-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRow === log.id;
                  const dateStr = new Date(log.created_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  });

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                          {dateStr}
                        </td>
                        <td className="px-4 py-3">
                          {log.profile ? (
                            <div>
                              <div className="font-semibold text-foreground">
                                {log.profile.first_name} {log.profile.last_name}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {log.profile.email}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-muted-foreground text-[11px]">
                              {log.user_id ? log.user_id.slice(0, 8) + "..." : "System / Trigger"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={getActionBadgeVariant(log.action) as any}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          <div className="font-medium text-foreground">{log.entity_name}</div>
                          {log.entity_id && (
                            <div className="text-[10px] text-muted-foreground/80">
                              ID: {log.entity_id.slice(0, 12)}...
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <FileJson className="h-3.5 w-3.5" />
                            {isExpanded ? "Hide" : "Inspect"}
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="space-y-3 rounded-lg border border-border/80 bg-background/80 p-4">
                              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                                <span>Audit Log ID: <strong className="font-mono text-foreground">{log.id}</strong></span>
                                {log.ip_address && (
                                  <span>IP: <strong className="font-mono text-foreground">{log.ip_address}</strong></span>
                                )}
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                                <div>
                                  <div className="font-semibold text-muted-foreground mb-1">
                                    Previous State (old_values):
                                  </div>
                                  <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] text-foreground border border-border/50">
                                    {log.old_values
                                      ? JSON.stringify(log.old_values, null, 2)
                                      : "null"}
                                  </pre>
                                </div>

                                <div>
                                  <div className="font-semibold text-muted-foreground mb-1">
                                    Mutated State (new_values):
                                  </div>
                                  <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] text-foreground border border-border/50">
                                    {log.new_values
                                      ? JSON.stringify(log.new_values, null, 2)
                                      : "null"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
