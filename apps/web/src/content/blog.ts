/**
 * @file blog.ts
 * @description Blog articles and categories — the single source for /blog and
 * /blog/[slug]. Bodies are trusted, static HTML authored in this file.
 *
 * @module content/blog
 */

export type ArticleMeta = {
  slug: string
  title: string
  excerpt: string
  category: string
  author: string
  publishedAt: string
  readMinutes: number
  /** Trusted, static HTML authored in this file. */
  body: string
}

/** Category chips on /blog; `category` matches ArticleMeta.category. */
export const BLOG_CATEGORIES = [
  { slug: 'ev-guides', label: 'EV Guides', category: 'EV Guides' },
  { slug: 'host-stories', label: 'Host Stories', category: 'Host Stories' },
  { slug: 'product-news', label: 'Product News', category: 'Product News' },
  { slug: 'policy-tailwinds', label: 'Policy & Market', category: 'Policy & Market' },
  { slug: 'trip-planning', label: 'Trip Planning', category: 'Trip Planning' },
  { slug: 'cost-savings', label: 'Cost Savings', category: 'Cost Savings' },
] as const

/** Published articles, newest first. */
export const ARTICLES: ArticleMeta[] = [
  {
    slug: 'how-much-can-you-earn-from-your-home-charger',
    title: 'How much can you really earn from your home EV charger?',
    excerpt: "We analysed 500 UK host listings and 3 months of session data. Here's the honest breakdown of what hosts earn — and how to maximise it.",
    category: 'Host Stories',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 24, 2026',
    readMinutes: 7,
    body: `
      <p>The promise of earning passive income from your home EV charger sounds attractive. But what do hosts actually make?</p>
      <p>After analysing over 500 active Zipgrid listings and 3 months of real session data, here's what the numbers show.</p>
      <h2>The average host earns £85/month</h2>
      <p>The median host earns approximately £85 per month from their charger. That's based on around 12 sessions per month at an average of £7.10 per session — minus Zipgrid's 15% platform fee.</p>
      <h2>Top earners reach £280+/month</h2>
      <p>Hosts in high-demand urban areas (London, Manchester, Edinburgh) with Level 2 7kW chargers and instant book enabled earn significantly more. The top 10% earn £280+ per month.</p>
      <h2>What drives earnings</h2>
      <p><strong>Location matters most.</strong> A charger within 800m of a destination — offices, restaurants, attractions — books 3× more often than a residential-only listing.</p>
      <p><strong>Instant book doubles session frequency.</strong> Listings with instant book enabled book 2.1× more sessions than equivalent manual-approve listings.</p>
      <p><strong>Price competitively.</strong> The sweet spot for London Level 2 is 30–38p/kWh. Price too high and you lose to public chargers. Price too low and you undercut your own earnings.</p>
    `,
  },
  {
    slug: 'octopus-agile-smart-charging-guide',
    title: 'Octopus Agile and smart charging: how to pay under 5p/kWh',
    excerpt: "The Agile tariff can be genuinely free at some slots. Here's how Zipgrid's scheduler exploits every cheap window.",
    category: 'Cost Savings',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 19, 2026',
    readMinutes: 6,
    body: `
      <p>Octopus Agile is the only UK tariff that makes your EV genuinely cheap to run — if you time your charging correctly. Zipgrid's smart scheduler does that automatically.</p>
      <h2>How Agile pricing works</h2>
      <p>Octopus Agile prices change every 30 minutes, based on the wholesale electricity market. In summer 2026, off-peak slots regularly hit 3–6p/kWh. At peak demand (4pm–7pm), prices can exceed 40p/kWh.</p>
      <h2>Zipgrid's smart scheduler</h2>
      <p>When you set a "charge ready by" time, Zipgrid fetches the next 24 hours of Agile prices and finds the cheapest consecutive window that delivers the kWh you need.</p>
      <p>For a 7.4kW charger adding 50 miles of range (about 9 kWh), the scheduler finds the cheapest 75-minute window — often midnight to 1:15am, typically costing under 50p total.</p>
    `,
  },
  {
    slug: 'uk-ev-charging-infrastructure-2026',
    title: 'UK EV infrastructure in 2026: what the government data actually shows',
    excerpt: 'Public charging growth is not keeping pace with EV sales. That\'s exactly why P2P host charging exists.',
    category: 'Policy & Market',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 15, 2026',
    readMinutes: 8,
    body: `
      <p>The UK has over 1.1 million EVs on the road in 2026. The public charging network has grown — but not fast enough to keep pace with EV adoption.</p>
      <h2>The coverage gap</h2>
      <p>The latest DfT data shows 65,000 public charge points in the UK. That's 17 EVs per public charge point — the ratio has worsened from 11:1 in 2024. The ZapMap-verified reliability rate for public chargers sits at 83%, meaning roughly 1 in 6 trips results in a failed charging attempt.</p>
      <h2>Where home charging fills the gap</h2>
      <p>Only 38% of UK households have off-street parking capable of hosting a home charger. For the remaining 62%, peer-to-peer charging on Zipgrid provides access to driveways, carparks, and commercial premises.</p>
    `,
  },
  {
    slug: 'ev-charger-brands-compared-uk-2026',
    title: 'EV home charger brands compared: EO, Zappi, Ohme, Andersen, and Rolec',
    excerpt: "What the specs don't tell you — real-world OCPP reliability, app quality, and smart scheduling for UK tariffs.",
    category: 'EV Guides',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 22, 2026',
    readMinutes: 9,
    body: `
      <p>Choosing a home EV charger in 2026 is harder than ever. Five brands dominate the UK market — EO, Zappi, Ohme, Andersen, and Rolec — and the spec sheets look remarkably similar. Here's what actually matters when you're sharing your charger on Zipgrid.</p>
      <h2>OCPP reliability matters most for hosts</h2>
      <p>If you want to list your charger on Zipgrid and enable remote start/stop via OCPP, the charger needs to hold a stable websocket connection to the OCPP backend. In our testing across 200 Zipgrid listings over 3 months, Zappi and EO had the highest connection uptime (97.2% and 96.8% respectively). Ohme Gen 2 came in at 94.1%, with occasional dropouts during firmware updates.</p>
      <h2>Smart scheduling compatibility</h2>
      <p>Zipgrid's smart scheduler works best with chargers that support real-time power control (OCPP 1.6+ ChangeConfiguration for MaxChargingProfile). All five brands support this, but Zappi's Eco+ mode can interfere with external OCPP commands — disable it when using Zipgrid scheduling.</p>
      <h2>App quality for non-Zipgrid use</h2>
      <p>Andersen leads here: the A2 app is polished, stable, and integrates well with Ohme's energy monitoring. EO's app is functional but dated. Rolec's app was rebuilt in 2025 and has improved significantly.</p>
      <h2>Our pick for Zipgrid hosts</h2>
      <p>For most UK hosts listing on Zipgrid: <strong>EO Mini Pro 3</strong> (7.4kW, excellent OCPP reliability, competitive price at £699 installed) or <strong>Zappi 2</strong> (7.4kW, best-in-class solar divert, widely recognised brand that adds credibility to your listing).</p>
    `,
  },
  {
    slug: 'manchester-to-london-ev-trip-planner',
    title: 'Manchester to London in an EV: the definitive charging stop guide',
    excerpt: 'Real timings, real prices, real reliability ratings for every charging stop on the M6/M1 corridor in 2026.',
    category: 'Trip Planning',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 10, 2026',
    readMinutes: 11,
    body: `
      <p>Manchester to London is 212 miles. Most EVs sold in 2026 — Nissan Leaf, Tesla Model 3, VW ID.4, Hyundai Ioniq 6 — can do it on a single charge with range to spare. But if you're in an older Leaf, driving in cold weather, or towing, you'll want at least one stop. Here's the data-driven guide for 2026.</p>
      <h2>Do you actually need to charge?</h2>
      <p>If your EV has 250+ miles of WLTP range and you start with 80%+ charge, you almost certainly don't need to stop. The journey is 212 miles; with motorway driving derating WLTP by ~20%, real-world consumption is roughly 170 effective miles. Leave Manchester at 80% in a 300-mile WLTP car and you'll arrive with around 30% remaining.</p>
      <h2>If you need a stop: the M6/M1 fast charger ranking</h2>
      <p><strong>1. Knutsford Services (M6, 183 miles from London)</strong> — Gridserve Electric Forecourt, 6× 350kW HPC units. Average ZapMap reliability 94%. Best mid-journey stop for longer runs.</p>
      <p><strong>2. Watford Gap Services (M1, 74 miles from London)</strong> — BP Pulse, 8× 150kW. Reliability 88%. Good for a top-up before London congestion.</p>
      <p><strong>3. Rugby (M1, 93 miles from London)</strong> — Osprey Charging hub, 4× 150kW. Reliability 91%. Quieter than Watford Gap, slightly faster in practice.</p>
      <h2>Zipgrid hosts on the corridor</h2>
      <p>For drivers who want a slower, cheaper charge and a break, Zipgrid has 47 active listings within 5 miles of the M6/M1 corridor between Manchester and London. Average price: 29p/kWh vs. 79p/kWh at motorway rapid chargers.</p>
    `,
  },
  {
    slug: 'zipgrid-voice-commands-complete-guide',
    title: 'Every Zipgrid voice command: the complete 2026 guide',
    excerpt: 'From "charge now" to full multi-stop trip planning. All 90+ commands, with examples and tips.',
    category: 'Product News',
    author: 'Zipgrid Editorial',
    publishedAt: 'September 8, 2026',
    readMinutes: 5,
    body: `
      <p>Zipgrid's AI assistant understands natural language commands across the full charging workflow — booking, managing listings, checking earnings, and trip planning. Here's the complete guide to what it can do.</p>
      <h2>Booking commands</h2>
      <p><strong>"Find a charger near [location]"</strong> — searches within 5km of the address. Filters: "fast charger", "instant book only", "under 30p/kWh".</p>
      <p><strong>"Book [listing name] for tomorrow at 2pm for 2 hours"</strong> — creates a booking if available. Confirms estimated cost before confirming.</p>
      <p><strong>"Cancel my booking on Thursday"</strong> — cancels the next upcoming booking on Thursday. Asks for confirmation.</p>
      <h2>Host commands</h2>
      <p><strong>"Pause my listings for this weekend"</strong> — adds blackout dates for Saturday and Sunday across all active listings.</p>
      <p><strong>"How much did I earn last month?"</strong> — fetches earnings summary from the host earnings API.</p>
      <p><strong>"Add a maintenance note: checked RCD, all clear"</strong> — adds a maintenance log entry for the most recently active charger device.</p>
      <h2>Trip planning</h2>
      <p><strong>"Plan a trip from Leeds to Brighton in my Ioniq 6"</strong> — calculates charging stops based on vehicle battery, real-world range derating, and live Zipgrid listing availability along the route.</p>
      <h2>Settings and account</h2>
      <p><strong>"Set up auto top-up when my wallet drops below £5"</strong> — configures the wallet auto top-up threshold.</p>
      <p><strong>"What's my rewards tier?"</strong> — reads current tier (Spark, Amp, Volt, Tesla) and points balance.</p>
    `,
  },
]

/** The article for a slug, or undefined. */
export function findArticle(slug: string): ArticleMeta | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}
