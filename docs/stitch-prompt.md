# Stitch prompt: NouGenNews, the digital newspaper

Paste everything below the line into Stitch (Google). Generate the screens in the order listed, one prompt per screen if Stitch prefers shorter inputs; the "Shared design language" section goes first every time.

---

## What this is

Design NouGenNews, a **digital newspaper** for desktop (a 1440x900 Electron window, resizable down to 1000 wide). It is not a feed reader and not a social timeline. It is an edition: a front page with a lead story, secondary stories, and print-style sections, built from live sources (film and TV trade press, comics, anime, cartoons, AI art, AI, tech, phones, games). Stories open in full inside the app, videos play in the story, and links open in a side browser, never in a pop-up window. The same news also appears inside a media-library app and on a public website, so this app is the reference design the others borrow from.

The reader is someone who owns a large personal video library. Stories about titles they own are lifted to the front and tagged "In your library".

## Shared design language

- **Black liquid glass.** The page is pure black (#000000). Panels are thin translucent glass: white at 5-9% opacity over black, a 1px bright top edge (inset highlight at about 20% white), a soft inner shadow, and a background blur with slight saturation. Glass is used on a few surfaces only (the reader bar, menus, the sources drawer, the hero frame). Story cards stay flat translucent with a hairline border.
- **Apple-style glass (the finish on those glass surfaces).** Treat each glass panel as a lens, not a frosted sheet: a bright specular rim that is strongest along the top and left edges and fades around the corner, light refraction that gently bends whatever is behind the panel (video frames and thumbnails flow slightly at the edges), and a tint that adapts, so the panel reads a touch lighter over a bright poster and a touch darker over black. Keep it subtle and physical; the text on it must stay crisp and fully legible.
- **Paper grain.** A very faint monochrome film grain over the whole black page, about 3-4% opacity, static (not animated), sitting behind all content so it never touches text, images or video. It should read as newsprint under the black, not as noise or dirt. It turns off with reduced transparency.
- **One accent: amber #e8b86d.** Used for the active tab, the lead-story button, focus rings, the "In your library" tag and the live dot. Nothing else is colored. Text is warm off-white #f2eee6, secondary #bdb8ad, muted #8f8a80.
- **Shape:** 4px corner radius everywhere. No gradients. No glow. No neon. No emoji in headings or body text; small source icons are allowed.
- **Type:** a confident newspaper hierarchy on a system sans stack. Masthead and lead headline large and heavy with tight tracking; section labels small, uppercase, letter-spaced; body 16px with 1.65 line height and a 65-character reading measure; metadata in monospace (Consolas) at 11-12px.
- **Contrast:** all body text at least 4.5:1 on its surface. Visible focus ring (2px amber, 2px offset) on every control. Thin matte scrollbars (8px, translucent white thumb, no track).
- **Motion:** 120ms ease-out only. Honour reduced motion and reduced transparency: glass falls back to flat near-opaque black.
- **Density:** generous negative space. One command row, one source strip, then content. Nothing wraps into a third row.

## Screens

### 1. Front page (the edition)
- **Menu bar** (28px, black): File, View, Configuration, Help at the left; a small "Restart" button at the right. Menus show shortcut hints right-aligned in monospace.
- **Command row:** hamburger button, a green live dot with the masthead "News Wire", a "Brief me" button and a "Quick Brief" button on the left; on the right a language switch (Original, Kreyol, English, Espanol), a search box with a "/" hint, the edition time, and a Sync button.
- **Source strip:** one horizontally scrolling row of compact chips, each with a small icon, the source name and a story count. The active chip has an amber border.
- **Breaking ticker** (new): a slim marquee under the source strip, a "BREAKING" label in amber caps at its left edge and the headlines scrolling right to left in uppercase, separated by small amber dots. It is driven by the edition's top stories, with stories that match the reader's library first (each with a small amber heart). It loops without a visible seam, pauses on hover and on keyboard focus, stops entirely under reduced motion (showing a static list of the first three), and clicking a headline opens that story in the reader. It should echo the ticker on nougenai.com/news so the app and the site feel like one publication.
- **Lead story block:** a 16:9 hero on the left (poster with a large play button, "Video" tag at top-left) and on the right the source, age and read time in monospace, a very large headline, a four-line dek, the byline, then buttons: Read (amber, with Enter hint), Play (Space), Listen (L), Open source in app. A previous/next pair and "1 / 5" counter below.
- **Secondary strip:** five thumbnail cards under the lead with two-line headlines and a thin progress bar on the active one.
- **Section blocks below:** TV & Film, Comics & Anime, AI, Tech, Games. Each has an uppercase label with a hairline rule, then a three-column grid of flat story cards (thumbnail, source in amber caps, headline, age, read time, optional "Video" tag, optional "In your library" tag with a small heart).
- **Footer key bar:** one monospace line of key hints (J/K, Enter, arrows, Space, L, T, 1-9, /, R) and a "? help" button.

### 2. Reader (a story open)
Split view: a narrow story list on the left (flat cards, the selected one outlined in amber), the article on the right. Article: source and age, tag chips, huge headline, byline, an embedded video at the top when the story has one (16:9, with its own native controls and no autoplay), then the full text at a 65-character measure with generous paragraph spacing, pull quotes in a heavier weight, inline images with captions in monospace. A glass reader bar is pinned at the bottom with Listen, Translate, Open source in app, and key hints (J next, K prev, Esc back).

### 3. Sources drawer
A glass drawer sliding from the left, below the menu bar, about 320px wide. A file-explorer style tree: "All Wire" and "In your library" at the top with counts; then collapsible folders (TV & Film, Comics & Anime, AI, Tech, Games) each holding its sources with an icon, name and monospace count; the active leaf has an amber left edge. A Settings folder at the bottom: Glass blur toggle, Autoplay videos in stories toggle (off by default), and a segmented translation control. Esc closes it.

### 4. Menu open
The View menu open under the menu bar: Sources and settings (M), Next story (J), Previous story (K), Play lead video (Space), Listen (L). Near-opaque black glass, 4px radius, amber highlight on the hovered row, thin separators between groups.

### 5. In-app browser sidebar
When a link is opened, a panel takes the right 46% of the window: a bar with Back, the URL in monospace (ellipsized), and Close (Esc); below it the page. The news stays visible and usable on the left.

### 6. Library view
"In your library" selected: the same front-page structure filtered to stories that mention a title the reader owns. Each story shows which title matched ("Matches: Dune") in monospace under the headline. An empty state explains, in one sentence, that titles come from the media library and offers a button to open the library file location.

### 7. Keyboard help
A centered glass dialog titled "Keyboard" with a two-column list: key in amber monospace, action in plain text. Rows: J/K, Enter, left/right arrows, Space, L, T, 1-9, /, R, M, ?, Esc. "Press Esc or click outside to close."

### 8. States
Loading (skeleton cards, no spinners), a source that failed (small "ERR" in place of its count, the rest unaffected), offline (a single quiet banner above the command row), and a story with no full text (a clear "Read full article" button that fetches it).

## Behaviour notes for the designer
- Everything is reachable by keyboard; show the key next to each primary action.
- Videos never start by themselves; a poster with a play button stands in until the reader clicks.
- Nothing opens an outside window. Links go to the side browser.
- Copy is plain and editorial. Refer to the reader as "you"; never use a personal name anywhere in the interface.

## Deliverables
Show the paper grain and the Apple-style glass rim in close-up on one sheet (grain on and off, a glass panel over a bright poster and over plain black), and the ticker in three states (scrolling, hovered and paused, reduced motion).

Desktop screens 1-8 at 1440x900, plus screen 1 and screen 2 at 1000x700. Include the component set (menu bar, command row, source chip, ticker, hero, story card, section label, reader bar, drawer tree, menu, sidebar bar, key hint) on one sheet, and export the color, spacing and type tokens.
