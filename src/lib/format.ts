export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatNumber(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}

export function formatUsd(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
