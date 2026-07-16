export type QualityStatus = "ready" | "blocked";

export function parseQualityStatus(value: unknown): QualityStatus {
  if (value === "ready") {
    return value;
  }

  if (value === "blocked") {
    return value;
  }

  throw new TypeError("Unsupported quality status");
}
