import { z } from "zod";

export function parseSqliteRow<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function parseSqliteRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  return z.array(schema).parse(value);
}
