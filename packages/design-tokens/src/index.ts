export const colorTokens = {
  light: {
    background: "#f3f4f6",
    surface: "#ffffff",
    border: "#d6d9de",
    textPrimary: "#17191d",
    textSecondary: "#5f6670",
    accent: "#4fae6b",
    error: "#b94f55",
  },
  dark: {
    background: "#090a0c",
    surface: "#111317",
    border: "#2a2f37",
    textPrimary: "#f3f5f7",
    textSecondary: "#a9b0ba",
    accent: "#55b978",
    error: "#d76d72",
  },
} as const;

export const radiusTokens = {
  small: "10px",
  medium: "14px",
  large: "20px",
  radio: "24px",
  full: "999px",
} as const;

export const layoutTokens = {
  radioRailMaxWidth: "816px",
  pageSafeInset: "56px",
  minimumTargetSize: "44px",
} as const;

export const radioTokens = {
  railWidth: "816px",
  mainHeight: "340px",
  playerHeight: "340px",
  dialogueHeight: "288px",
  sceneInputHeight: "88px",
  timeSize: "80px",
  timeSizeMobile: "56px",
} as const;
