export type Business = {
  id: string;
  name: string;
  fullName: string;
  tagline: string;
  accent: string;
  accentBg: string;
  dot: string;
  /** Active tab pill — brand bg + white text in light, neutral in dark */
  tabActive: string;
  /** Raw hex for use in inline styles (e.g. header background tint) */
  hex: string;
};

export const BUSINESSES: Business[] = [
  {
    id: "mtrnm",
    name: "MTRNM",
    fullName: "MTRNM (Metronome)",
    tagline: "Global house music event label & cultural curation",
    accent: "text-[#0B402C] dark:text-[#4ade80]",
    accentBg: "bg-[#0B402C]/10 ring-[#0B402C]/25",
    dot: "bg-[#0B402C] dark:bg-[#4ade80]",
    tabActive: "bg-[#0B402C] text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#0B402C",
  },
  {
    id: "flair",
    name: "FLAIR",
    fullName: "FLAIR",
    tagline: "Next-gen marketing, activations, and UGC",
    accent: "text-[#ED1F24] dark:text-[#f87171]",
    accentBg: "bg-[#ED1F24]/10 ring-[#ED1F24]/25",
    dot: "bg-[#ED1F24]",
    tabActive: "bg-[#ED1F24] text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#ED1F24",
  },
  {
    id: "campuslink",
    name: "CampusLink",
    fullName: "CampusLink",
    tagline: "College marketing, campus activations, and student networks",
    accent: "text-[#ED1F24] dark:text-[#f87171]",
    accentBg: "bg-[#ED1F24]/10 ring-[#ED1F24]/25",
    dot: "bg-[#ED1F24]",
    tabActive: "bg-[#ED1F24] text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#ED1F24",
  },
  {
    id: "stealth",
    name: "Stealth Labs",
    fullName: "Stealth Labs",
    tagline: "AI solutions for underserved industries",
    accent: "text-zinc-950 dark:text-zinc-50",
    accentBg: "bg-zinc-950/8 ring-zinc-950/20 dark:bg-zinc-50/10 dark:ring-zinc-50/20",
    dot: "bg-zinc-950 dark:bg-zinc-50",
    tabActive: "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#18181b",
  },
  {
    id: "techspace",
    name: "TechSpace",
    fullName: "TechSpace",
    tagline: "Events + VC at LA TechWeek and beyond",
    accent: "text-sky-700 dark:text-sky-300",
    accentBg: "bg-sky-500/15 ring-sky-400/30",
    dot: "bg-sky-500 dark:bg-sky-400",
    tabActive: "bg-sky-500 text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#0ea5e9",
  },
  {
    id: "personal",
    name: "Personal",
    fullName: "Personal",
    tagline: "Life, errands, and everything else",
    accent: "text-zinc-700 dark:text-zinc-300",
    accentBg: "bg-zinc-500/15 ring-zinc-400/30",
    dot: "bg-zinc-500 dark:bg-zinc-400",
    tabActive: "bg-zinc-600 text-white dark:bg-zinc-100 dark:text-zinc-900",
    hex: "#71717a",
  },
];

export function getBusiness(id: string): Business | undefined {
  return BUSINESSES.find((b) => b.id === id);
}
