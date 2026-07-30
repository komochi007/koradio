import { ApiRequestError } from "./api.js";

export function apiErrorMessage(
  error: unknown,
  messages: Readonly<Record<string, string>>,
  fallback: string,
): string {
  if (!(error instanceof ApiRequestError)) {
    return fallback;
  }
  return messages[error.envelope?.code ?? ""] ?? fallback;
}
