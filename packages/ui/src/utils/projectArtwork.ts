import { type CSSProperties } from "react";
import { type Project } from "@asterism/contracts";

export const projectArtworkVariants: CSSProperties[] = [
  // 0
  {
    backgroundColor: "hsl(var(--art-hue, 18), 17%, 15%)",
    backgroundImage: "radial-gradient(circle at 25% 110%, hsla(calc(var(--art-secondary-hue, 18) + 10), 64%, 60%, 0.33), transparent 50%), repeating-radial-gradient(ellipse at 100% 0%, transparent 0 11px, hsla(calc(var(--art-secondary-hue, 18) + 20), 74%, 59%, 0.1) 12px 13px)"
  },
  // 1
  {
    backgroundColor: "hsl(var(--art-hue, 180), 17%, 14%)",
    backgroundImage: "repeating-linear-gradient(115deg, transparent 0 12px, hsla(calc(var(--art-secondary-hue, 180) + 30), 56%, 52%, 0.14) 13px 14px)"
  },
  // 2
  {
    backgroundColor: "hsl(var(--art-hue, 127), 10%, 15%)",
    backgroundImage: "radial-gradient(circle at 65% 42%, hsl(calc(var(--art-secondary-hue, 127) + 20), 63%, 60%) 0 9%, transparent 10%), linear-gradient(160deg, transparent 50%, hsla(calc(var(--art-secondary-hue, 127) + 20), 63%, 60%, 0.2) 51% 52%, transparent 53%)"
  },
  // 3
  {
    backgroundColor: "hsl(var(--art-hue, 16), 27%, 16%)",
    backgroundImage: "radial-gradient(circle at 75% 30%, hsl(calc(var(--art-secondary-hue, 16) + 10), 61%, 54%), transparent 10%), linear-gradient(25deg, hsl(var(--art-secondary-hue, 16), 41%, 25%) 0 30%, transparent 31%)"
  },
  // 4
  {
    backgroundColor: "hsl(var(--art-hue, 217), 22%, 14%)",
    backgroundImage: "radial-gradient(circle at 20% 70%, hsla(calc(var(--art-secondary-hue, 217) + 20), 78%, 58%, 0.33) 0 1px, transparent 2px)",
    backgroundSize: "11px 11px"
  },
  // 5
  {
    backgroundColor: "hsl(var(--art-hue, 300), 16%, 14%)",
    backgroundImage: "linear-gradient(135deg, transparent 40%, hsla(var(--art-secondary-hue, 300), 37%, 55%, 0.13) 41% 42%, transparent 43%), radial-gradient(circle at 10% 90%, hsla(calc(var(--art-secondary-hue, 300) + 40), 62%, 61%, 0.26), transparent 40%)"
  },
  // 6
  {
    backgroundColor: "hsl(var(--art-hue, 131), 17%, 12%)",
    backgroundImage: "repeating-linear-gradient(45deg, transparent 0 15px, hsla(var(--art-secondary-hue, 131), 33%, 58%, 0.1) 16px 17px), radial-gradient(circle at 80% 20%, hsla(calc(var(--art-secondary-hue, 131) - 40), 78%, 58%, 0.2), transparent 30%)"
  },
  // 7
  {
    backgroundColor: "hsl(var(--art-hue, 33), 22%, 14%)",
    backgroundImage: "radial-gradient(circle at 50% 50%, hsla(calc(var(--art-secondary-hue, 33) + 15), 78%, 58%, 0.06) 0 40%, transparent 41%), repeating-radial-gradient(ellipse at 50% 50%, transparent 0 5px, hsla(calc(var(--art-secondary-hue, 33) + 15), 56%, 52%, 0.06) 6px 7px)"
  },
  // 8
  {
    backgroundColor: "hsl(var(--art-hue, 222), 19%, 14%)",
    backgroundImage: "linear-gradient(90deg, transparent 20%, hsla(calc(var(--art-secondary-hue, 222) + 20), 87%, 66%, 0.06) 21% 22%, transparent 23%), radial-gradient(circle at 90% 90%, hsla(calc(var(--art-secondary-hue, 222) + 20), 63%, 60%, 0.26), transparent 60%)"
  },
  // 9
  {
    backgroundColor: "hsl(var(--art-hue, 275), 20%, 15%)",
    backgroundImage: "linear-gradient(to bottom right, hsla(var(--art-secondary-hue, 275), 50%, 40%, 0.2) 0%, transparent 50%), radial-gradient(circle at 20% 20%, hsla(calc(var(--art-secondary-hue, 275) + 30), 70%, 60%, 0.15) 0%, transparent 40%)"
  },
  // 10
  {
    backgroundColor: "hsl(var(--art-hue, 45), 18%, 14%)",
    backgroundImage: "repeating-radial-gradient(circle at 0 0, transparent 0, hsla(var(--art-secondary-hue, 45), 40%, 50%, 0.1) 10px, transparent 20px)"
  },
  // 11
  {
    backgroundColor: "hsl(var(--art-hue, 150), 20%, 13%)",
    backgroundImage: "linear-gradient(0deg, hsla(calc(var(--art-secondary-hue, 150) - 20), 50%, 40%, 0.2) 0%, transparent 30%), linear-gradient(180deg, hsla(calc(var(--art-secondary-hue, 150) + 20), 60%, 50%, 0.15) 0%, transparent 40%)"
  },
  // 12
  {
    backgroundColor: "hsl(var(--art-hue, 200), 15%, 15%)",
    backgroundImage: "repeating-linear-gradient(90deg, transparent 0 20px, hsla(calc(var(--art-secondary-hue, 200) + 15), 60%, 55%, 0.05) 20px 40px), repeating-linear-gradient(0deg, transparent 0 20px, hsla(calc(var(--art-secondary-hue, 200) - 15), 60%, 55%, 0.05) 20px 40px)"
  },
  // 13
  {
    backgroundColor: "hsl(var(--art-hue, 340), 22%, 16%)",
    backgroundImage: "radial-gradient(circle at 50% 0%, hsla(calc(var(--art-secondary-hue, 340) + 25), 80%, 65%, 0.2), transparent 50%), radial-gradient(circle at 50% 100%, hsla(calc(var(--art-secondary-hue, 340) - 25), 80%, 65%, 0.2), transparent 50%)"
  },
  // 14
  {
    backgroundColor: "hsl(var(--art-hue, 80), 12%, 14%)",
    backgroundImage: "linear-gradient(45deg, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1)), linear-gradient(45deg, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 80) + 10), 50%, 50%, 0.1))",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 10px 10px"
  },
  // 15
  {
    backgroundColor: "hsl(var(--art-hue, 260), 18%, 13%)",
    backgroundImage: "repeating-radial-gradient(circle at 100% 100%, transparent 0, hsla(var(--art-secondary-hue, 260), 50%, 60%, 0.1) 5px, transparent 10px)"
  },
  // 16
  {
    backgroundColor: "hsl(var(--art-hue, 10), 20%, 15%)",
    backgroundImage: "conic-gradient(from 0deg at 50% 50%, hsla(calc(var(--art-secondary-hue, 10) - 15), 60%, 50%, 0.15) 0deg, hsla(calc(var(--art-secondary-hue, 10) + 15), 60%, 50%, 0.15) 180deg, transparent 180deg)"
  },
  // 17
  {
    backgroundColor: "hsl(var(--art-hue, 190), 25%, 12%)",
    backgroundImage: "linear-gradient(to right, transparent 0%, hsla(calc(var(--art-secondary-hue, 190) + 40), 70%, 60%, 0.1) 50%, transparent 100%), linear-gradient(to bottom, transparent 0%, hsla(calc(var(--art-secondary-hue, 190) - 20), 70%, 60%, 0.1) 50%, transparent 100%)"
  },
  // 18
  {
    backgroundColor: "hsl(var(--art-hue, 60), 15%, 16%)",
    backgroundImage: "radial-gradient(circle at 20% 50%, hsla(calc(var(--art-secondary-hue, 60) + 30), 50%, 50%, 0.2) 0%, transparent 40%), radial-gradient(circle at 80% 50%, hsla(calc(var(--art-secondary-hue, 60) - 30), 50%, 50%, 0.2) 0%, transparent 40%)"
  },
  // 19
  {
    backgroundColor: "hsl(var(--art-hue, 310), 20%, 14%)",
    backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 10px, hsla(calc(var(--art-secondary-hue, 310) + 20), 60%, 55%, 0.05) 10px, hsla(calc(var(--art-secondary-hue, 310) + 20), 60%, 55%, 0.05) 20px)"
  },
  // 20
  {
    backgroundColor: "hsl(var(--art-hue, 100), 16%, 15%)",
    backgroundImage: "radial-gradient(ellipse at center, hsla(calc(var(--art-secondary-hue, 100) + 15), 55%, 55%, 0.15) 0%, transparent 70%)"
  },
  // 21
  {
    backgroundColor: "hsl(var(--art-hue, 240), 22%, 13%)",
    backgroundImage: "linear-gradient(180deg, hsla(calc(var(--art-secondary-hue, 240) + 20), 65%, 60%, 0.2) 0%, transparent 100%)"
  },
  // 22
  {
    backgroundColor: "hsl(var(--art-hue, 20), 25%, 14%)",
    backgroundImage: "linear-gradient(60deg, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1)), linear-gradient(60deg, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 25%, transparent 25%, transparent 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1) 75%, hsla(calc(var(--art-secondary-hue, 20) + 15), 70%, 55%, 0.1))",
    backgroundSize: "20px 40px",
    backgroundPosition: "0 0, 10px 20px"
  },
  // 23
  {
    backgroundColor: "hsl(var(--art-hue, 170), 18%, 15%)",
    backgroundImage: "repeating-radial-gradient(circle at 50% 100%, transparent 0, hsla(var(--art-secondary-hue, 170), 50%, 60%, 0.08) 8px, transparent 16px)"
  },
  // 24
  {
    backgroundColor: "hsl(var(--art-hue, 290), 20%, 14%)",
    backgroundImage: "radial-gradient(circle at 100% 0%, hsla(calc(var(--art-secondary-hue, 290) + 20), 65%, 55%, 0.2) 0%, transparent 60%), radial-gradient(circle at 0% 100%, hsla(calc(var(--art-secondary-hue, 290) - 20), 65%, 55%, 0.2) 0%, transparent 60%)"
  }
];

export function projectArtworkVariant(projectId: string): number {
  let hash = 0x811c9dc5;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % projectArtworkVariants.length;
}

export function projectArtworkHue(projectId: string): number {
  let hash = 0x517cc1b7;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % 360;
}

export function projectArtworkSecondaryHue(projectId: string): number {
  let hash = 0x3d4b5a6c;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % 360;
}

export function projectArtworkSeed(project: Pick<Project, "id" | "settings">): string {
  return project.settings.coverArtworkSeed || project.id;
}
