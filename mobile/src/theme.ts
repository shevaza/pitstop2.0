export const theme = {
  colors: {
    primary: "#0E03DB",
    background: "#0C1020",
    foreground: "#E8EBFF",
    text: "#FFFFFF",
    glass: "rgba(255,255,255,0.11)",
    glassStrong: "rgba(255,255,255,0.16)",
    border: "rgba(255,255,255,0.2)",
    danger: "rgba(255,99,132,0.22)",
    success: "rgba(52,211,153,0.22)",
    warning: "rgba(251,191,36,0.22)",
    info: "rgba(96,165,250,0.22)",
    muted: "rgba(255,255,255,0.72)",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  },
};

export const navigationTheme = {
  dark: true,
  colors: {
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: "#141B30",
    text: theme.colors.text,
    border: "rgba(255,255,255,0.18)",
    notification: theme.colors.primary,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" as const },
    medium: { fontFamily: "System", fontWeight: "500" as const },
    bold: { fontFamily: "System", fontWeight: "700" as const },
    heavy: { fontFamily: "System", fontWeight: "800" as const },
  },
};
