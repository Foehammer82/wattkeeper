import type { ThemePreference } from "../types";
import type { NodeRecord, UPSummary } from "../api";

export type StatusSeverity = "error" | "warning" | "success" | "default";

// NUT `ups.status` is a space-separated set of well-known tokens (see
// https://networkupstools.org/docs/developer-guide.chunked/apas02.html). We map each
// token to a MUI severity and report the most severe token present.
const UPS_STATUS_ERROR = new Set(["OB", "LB", "FSD", "OVER", "OFF", "ALARM"]);
const UPS_STATUS_WARNING = new Set(["RB", "CAL", "BYPASS", "TRIM", "BOOST", "DISCHRG"]);
const UPS_STATUS_OK = new Set(["OL", "CHRG"]);

export function statusToSeverity(status: string | undefined): StatusSeverity {
  if (!status) {
    return "default";
  }
  let severity: StatusSeverity = "default";
  for (const token of status.toUpperCase().split(/\s+/)) {
    if (!token) {
      continue;
    }
    if (UPS_STATUS_ERROR.has(token)) {
      return "error";
    }
    if (UPS_STATUS_WARNING.has(token)) {
      severity = "warning";
    } else if (UPS_STATUS_OK.has(token) && severity === "default") {
      severity = "success";
    }
  }
  return severity;
}

export function commsStateToSeverity(state: string | undefined): StatusSeverity {
  switch (String(state || "").toLowerCase()) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "offline":
      return "error";
    default:
      return "default";
  }
}

export function formatThemeLabel(theme: ThemePreference): string {
  return theme[0].toUpperCase() + theme.slice(1);
}

export function formatNodeDisplayName(node: Pick<NodeRecord, "display_name" | "instance" | "hostname" | "id">): string {
  return node.display_name || node.instance || node.hostname || node.id;
}

export function formatNodeReference(node: Pick<NodeRecord, "display_name" | "instance" | "hostname" | "id">): string {
  const name = formatNodeDisplayName(node);
  return name === node.id ? name : `${name} (${node.id})`;
}

// Known raw backend/network error substrings rewritten into operator-friendly text.
// Add new entries here rather than letting a fresh raw error string leak into a
// toast or table cell (see AlertsPage delivery column and NodeDetailDialog load error).
const ERROR_REWRITES: Array<{ match: string; friendly: string }> = [
  {
    match: "ciphertext too short",
    friendly: "Node detail is unavailable because controller credentials are invalid for this node. Re-adopt the node and try again.",
  },
  {
    match: "unsupported protocol scheme",
    friendly: "Delivery failed: the webhook URL is missing a valid scheme (e.g. https://).",
  },
];

export function humanizeError(error: unknown, fallback = "Unknown error"): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" && error ? error : fallback;
  const lower = raw.toLowerCase();
  for (const rewrite of ERROR_REWRITES) {
    if (lower.includes(rewrite.match)) {
      return rewrite.friendly;
    }
  }
  return raw;
}

export function formatCommsState(state: string | undefined, failures: number, error?: string) {
  const normalized = String(state || "unknown");
  if (normalized === "healthy") {
    return "healthy";
  }
  if (normalized === "offline") {
    return failures > 0 ? `offline (${failures} failed polls)` : "offline";
  }
  if (normalized === "degraded") {
    return error ? `degraded: ${error}` : "degraded";
  }
  return "unknown";
}

// UPS telemetry summary (battery/load/runtime) without the status token, which is
// rendered separately as a colored StatusChip.
export function formatUPSMetrics(summary: UPSummary) {
  const parts: string[] = [];
  if (summary.battery_charge_percent != null) {
    parts.push(`${summary.battery_charge_percent}% battery`);
  }
  if (summary.load_percent != null) {
    parts.push(`${summary.load_percent}% load`);
  }
  if (summary.runtime_seconds != null) {
    parts.push(formatDuration(summary.runtime_seconds));
  }
  return parts.join(" • ") || summary.driver || "no recent telemetry";
}

export function formatDuration(value: number | undefined) {
  if (value == null) {
    return "unknown";
  }
  const totalSeconds = Number(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatBatteryTrend(
  trend:
    | {
        baseline_runtime_seconds: number;
        latest_runtime_seconds: number;
        replacement_threshold_seconds: number;
        trend_seconds_per_30d: number;
        samples_used: number;
        latest_sampled_at: string;
        estimated_replace_by?: string;
      }
    | undefined,
) {
  if (!trend) {
    return "insufficient data";
  }
  const per30Days = Math.round(trend.trend_seconds_per_30d);
  if (trend.estimated_replace_by) {
    const date = new Date(trend.estimated_replace_by).toLocaleDateString();
    return `${per30Days}s/30d • replace by ${date}`;
  }
  if (per30Days < 0) {
    return `${per30Days}s/30d`;
  }
  return `${per30Days}s/30d • stable`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "unknown";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function toChartSeries(samples: Array<{ value: string; captured_at: string }>) {
  return [...samples]
    .reverse()
    .map((sample) => ({
      timestamp: new Date(sample.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      value: Number(sample.value),
    }))
    .filter((sample) => Number.isFinite(sample.value));
}
