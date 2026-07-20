import type { Program, ProgramDetail } from "@koradio/contracts";

export interface ProgramHistorySummary {
  dayCounts: readonly number[];
  durationMs: number;
  programCount: number;
  trackCount: number;
}

export function programDurationMs(detail: ProgramDetail): number {
  return detail.timeline.reduce((total, item) => total + item.durationMs, 0);
}

export function formatProgramDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 60) return `${String(minutes)} MIN`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${String(hours)} HR` : `${String(hours)} HR ${String(remainder)} MIN`;
}

export function formatClockDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function programHistorySummary(
  programs: readonly Program[],
  details: ReadonlyMap<string, ProgramDetail>,
  now = new Date(),
): ProgramHistorySummary {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(dayStart.getDate() - 6);
  const recent = programs.filter((program) => new Date(program.createdAt) >= weekStart);
  const dayCounts = Array.from({ length: 7 }, () => 0);
  for (const program of recent) {
    const created = new Date(program.createdAt);
    created.setHours(0, 0, 0, 0);
    const index = Math.floor((created.getTime() - weekStart.getTime()) / 86_400_000);
    if (index >= 0 && index < dayCounts.length) dayCounts[index] = (dayCounts[index] ?? 0) + 1;
  }
  const trackIds = new Set(recent.flatMap((program) => program.trackIds));
  return {
    dayCounts,
    durationMs: recent.reduce((total, program) => {
      const detail = details.get(program.id);
      return total + (detail === undefined ? 0 : programDurationMs(detail));
    }, 0),
    programCount: recent.length,
    trackCount: trackIds.size,
  };
}
