import type { CSSProperties } from "react";
import type { Project } from "@skriv/contracts";

export const projectArtworkVariants: CSSProperties[] = [
  // 0
  {
    backgroundColor: "hsl(var(--art-hue, 18), 17%, 15%)",
    backgroundImage:
      "radial-gradient(circle at 25% 110%, hsla(calc(var(--art-secondary-hue, 18) + 10), 64%, 60%, 0.33), transparent 50%), repeating-radial-gradient(ellipse at 100% 0%, transparent 0 11px, hsla(calc(var(--art-secondary-hue, 18) + 20), 74%, 59%, 0.1) 12px 13px)",
  },
  // 1
  {
    backgroundColor: "hsl(var(--art-hue, 180), 17%, 14%)",
    backgroundImage:
      "repeating-linear-gradient(115deg, transparent 0 12px, hsla(calc(var(--art-secondary-hue, 180) + 30), 56%, 52%, 0.14) 13px 14px)",
  },
  // 2
  {
    backgroundColor: "hsl(var(--art-hue, 127), 10%, 15%)",
    backgroundImage:
      "radial-gradient(circle at 65% 42%, hsl(calc(var(--art-secondary-hue, 127) + 20), 63%, 60%) 0 9%, transparent 10%), linear-gradient(160deg, transparent 50%, hsla(calc(var(--art-secondary-hue, 127) + 20), 63%, 60%, 0.2) 51% 52%, transparent 53%)",
  },
  // 3
  {
    backgroundColor: "hsl(var(--art-hue, 16), 27%, 16%)",
    backgroundImage:
      "radial-gradient(circle at 75% 30%, hsl(calc(var(--art-secondary-hue, 16) + 10), 61%, 54%), transparent 10%), linear-gradient(25deg, hsl(var(--art-secondary-hue, 16), 41%, 25%) 0 30%, transparent 31%)",
  },
  // 4
  {
    backgroundColor: "hsl(var(--art-hue, 217), 22%, 14%)",
    backgroundImage:
      "radial-gradient(circle at 20% 70%, hsla(calc(var(--art-secondary-hue, 217) + 20), 78%, 58%, 0.33) 0 1px, transparent 2px)",
    backgroundSize: "11px 11px",
  },
  // 5
  {
    backgroundColor: "hsl(var(--art-hue, 300), 16%, 14%)",
    backgroundImage:
      "linear-gradient(135deg, transparent 40%, hsla(var(--art-secondary-hue, 300), 37%, 55%, 0.13) 41% 42%, transparent 43%), radial-gradient(circle at 10% 90%, hsla(calc(var(--art-secondary-hue, 300) + 40), 62%, 61%, 0.26), transparent 40%)",
  },
  // 6
  {
    backgroundColor: "hsl(var(--art-hue, 131), 17%, 12%)",
    backgroundImage:
      "repeating-linear-gradient(45deg, transparent 0 15px, hsla(var(--art-secondary-hue, 131), 33%, 58%, 0.1) 16px 17px), radial-gradient(circle at 80% 20%, hsla(calc(var(--art-secondary-hue, 131) - 40), 78%, 58%, 0.2), transparent 30%)",
  },
  // 7
  {
    backgroundColor: "hsl(var(--art-hue, 33), 22%, 14%)",
    backgroundImage:
      "radial-gradient(circle at 50% 50%, hsla(calc(var(--art-secondary-hue, 33) + 15), 78%, 58%, 0.06) 0 40%, transparent 41%), repeating-radial-gradient(ellipse at 50% 50%, transparent 0 5px, hsla(calc(var(--art-secondary-hue, 33) + 15), 56%, 52%, 0.06) 6px 7px)",
  },
  // 8
  {
    backgroundColor: "hsl(var(--art-hue, 222), 19%, 14%)",
    backgroundImage:
      "linear-gradient(90deg, transparent 20%, hsla(calc(var(--art-secondary-hue, 222) + 20), 87%, 66%, 0.06) 21% 22%, transparent 23%), radial-gradient(circle at 90% 90%, hsla(calc(var(--art-secondary-hue, 222) + 20), 63%, 60%, 0.26), transparent 60%)",
  },
  // 9
  {
    backgroundColor: "hsl(var(--art-hue, 275), 20%, 15%)",
    backgroundImage:
      "linear-gradient(to bottom right, hsla(var(--art-secondary-hue, 275), 50%, 40%, 0.2) 0%, transparent 50%), radial-gradient(circle at 20% 20%, hsla(calc(var(--art-secondary-hue, 275) + 30), 70%, 60%, 0.15) 0%, transparent 40%)",
  },
  // 10
  {
    backgroundColor: "hsl(var(--art-hue, 45), 18%, 14%)",
    backgroundImage:
      "repeating-radial-gradient(circle at 0 0, transparent 0, hsla(var(--art-secondary-hue, 45), 40%, 50%, 0.1) 10px, transparent 20px)",
  },
  // 11
  {
    backgroundColor: "hsl(var(--art-hue, 150), 20%, 13%)",
    backgroundImage:
      "linear-gradient(0deg, hsla(calc(var(--art-secondary-hue, 150) - 20), 50%, 40%, 0.2) 0%, transparent 30%), linear-gradient(180deg, hsla(calc(var(--art-secondary-hue, 150) + 20), 60%, 50%, 0.15) 0%, transparent 40%)",
  },
  // 12
  {
    backgroundColor: "hsl(var(--art-hue, 200), 15%, 15%)",
    backgroundImage:
      "repeating-linear-gradient(90deg, transparent 0 20px, hsla(calc(var(--art-secondary-hue, 200) + 15), 60%, 55%, 0.05) 20px 40px), repeating-linear-gradient(0deg, transparent 0 20px, hsla(calc(var(--art-secondary-hue, 200) - 15), 60%, 55%, 0.05) 20px 40px)",
  },
  // 13
  {
    backgroundColor: "hsl(var(--art-hue, 340), 22%, 16%)",
    backgroundImage:
      "radial-gradient(circle at 50% 0%, hsla(calc(var(--art-secondary-hue, 340) + 25), 80%, 65%, 0.2), transparent 50%), radial-gradient(circle at 50% 100%, hsla(calc(var(--art-secondary-hue, 340) - 25), 80%, 65%, 0.2), transparent 50%)",
  },
  // 14
  {
    backgroundColor: "hsl(var(--art-hue, 80), 12%, 14%)",
    backgroundImage:
      "linear-gradient(45deg, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1)), linear-gradient(45deg, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1))",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 10px 10px",
  },
  // 15
  {
    backgroundColor: "hsl(var(--art-hue, 260), 18%, 13%)",
    backgroundImage:
      "repeating-radial-gradient(circle at 100% 100%, transparent 0, hsla(var(--art-secondary-hue, 260), 50%, 60%, 0.1) 5px, transparent 10px)",
  },
  // 16
  {
    backgroundColor: "hsl(var(--art-hue, 10), 20%, 15%)",
    backgroundImage:
      "conic-gradient(from 0deg at 50% 50%, hsla(calc(var(--art-secondary-hue, 10) - 15), 60%, 50%, 0.15) 0deg, hsla(calc(var(--art-secondary-hue, 10) + 15), 60%, 50%, 0.15) 180deg, transparent 180deg)",
  },
  // 17
  {
    backgroundColor: "hsl(var(--art-hue, 190), 25%, 12%)",
    backgroundImage:
      "linear-gradient(to right, transparent 0%, hsla(calc(var(--art-secondary-hue, 190) + 40), 70%, 60%, 0.1) 50%, transparent 100%), linear-gradient(to bottom, transparent 0%, hsla(calc(var(--art-secondary-hue, 190) - 20), 70%, 60%, 0.1) 50%, transparent 100%)",
  },
  // 18
  {
    backgroundColor: "hsl(var(--art-hue, 60), 15%, 16%)",
    backgroundImage:
      "radial-gradient(circle at 20% 50%, hsla(calc(var(--art-secondary-hue, 60) + 30), 50%, 50%, 0.2) 0%, transparent 40%), radial-gradient(circle at 80% 50%, hsla(calc(var(--art-secondary-hue, 60) - 30), 50%, 50%, 0.2) 0%, transparent 40%)",
  },
  // 19
  {
    backgroundColor: "hsl(var(--art-hue, 310), 20%, 14%)",
    backgroundImage:
      "repeating-linear-gradient(135deg, transparent, transparent 10px, hsla(calc(var(--art-secondary-hue, 310) + 20), 60%, 55%, 0.05) 10px, hsla(calc(var(--art-secondary-hue, 310) + 20), 60%, 55%, 0.05) 20px)",
  },
  // 20
  {
    backgroundColor: "hsl(var(--art-hue, 100), 16%, 15%)",
    backgroundImage:
      "radial-gradient(ellipse at center, hsla(calc(var(--art-secondary-hue, 100) + 15), 55%, 55%, 0.15) 0%, transparent 70%)",
  },
  // 21
  {
    backgroundColor: "hsl(var(--art-hue, 240), 22%, 13%)",
    backgroundImage:
      "linear-gradient(180deg, hsla(calc(var(--art-secondary-hue, 240) + 20), 65%, 60%, 0.2) 0%, transparent 100%)",
  },
  // 22
  {
    backgroundColor: "hsl(var(--art-hue, 20), 25%, 14%)",
    backgroundImage:
      "linear-gradient(60deg, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1)), linear-gradient(60deg, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1))",
    backgroundSize: "20px 40px",
    backgroundPosition: "0 0, 10px 20px",
  },
  // 23
  {
    backgroundColor: "hsl(var(--art-hue, 170), 18%, 15%)",
    backgroundImage:
      "repeating-radial-gradient(circle at 50% 100%, transparent 0, hsla(var(--art-secondary-hue, 170), 50%, 60%, 0.08) 8px, transparent 16px)",
  },
  // 24
  {
    backgroundColor: "hsl(var(--art-hue, 290), 20%, 14%)",
    backgroundImage:
      "radial-gradient(circle at 100% 0%, hsla(calc(var(--art-secondary-hue, 290) + 20), 65%, 55%, 0.2) 0%, transparent 60%), radial-gradient(circle at 0% 100%, hsla(calc(var(--art-secondary-hue, 290) - 20), 65%, 55%, 0.2) 0%, transparent 60%)",
  },
];

type ArtworkPalette = {
  name: string;
  primaryHue: number;
  secondaryHue: number;
  backgroundSaturation: number;
  backgroundLightness: number;
  accentSaturation: number;
  accentLightness: number;
  accentAlpha: number;
  blendMode: CSSProperties["backgroundBlendMode"];
};

export const projectArtworkPalettes: ArtworkPalette[] = [
  {
    name: "Ember",
    primaryHue: 10,
    secondaryHue: 40,
    backgroundSaturation: 42,
    backgroundLightness: 10,
    accentSaturation: 88,
    accentLightness: 62,
    accentAlpha: 0.45,
    blendMode: "screen, overlay, normal",
  },
  {
    name: "Ocean",
    primaryHue: 210,
    secondaryHue: 178,
    backgroundSaturation: 46,
    backgroundLightness: 10,
    accentSaturation: 82,
    accentLightness: 65,
    accentAlpha: 0.4,
    blendMode: "screen, soft-light, normal",
  },
  {
    name: "Amethyst",
    primaryHue: 274,
    secondaryHue: 322,
    backgroundSaturation: 40,
    backgroundLightness: 11,
    accentSaturation: 84,
    accentLightness: 69,
    accentAlpha: 0.43,
    blendMode: "screen, overlay, normal",
  },
  {
    name: "Verdant",
    primaryHue: 146,
    secondaryHue: 82,
    backgroundSaturation: 36,
    backgroundLightness: 10,
    accentSaturation: 74,
    accentLightness: 59,
    accentAlpha: 0.36,
    blendMode: "screen, soft-light, normal",
  },
  {
    name: "Gilded",
    primaryHue: 43,
    secondaryHue: 18,
    backgroundSaturation: 39,
    backgroundLightness: 11,
    accentSaturation: 90,
    accentLightness: 67,
    accentAlpha: 0.42,
    blendMode: "screen, overlay, normal",
  },
  {
    name: "Arctic",
    primaryHue: 194,
    secondaryHue: 230,
    backgroundSaturation: 29,
    backgroundLightness: 23,
    accentSaturation: 72,
    accentLightness: 79,
    accentAlpha: 0.34,
    blendMode: "screen, soft-light, normal",
  },
  {
    name: "Rose",
    primaryHue: 338,
    secondaryHue: 15,
    backgroundSaturation: 38,
    backgroundLightness: 12,
    accentSaturation: 84,
    accentLightness: 69,
    accentAlpha: 0.42,
    blendMode: "screen, overlay, normal",
  },
  {
    name: "Ink",
    primaryHue: 220,
    secondaryHue: 205,
    backgroundSaturation: 8,
    backgroundLightness: 12,
    accentSaturation: 18,
    accentLightness: 76,
    accentAlpha: 0.25,
    blendMode: "screen, luminosity, normal",
  },
  {
    name: "Neon",
    primaryHue: 292,
    secondaryHue: 165,
    backgroundSaturation: 50,
    backgroundLightness: 7,
    accentSaturation: 100,
    accentLightness: 63,
    accentAlpha: 0.58,
    blendMode: "screen, color-dodge, normal",
  },
  {
    name: "Sepia",
    primaryHue: 28,
    secondaryHue: 49,
    backgroundSaturation: 31,
    backgroundLightness: 17,
    accentSaturation: 64,
    accentLightness: 69,
    accentAlpha: 0.28,
    blendMode: "screen, soft-light, normal",
  },
  {
    name: "Cobalt & Scarlet",
    primaryHue: 226,
    secondaryHue: 354,
    backgroundSaturation: 49,
    backgroundLightness: 9,
    accentSaturation: 92,
    accentLightness: 65,
    accentAlpha: 0.5,
    blendMode: "screen, hard-light, normal",
  },
  {
    name: "Dawn",
    primaryHue: 24,
    secondaryHue: 205,
    backgroundSaturation: 27,
    backgroundLightness: 29,
    accentSaturation: 74,
    accentLightness: 80,
    accentAlpha: 0.35,
    blendMode: "screen, soft-light, normal",
  },
];

function artworkHash(seed: string, initial: number): number {
  let hash = initial;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return hash >>> 0;
}

export function projectArtworkVariant(projectId: string): number {
  return artworkHash(projectId, 0x811c9dc5) % projectArtworkVariants.length;
}

export function projectArtworkHue(projectId: string): number {
  return artworkHash(projectId, 0x517cc1b7) % 360;
}

export function projectArtworkSecondaryHue(projectId: string): number {
  return artworkHash(projectId, 0x3d4b5a6c) % 360;
}

export function projectArtworkPalette(projectId: string): number {
  return artworkHash(projectId, 0x9e3779b9) % projectArtworkPalettes.length;
}

export function projectArtworkStyle(projectId: string): CSSProperties {
  const pattern = projectArtworkVariants[projectArtworkVariant(projectId)] ?? {};
  const palette =
    projectArtworkPalettes[projectArtworkPalette(projectId)] ?? projectArtworkPalettes[0];
  if (!palette) return pattern;

  const hueJitter = (artworkHash(projectId, 0x85ebca6b) % 25) - 12;
  const primaryHue = (palette.primaryHue + hueJitter + 360) % 360;
  const secondaryHue = (palette.secondaryHue - Math.round(hueJitter / 2) + 360) % 360;
  const patternImage = typeof pattern.backgroundImage === "string" ? pattern.backgroundImage : "";
  const paletteWash = [
    `radial-gradient(circle at 16% 8%, hsla(${primaryHue}, ${palette.accentSaturation}%, ${palette.accentLightness}%, ${palette.accentAlpha}), transparent 45%)`,
    `linear-gradient(145deg, transparent 30%, hsla(${secondaryHue}, ${palette.accentSaturation}%, ${palette.accentLightness}%, ${Math.max(0.16, palette.accentAlpha - 0.14)}))`,
  ];

  return {
    ...pattern,
    "--art-hue": primaryHue,
    "--art-secondary-hue": secondaryHue,
    backgroundColor: `hsl(${primaryHue}, ${palette.backgroundSaturation}%, ${palette.backgroundLightness}%)`,
    backgroundImage: [...paletteWash, patternImage].filter(Boolean).join(", "),
    backgroundBlendMode: palette.blendMode,
  } as CSSProperties;
}

export function projectArtworkSeed(project: Pick<Project, "id" | "settings">): string {
  return project.settings.coverArtworkSeed || project.id;
}
