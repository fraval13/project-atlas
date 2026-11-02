export const themes = [
  {
    id: "default",
    name: "Atlas",
    description: "Midnight navy, teal, and violet.",
  },
  {
    id: "hacker",
    name: "Hacker",
    description: "A quiet terminal with matrix green text.",
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Light surfaces, soft corners, and refined details.",
  },
  {
    id: "retro",
    name: "Retro",
    description: "Classic gray controls and blue title bars.",
  },
] as const;
export type Theme = (typeof themes)[number]["id"];
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("atlas.theme");
    if (themes.some((t) => t.id === saved)) return saved as Theme;
  } catch {}
  return /mac/i.test(navigator.platform) ? "elegant" : "default";
}
