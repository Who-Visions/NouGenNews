// Golden fixture: the corrected NouGen News Night Edition of Tuesday 2026-11-24,
// reconstructed as a structured edition object.
//
// "Corrected" is the load-bearing word. The written briefing carried the
// contributor's Haiti segment in full, credited — that part was always fine.
// What the correction changed was the SPOKEN report: the contributor segment
// had been voiced from the filed script, against the standing rule, and the
// corrected edition replaced it with a one-line desk pointer. This fixture
// models the corrected edition: the contributor block below carries the full
// text for print and exactly one pointer line for speech.
//
// Per this repo's AGENTS.md, repo text refers to people by role, so the
// contributor is credited by role ("our contributor on the Haiti beat")
// rather than by name. Desk-story paragraphs are otherwise the briefing's own
// words. The source brief's closing line for the segment — that it runs in
// the spoken report — described the uncorrected behaviour and is not carried
// here; the pointer field below is what the corrected edition actually aired.

export const nightEdition2026_11_24 = {
  id: "2026-11-24-night",
  name: "Night Edition",
  dayLabel: "Tuesday",
  date: "2026-11-24",
  sourceNote:
    "Source: headless NouGen news pipeline front page, generated 2026-11-25T02:56:26Z (9:56 PM EST) — 632 stories on the wire, 12 of 12 feeds ok. B-block AI depth also draws on today's newsletter digest (nine publications, window 2026-11-23 12:37 ET → 2026-11-24 09:45 ET), with each digest item sourced to its publication. Weather hit verified live via the Eye (eye.nougenai.com) at 10:00 PM EST.",
  blocks: [
    {
      id: "A",
      heading: "A block — Jensen Huang is back at Nvidia",
      items: [
        {
          type: "story",
          paragraphs: [
            "Eleven days after resigning, Jensen Huang was reinstated as Nvidia president, CEO and director by a unanimous board vote on Monday. President Trump told CNBC he personally lobbied the board — \"I convinced them,\" \"I made the deal\" — and the board says it received input from senior levels of the US government and is confident the return poses no national security risk. (Turing Post, The Rundown AI, Superhuman AI, Gizmodo AI Brief, Mindstream, AI Secret, The Deep View, Morning Brew, TLDR AI — all nine digest publications.)",
            "The market moved with him: NVDA closed Monday at $165.05, up 31.5%, adding about $950 billion in market value (AI Secret's figure; Morning Brew puts it at $952 billion, a record single-day gain for a US company per Dow Jones data; The Rundown says over $1 trillion during trading). The Nasdaq rose 6.51%, its best day since April 2025.",
            "The return comes with a harness: Harvey Jones remains board chair, a new National Security and Export Control Committee oversees trade and security risks, a Chief Compliance Officer is being hired, and the independent investigation continues. Colette Kress returns as CFO.",
            "The tension in the story: at his first all-hands since returning, Huang apologized to staff and said it is \"not true\" Trump got him rehired (The Verge, carried in the Evening Edition). That sits directly against the president's own account. Gizmodo, citing the Guardian and the FT, reports Trump may have made up to $15 million on personal Nvidia holdings (up to 370,000 shares as of Sept 30) from the Monday rally. Unresolved: the date of Huang's House hearing — Dec 1 per The Rundown, \"next week\" per Gizmodo, \"next month\" per Morning Brew. The SEC and FBI investigations continue.",
          ],
        },
      ],
    },
    {
      id: "B",
      heading: "B block",
      items: [
        {
          type: "contributor",
          credit: "our contributor on the Haiti beat",
          heading: "Haiti deepens the Bukele security pact — but the agreement itself stays secret (our contributor on the Haiti beat)",
          paragraphs: [
            "Haiti's partnership with El Salvador moved from the battlefield into the justice system on Friday Nov 20, when Justice Minister Patrick Pélissier announced three new prisons to be built by a Salvadoran company with a Haitian partner, the first expedited on the prime minister's order, after Pélissier toured the CECOT mega-prison and praised it. The government has disclosed no cost, no financing, and no management role. Meanwhile roughly 2,500 Salvadoran troops operate in Haiti outside the UN-backed Gang Suppression Force, and ACLED estimates operations and drone strikes rose 45.8% in the 21 days after their deployment, with more than 100 fatalities, at least 26 identified as civilians. The bilateral agreement behind the deployment remains unpublished — mandate, rules of engagement and chain of command unknown — while the UN Secretary-General, speaking in Barbados, paired his call for full security support with a demand for a Haitian-owned political process and elections. Sources: Associated Press (Nov 20–21); ACLED expert comment (Nov 2026); UN News (Nov 23); reported analysis \"Bukele Came for Four Men. Now He's Building Haiti's Prisons\" (Nov 22, flagged as analysis). Not known: the text of the agreement; prison sites, cost, capacity and financing; the fate of four Salvadoran technicians missing since Oct 18; any official finding on the Nov 20 camp explosion that killed Salvadoran soldiers.",
          ],
          pointer:
            "On the Haiti beat, our contributor has filed on Haiti's deepening security pact with El Salvador — the full report is in tonight's written briefing.",
        },
        {
          type: "story",
          heading: "US financial crimes bureau discloses a cybersecurity incident (The Verge)",
          paragraphs: [
            "The Financial Crimes Enforcement Network (FinCEN), part of the Treasury Department, disclosed on Tuesday that it is investigating a \"cybersecurity incident\" that resulted in unauthorized access to \"a limited subset of its systems.\" It has offered no information about the full scope or the source. The bureau is the office that tracks illicit finance — money laundering, terrorist financing — so even a limited breach of its systems is a story to watch, and the absence of detail so far is the detail.",
          ],
        },
        {
          type: "story",
          heading: "Tidal bans AI-generated music, deleting 29 million songs (Kotaku)",
          paragraphs: [
            "Once the policy goes into effect, the app estimates it will reject 80,000 AI-generated songs a day. The purge is one of the largest single removals of AI-made material by a streaming service, and it lands as the music business keeps arguing over what counts as a song when a machine made it.",
          ],
        },
        {
          type: "story",
          heading: "GTA VI was the biggest launch in PlayStation history (GSMArena)",
          paragraphs: [
            "Five days out, the game topped $3.79 billion in day-one sales, the biggest launch in entertainment history across any medium. Sony says it is the biggest launch in PlayStation history — 32 years across five console generations. Cyberpunk 2's director just called it \"a technological and creative miracle\" (Creative Bloq); it holds a 99 Metascore.",
          ],
        },
        {
          type: "story",
          heading: "Why the US Army is about to blow up nearly 10,000 pounds of unstable explosives in Iowa (The Verge)",
          paragraphs: [
            "The Army is moving ahead with plans to detonate the nation's stockpile of lead azide at an ammunition plant in Middletown, Iowa, at approximately 9:00 AM CST on Wednesday. The Verge reached out to experts on what to expect and will keep its post updated.",
          ],
        },
      ],
    },
    {
      id: "C",
      heading: "C block — wrap",
      items: [
        {
          type: "bullets",
          lines: [
            "Thanksgiving at the box office (Deadline): Lionsgate's The Hunger Games: Sunrise on the Reaping is expected to take at least $70 million domestic between Wednesday and Sunday; Hexed is tracking a $75 million-plus worldwide opening; Focker-In-Law around $70 million worldwide.",
            "Marvel plans a Patrick Stewart tribute in Avengers: Doomsday (Deadline), the film set for release December 18. Anthony Russo recalled the actor's last day of filming: \"He was struggling with his health.\" A new Doomsday teaser shows previously unseen footage, including Doom facing off against two original Avengers (ComicBook.com).",
            "The iPhone 18e is reportedly getting a redesigned camera island (GSMArena, via Engadget, which says it has seen CAD images from a source who previously leaked accurate color details for the iPhone 17 and iPhone 18 Pro). Apple launched the iPhone 17e in March; Bloomberg's Mark Gurman has said the 18e should arrive in the February–March time frame.",
            "Oppo Find X10 Pro Max gets optimized Blackmagic Camera support (GSMArena) — the jointly optimized version with O-Log2 and Open Gate capture, promised for November, is now available.",
          ],
        },
        {
          type: "story",
          paragraphs: [
            "What to watch next: the House hearing date for Huang (Dec 1 per The Rundown, still unresolved across publications); the SEC accounting probe and the still-open foreign-intelligence investigation; whether the 31.5% bounce holds; PCE and the second Q3 GDP estimate land Wednesday, with markets closed Thursday for Thanksgiving and an early close Friday; Anthropic IPO totals still unresolved across publications ($81.3B / $93.5B / $119.5B in circulation); the Army detonation in Iowa Wednesday morning; and what FinCEN says next about the scope of its incident.",
          ],
        },
      ],
    },
    {
      id: "D",
      heading: "D block — weather",
      items: [
        {
          type: "story",
          paragraphs: [
            "Weather: West Palm Beach tonight, cloudy and 72 degrees, winds near three miles an hour, no rain falling — and a Flood Watch in effect from the National Weather Service (Eye, 10:00 PM EST).",
          ],
        },
      ],
    },
  ],
};
