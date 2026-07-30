export function formatClockDuration(durationMs: number): string {
  const seconds = Math.floor(Math.max(0, durationMs) / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
