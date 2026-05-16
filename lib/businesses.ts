export type Business = {
  id: string;
  name: string;
  fullName: string;
  tagline: string;
  accent: string;
  accentBg: string;
  dot: string;
};

export const BUSINESSES: Business[] = [
  {
    id: "mtrnm",
    name: "MTRNM",
    fullName: "MTRNM (Metronome)",
    tagline: "Global house music event label & cultural curation",
    accent: "text-violet-700 dark:text-violet-300",
    accentBg: "bg-violet-500/15 ring-violet-400/30",
    dot: "bg-violet-500 dark:bg-violet-400",
  },
  {
    id: "flair",
    name: "FLAIR",
    fullName: "FLAIR",
    tagline: "Next-gen marketing, activations, and UGC",
    accent: "text-pink-700 dark:text-pink-300",
    accentBg: "bg-pink-500/15 ring-pink-400/30",
    dot: "bg-pink-500 dark:bg-pink-400",
  },
  {
    id: "campuslink",
    name: "CampusLink",
    fullName: "CampusLink",
    tagline: "College marketing, campus activations, and student networks",
    accent: "text-orange-700 dark:text-orange-300",
    accentBg: "bg-orange-500/15 ring-orange-400/30",
    dot: "bg-orange-500 dark:bg-orange-400",
  },
  {
    id: "stealth",
    name: "Stealth Labs",
    fullName: "Stealth Labs",
    tagline: "AI solutions for underserved industries",
    accent: "text-emerald-700 dark:text-emerald-300",
    accentBg: "bg-emerald-500/15 ring-emerald-400/30",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    id: "techspace",
    name: "TechSpace",
    fullName: "TechSpace",
    tagline: "Events + VC at LA TechWeek and beyond",
    accent: "text-sky-700 dark:text-sky-300",
    accentBg: "bg-sky-500/15 ring-sky-400/30",
    dot: "bg-sky-500 dark:bg-sky-400",
  },
  {
    id: "personal",
    name: "Personal",
    fullName: "Personal",
    tagline: "Life, errands, and everything else",
    accent: "text-zinc-700 dark:text-zinc-300",
    accentBg: "bg-zinc-500/15 ring-zinc-400/30",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
];

export function getBusiness(id: string): Business | undefined {
  return BUSINESSES.find((b) => b.id === id);
}
