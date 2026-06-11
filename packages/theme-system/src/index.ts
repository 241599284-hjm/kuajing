export type CommerceThemeTokens = {
  name: string;
  colors: {
    background: string;
    surface: string;
    ink: string;
    inkSoft: string;
    accent: string;
    line: string;
  };
  radius: {
    card: string;
    button: string;
  };
  spacingScale: number[];
};

export const premiumMinimalTheme: CommerceThemeTokens = {
  name: "premium-minimal",
  colors: {
    background: "#ffffff",
    surface: "#f8f8f6",
    ink: "#111111",
    inkSoft: "#5f5f5b",
    accent: "#0864e6",
    line: "#e7e5df"
  },
  radius: {
    card: "8px",
    button: "999px"
  },
  spacingScale: [4, 8, 16, 24, 32, 48, 64, 96]
};

