/**
 * Per-business outreach configuration.
 *
 * The outreach module (drafter, enricher, find-contacts, candidates, follow-up)
 * is business-aware: each enabled business gets its own positioning prompts,
 * voice samples, ICP filters, and UI labels. Businesses not listed here do not
 * get an Outreach tab.
 *
 * This file is imported by BOTH server routes and client components — keep it
 * free of fs/node imports. Server routes read the prompt files themselves via
 * the *File fields.
 */

export type OutreachConfig = {
  businessId: string;
  /** Display name used inside prompts ("FLAIR", "MTRNM"). */
  name: string;
  /** Prompt filenames inside lib/prompts/ (read server-side only). */
  positioningFile: string;
  voiceFile: string;
  /** One-line description of what this business pitches. Used across prompts. */
  pitch: string;
  /** Who the drafter writes as. */
  drafterIdentity: string;
  /** Business-specific drafting rules appended to the drafter system prompt. */
  draftRules: string;
  /** What the signal enricher should hunt for. */
  enrichFocus: string;
  /** Short "about" paragraph the enricher uses to judge brand fit. */
  aboutForFit: string;
  /** Contact-priority text for the find-contacts web-search prompt. */
  contactPriority: string;
  /** Apollo person_titles keywords for this business's ICP. */
  icpTitleKeywords: string[];
  /** Brand criteria block for the candidate generator. */
  candidateCriteria: string;
  /** Category list shown in prompts + UI suggestions. */
  categories: string[];
  /** UI: senders for the follow-up drafter toggle. */
  senders: ("Sam" | "Tyler")[];
  /** UI: labels for the two LinkedIn draft templates. */
  templateALabel: string;
  templateBLabel: string;
};

const FLAIR_CONFIG: OutreachConfig = {
  businessId: "flair",
  name: "FLAIR",
  positioningFile: "flair-positioning-brief.md",
  voiceFile: "flair-voice-samples.md",
  pitch: "FLAIR's college / next-gen marketing services",
  drafterIdentity:
    "You write LinkedIn outreach messages for Sam Freeman (Founder) and Tyler Rong (Head of Operations) targeting brand-side decision-makers for FLAIR's college / next-gen marketing services.",
  draftRules: `- Template A: Sam-style. "Hey {FirstName}!!", identity pitch sentence, brand-name drop sentence, "Would love to chat!!" close. Double-bangs.
- Template B: Tyler-style. "Hey {FirstName}!", direct question tailored to brand category, optional one-line elaboration, optional "—{FirstName}" sign-off. Single-bang.
- Pick proof brands relevant to target category from the positioning brief — NEVER invent.
- For Template B, do NOT mention FLAIR or list clients — keep it pure ask.
- Use seasonality (Fall '26, back-to-school, rush week) when it fits.
- Email variant: Template A voice but email-shaped — "Hey {FirstName}!!", identity sentence, ONE matched proof point with a real stat from the brief, brand-name drop, "Would love to chat!!" close, sign off "Sam". Subject short + casual (e.g. "{Brand} x college campuses fall '26"). Under ~120 words.`,
  enrichFocus: `- Recent campaigns or activations (especially Gen-Z / campus / influencer)
- New marketing/brand hires (CMO, Head of Brand, VP Marketing, Director of Influencer, College Marketing Manager)
- Funding rounds, expansions, new product launches in last 12 months
- Partnerships, sponsorships, athlete/creator deals
- Any sorority / fraternity / Greek-life / festival / campus activity
- Public statements about Gen-Z or college audiences`,
  aboutForFit:
    "FLAIR is a next-gen marketing agency that helps brands build real next-gen presence through student creators, Greek life seeding, campus content, and activations. Clients include Coca-Cola, method (SC Johnson), ULTA Beauty, Monster Energy, Real American Beer, and Vacation. Core audience: college students and Gen-Z consumers across US campuses.",
  contactPriority: `1. College / next-gen / campus marketing roles (exact ICP fit)
2. Influencer marketing, creator partnerships, brand partnerships
3. Social media, community management
4. Experiential / brand activations / field marketing
5. Brand marketing execs (CMO, VP Marketing, Head of Brand) — only if 1-4 turn up nothing`,
  icpTitleKeywords: [
    "college", "campus", "student", "next-gen", "next gen", "gen z", "gen-z",
    "influencer", "creator", "partnership", "partnerships", "ambassador", "talent",
    "social media", "community",
    "experiential", "activation", "field marketing", "events",
    "head of brand", "vp marketing", "vp of marketing", "chief marketing",
    "brand marketing", "marketing manager", "marketing director",
  ],
  candidateCriteria: `- Sell to or want to sell to Gen-Z / college-age consumers
- Mid-tier in marketing maturity — too small to have a big-agency lock-in, too established to be lifestyle-only
- NOT already FLAIR clients (Coca-Cola, method/SC Johnson, Monster Energy, Real American Beer, WOW Media, Vacation, ULTA Beauty — skip these and obvious adjacents)
- Have a back-to-school 2026 story angle (apparel for fall, beauty for rush, beverage for tailgates, EdTech for semester start)`,
  categories: [
    "beauty", "wellness", "lifestyle", "fashion", "apparel",
    "CPG", "beverage", "EdTech", "DTC-genz", "enterprise",
  ],
  senders: ["Sam", "Tyler"],
  templateALabel: "Template A — Identity + proof (Sam-style)",
  templateBLabel: "Template B — Specific question (Tyler-style)",
};

const MTRNM_CONFIG: OutreachConfig = {
  businessId: "mtrnm",
  name: "MTRNM",
  positioningFile: "mtrnm-positioning-brief.md",
  voiceFile: "mtrnm-voice-samples.md",
  pitch: "MTRNM's brand partnerships and co-branded event experiences",
  drafterIdentity:
    "You write LinkedIn outreach messages for Sam Freeman (Co-Founder & Managing Partner of MTRNM) targeting brand-side partnership and marketing decision-makers. MTRNM pitches brand partnerships, sponsorships, and co-branded experiences woven into its global house music events.",
  draftRules: `- Template A: Generalized dream-collab hook. Connection note pattern: "{Brand}, you're our dream collab @ MTRNM. Let's chat?" First DM: one-two lines on traveling the world hosting intimate, curated, high-end house music events + why the match is obvious.
- Template B: Semi-personalized DM. Lowercase casual ("hey {firstName}!"), say you'd love to chat about bringing {Brand} to life across MTRNM's house music events & curations around the world, point them to @mtrnm_ on IG for context, one platform line (events label / cultural curator / lifestyle brand), close with why {Brand} fits the audience and experiences.
- Voice is lowercase-leaning, warm, confident, never corporate. Double-bangs welcome.
- Name-drop venues/cities/talent from the positioning brief ONLY when they strengthen the specific pitch (e.g. fashion brand → Natural History Museum London; spirits → Casamigos/Don Julio formats exist, don't name competitors to their face).
- Never pitch pricing or packages in the first touch. The ask is always a chat.`,
  enrichFocus: `- Music, festival, nightlife, or DJ/artist sponsorships and partnerships
- Experiential marketing, brand activations, pop-ups, branded houses or estates
- Luxury / lifestyle / fashion collabs and limited editions
- Expansion into new cities or international markets (especially MTRNM cities: LA, NYC, London, Paris, Miami, Athens, Amman, Dubai-adjacent, Mexico City, São Paulo)
- Launches or campaigns targeting affluent 18-35 consumers, travelers, or tastemakers
- New marketing/brand/partnership hires (CMO, Head of Partnerships, Brand Director, Experiential lead)`,
  aboutForFit:
    "MTRNM (pronounced Metronome) is a global house music platform combining curated live experiences with a media engine and brand ecosystem — an events label, cultural curator, and lifestyle brand. 70+ events across 18 cities and 12 countries; venues include the Natural History Museums of LA & London, the Ritz-Carlton Amman, Palais de Tokyo Paris, airplane hangars, Japanese temples, the Dead Sea, and the Greek Riviera. Audience: affluent, highly influential 18-35 international students, expats, and young professionals — creatives, business owners, and tastemakers. Past brand partners include Casamigos, Don Julio, Coca-Cola, and method × Ulta Beauty (Coachella creator house, 67M+ reach).",
  contactPriority: `1. Brand partnerships / sponsorships / collaborations roles (exact ICP fit)
2. Experiential marketing, events, brand activations
3. Lifestyle / culture / music marketing roles
4. Influencer marketing, creator partnerships
5. Brand marketing execs (CMO, VP Marketing, Head of Brand) — only if 1-4 turn up nothing`,
  icpTitleKeywords: [
    "partnership", "partnerships", "sponsorship", "sponsorships", "collaboration",
    "experiential", "activation", "events", "event marketing", "field marketing",
    "lifestyle", "culture", "cultural", "music", "entertainment",
    "influencer", "creator", "talent",
    "head of brand", "vp marketing", "vp of marketing", "chief marketing",
    "brand marketing", "brand manager", "marketing manager", "marketing director",
  ],
  candidateCriteria: `- Premium / aspirational brands whose audience overlaps MTRNM's: affluent, international, culturally influential 18-35s
- Strong-fit categories: premium spirits & champagne, luxury fashion & streetwear, beauty & fragrance, hotels & travel, premium fintech / cards, tech & audio, wellness, jewelry & watches, premium F&B
- Brands that already invest in culture (music, art, fashion, nightlife sponsorships) or clearly should
- NOT already MTRNM partners (Casamigos, Don Julio, Coca-Cola, method, Ulta Beauty — skip these and obvious adjacents)
- Bonus: brands active in or expanding into MTRNM cities (LA, NYC, London, Paris, Miami, Athens, Amman, Mexico City, São Paulo, Istanbul, Montreal, Boston, DC)`,
  categories: [
    "spirits", "beverage", "luxury-fashion", "streetwear", "beauty", "fragrance",
    "hospitality", "travel", "fintech", "tech-audio", "wellness", "jewelry-watches",
  ],
  senders: ["Sam"],
  templateALabel: "Template A — Dream collab hook (generalized)",
  templateBLabel: "Template B — Semi-personalized DM",
};

export const OUTREACH_CONFIGS: Record<string, OutreachConfig> = {
  flair: FLAIR_CONFIG,
  mtrnm: MTRNM_CONFIG,
};

/** Businesses that have the Outreach tab enabled. */
export const OUTREACH_BUSINESS_IDS = Object.keys(OUTREACH_CONFIGS);

export function getOutreachConfig(businessId: string): OutreachConfig | null {
  return OUTREACH_CONFIGS[businessId] ?? null;
}
