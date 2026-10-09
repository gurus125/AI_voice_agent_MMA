export type SessionStatus = "active" | "completed" | "error";

export interface SessionRow {
  id: string;
  startedAt: string; // ISO timestamp
  durationSeconds: number;
  status: SessionStatus;
  inputTokens: number;
  inputAudioTokens: number;
  outputTokens: number;
  outputAudioTokens: number;
  thoughtsTokens: number;
  estimatedCostUsd: number;
}

export interface UsagePoint {
  label: string; // e.g. "Oct 9" or "Wk Oct 5"
  costUsd: number;
  cumulativeCostUsd: number;
  sessions: number;
}

export interface DashboardSummary {
  activeSessions: number;
  completedSessions: number;
  avgDurationSeconds: number | null;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalEstimatedCostUsd: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  daily: UsagePoint[];
  weekly: UsagePoint[];
  sessions: SessionRow[];
}
