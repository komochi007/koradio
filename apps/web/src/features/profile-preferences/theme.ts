export function applyTheme(mode: "dark" | "light" | "system"): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === "system" ? "light dark" : mode;
}
