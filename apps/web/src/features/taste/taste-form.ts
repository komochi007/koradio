import type { TasteResponse, UpdateTasteOverridesCommand } from "@koradio/contracts";

export const tasteLimits = {
  tags: { count: 30, length: 24 },
  avoidRules: { count: 20, length: 120 },
  sceneRules: { count: 20, length: 160 },
} as const;

export type TasteDraft = UpdateTasteOverridesCommand;
export type TasteDraftField = keyof TasteDraft;

export interface TasteValidationError {
  field: TasteDraftField;
  index?: number;
  message: string;
}

export function createTasteDraft(taste: TasteResponse): TasteDraft {
  return {
    tags: [...taste.overrides.tags],
    avoidRules: [...taste.overrides.avoidRules],
    sceneRules: [...taste.overrides.sceneRules],
  };
}

export function isTasteEmpty(taste: TasteResponse): boolean {
  return (
    taste.projection.sourceVersion === 0 &&
    taste.overrides.tags.length === 0 &&
    taste.overrides.avoidRules.length === 0 &&
    taste.overrides.sceneRules.length === 0
  );
}

export function stableUniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of tags) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function normalizeTasteDraft(draft: TasteDraft): UpdateTasteOverridesCommand {
  return {
    tags: stableUniqueTags(draft.tags),
    avoidRules: draft.avoidRules.map((rule) => rule.trim()),
    sceneRules: draft.sceneRules.map((rule) => rule.trim()),
  };
}

export function validateTasteDraft(draft: TasteDraft): TasteValidationError[] {
  const errors: TasteValidationError[] = [];
  if (draft.tags.length > tasteLimits.tags.count) {
    errors.push({ field: "tags", message: "风格标签最多 30 个" });
  }
  if (draft.avoidRules.length > tasteLimits.avoidRules.count) {
    errors.push({ field: "avoidRules", message: "避雷规则最多 20 条" });
  }
  if (draft.sceneRules.length > tasteLimits.sceneRules.count) {
    errors.push({ field: "sceneRules", message: "场景规则最多 20 条" });
  }

  draft.tags.forEach((tag, index) => {
    const normalized = tag.trim();
    if (normalized.length === 0 || normalized.length > tasteLimits.tags.length) {
      errors.push({ field: "tags", index, message: "每个标签需在 24 个字符内" });
    }
  });
  draft.avoidRules.forEach((rule, index) => {
    const normalized = rule.trim();
    if (normalized.length === 0) {
      errors.push({ field: "avoidRules", index, message: "避雷规则不能为空" });
    } else if (normalized.length > tasteLimits.avoidRules.length) {
      errors.push({ field: "avoidRules", index, message: "避雷规则不能超过 120 个字符" });
    }
  });
  draft.sceneRules.forEach((rule, index) => {
    const normalized = rule.trim();
    if (normalized.length === 0) {
      errors.push({ field: "sceneRules", index, message: "场景规则不能为空" });
    } else if (normalized.length > tasteLimits.sceneRules.length) {
      errors.push({ field: "sceneRules", index, message: "场景规则不能超过 160 个字符" });
    }
  });
  return errors;
}

export function moveTasteValue(
  values: readonly string[],
  index: number,
  direction: "up" | "down",
): string[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= values.length || target < 0 || target >= values.length) {
    return [...values];
  }
  const result = [...values];
  const current = result[index];
  const replacement = result[target];
  if (current === undefined || replacement === undefined) return result;
  result[index] = replacement;
  result[target] = current;
  return result;
}
