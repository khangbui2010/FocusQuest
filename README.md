# Focus Quest 🏰⚔️
> **Gamified Deep Work, Pomodoro & Website Blocker Chrome Extension (Manifest V3)**

Focus Quest transforms daily study and focused work into a civilization-building journey. Focus sessions grant Focus Coins and XP to level up your player profile and construct historical buildings on an expandable grid map.

---

## 🌟 Key Highlights

- **Chrome Extension Manifest V3 First:** Runs natively in Chrome with background Service Worker authority, declarativeNetRequest (DNR) website blocking, alarms, and badge updates.
- **Strict Allowlist Protection:** Blocks distractions automatically during active focus sessions. Only websites specified in the active Focus Profile are permitted.
- **Dual Focus Modes:**
  - **Countdown (Target / Pomodoro):** Choose a target duration (15m, 25m, 45m, 60m+). Locks a multiplier tier upfront (1.0x to 2.5x). Rewarded with 1.5 Coins/min and 5.0 XP/min upon 100% completion.
  - **Stopwatch (Open Flow):** Freeform flow mode. Requires at least 5 minutes to unlock full rewards (1.0 Coin/min and 3.0 XP/min) with dynamic duration multiplier.
- **Pomodoro Progression:** Structured focus cycles with customizable short breaks (1–20m), long breaks (5–60m), and cycle targets with audio cues.
- **Civilization Engine (Stone Age & beyond):**
  - **Zero Passive Income:** Coins and XP are exclusively earned through real-world focus sessions.
  - **Expandable Grid Map:** 8×8 starting grid (4 chunks of 4×4 = 64 cells) with adjacent 4×4 chunk expansion using **tiered arithmetic progression** (`cost(1) = 30`, increments `+10` rising `+5` per 5 expansions: `30, 40, 50, 60, 70, 80, 95, 110, ...`, `k = 20` is `355`, gated at `Player Level >= k + 2`) requiring `2` villagers & `60` Focus minutes (`expand` clearing job), pure-UI deterministic forest border, and post-job axe chop reveal.
  - **Building Categories, Construction Crew & FIFO Queue (`Stage 5C-1` + `Villager V5.2` + `Milestone 5E-1`):**
    - `DECORATIVE`: Campfire (`4`, builds instantly `0 crew / 0m`) and Ancient Totem (`8`, `1 crew / 60m`).
    - `FOCUS_SUPPORT`: Unlocks statistics and focus insights (`Elder's Hut` `20`, `2 crew / 120m`), and anchors villager housing (**`Rock Shelter`**, `stone_age_study_cave`, `12`, `1 crew / 60m`: 3×3 footprint, max 1 per map, upgradeable Lv. 1–5 for 2–10 recruited villager capacity).
    - `ECONOMY_EFFECT`: Grants additive CoinBonus percentages (`Foraging Post` `15`, `+2%/lv`, `1 crew / 60m`; `Primitive Granary` `30`, `+3%/lv`, `2 crew / 120m`; upgradeable up to Lv. 5 via `UPGRADE_BUILDING`, Build Limit: 4 per type; max Stone Age build+upgrade total `3,907` Coins).
    - **Focus-Only Construction Progress (`jobs.ts` & Schema v6 `v6_constructionJobsSchema.ts`):** All non-instant builds, upgrades (`L→L+1`: `1` crew `L<=2` / `2` crew `L>=3`, `5×L` min), and land clearings enter a queue (max `4` concurrent `ACTIVE` jobs bounded by total villagers) with pre-session priority assignment (`Assign Jobs` / `assignJobsWithSchedule` / `autoContinueJobs` on `TimerView` & `SessionSnapshot`) or automatic FIFO fallback. Persisted progress advances strictly in integer seconds upon eligible `COMPLETED` Focus sessions (`advanceJobs`), with cancellation refunds (`100%` unstarted / `50%` started) and pure-UI `1s` countdown overlays (`ClockTileIcon`, `ConstructionFence` 4-stake perimeter ribbons, upgrade scaffolding, and 4-stage blueprint sprites on Map; `1–4` equal work sub-scenes with distinct villagers and focus-active tools in `FocusSceneArea`). Under-construction buildings grant 0 bonuses/capacity until completed.
  - **Founder Villager, Role Buffs & Pure Era Rules (`Villager V2–V5.2` + `5E-1`):** First-time map visit prompts a permanent free **Founder Villager** (`SELECT_FOUNDER` via `FounderPickerModal`: `crafter | elder | woodworker`, consumes 0 Coins and 0 Rock Shelter capacity slots while counting toward total crew and the `round(25 × 1.35^n)` recruit cost curve). Recruited villagers unlock additive buffs (**Crafter** `+5%` CoinBonus cap `+40%`, **Woodworker** `-5%` expansion discount cap `-40%` while preserving `k+2` level gate, **Elder** `-6%` upgrade discount cap `-30%`, **Complete Tribe** `+10%` → `+150%` Stone Age ceiling), wander unlocked tiles (`villagerWander.ts`), and animate inside `FocusSceneArea`. Pure `eraRules.ts` (`STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`) gates progression at all 3 villager roles, `3` completed land expansions, `Lv.9`, `500` focus mins, and Lv.5 Rock Shelter/Economy floors = `4,407` Coins; Era switching remains deferred to `5C-2`.
- **Focus Music Player (MV3 Offscreen Streaming):** Streams curated tracks from the online `FocusQuest-LOFI-archive` catalog through a Chrome Offscreen Document (`Chrome >= 116`), persisting playback position past Chrome's 30s audio idle cutoff with a session-scoped mini-player and expandable bottom sheet.
- **Map-First 5-Tab Popup & Analytics Engine (`Stage 5c`):** Compact `Quests | Focus | Map | Awards | Stats` bottom navigation (hidden inside active/post-focus sessions until Exit), upgraded `StatsView` (`Day | Month | Year` navigation, custom SVG `StatsBarChart`, and `Focus Streak` gated by `Elder's Hut` `FOCUS_STAT_UNLOCK`), and half-up 2-decimal UI display (`formatRewardAmount`) preserving full IEEE-754 precision in storage.
- **Daily & Weekly Quest Pool (`Stage 2b`, `Stage 5c`, `Milestone 5D-1`):** 3-slot Daily (`9` quests, fixed cap `40C · 100XP`) & 3-slot Weekly (`10` quests, fixed cap `150C · 370XP`) pool with deterministic non-repeating rotation at midnight / Monday (`hashQuestSeed` + `selectQuestsForPeriod`, zero user reroll), manual claim (`CLAIM_QUEST_REWARD`), `Navbar` unclaimed badge, slot/Hard tags, Quest Streak (zero passive Coins), Schema v5 migration (`v5_questPoolSchema`), and atomic Session-Quest settlement under `StorageMutex`.
- **Full EN/VI Localization & MV3 CSP Compliance (`Stage 6+7`, `Stage 5C-1`, `Villager V2–V5.2`, `CLEANUP-1`, `5D-1`, `5E-1`, `5E-2`):** `689`-key EN/VI dictionary parity enforced by static `t(...)`/`translate(...)` key-usage tests, dynamic `RewardHelpModal`, all 7 Chrome notification paths, `128` structured `ErrorCode`s with technical error sanitization (`errorTranslator.ts`), Chrome `_locales`, and CSP-safe `blocked.html` + `blocked.js`.
- **Concurrency & Transaction Safety:** All mutations execute inside atomic critical sections guarded by `StorageMutex` with rollback compensation.

---

## 📐 Economic Rules

| Metric | Countdown Mode | Stopwatch Mode |
|---|---|---|
| **Base Coins** | 1.5 Coins / min | 1.0 Coin / min |
| **Base XP** | 5.0 XP / min | 3.0 XP / min |
| **Minimum Threshold** | 100% of target duration | 5 minutes |
| **XP Rule** | Completely unaffected by CoinBonus | Completely unaffected by CoinBonus |
| **CoinBonus Formula** | `durationMinutes × 1.5 × tierMultiplier × (1 + totalCoinBonus)` | `durationMinutes × 1.0 × tierMultiplier × (1 + totalCoinBonus)` |

### Multiplier Tiers
- Under 30 min (< 30 min): **×1.0**
- 30–59 min: **×1.2**
- 60–89 min: **×1.4**
- 90–119 min: **×1.6**
- 120–149 min: **×1.8**
- 150–179 min: **×2.0**
- 180+ min: **×2.5**

---

## 🛠️ Tech Stack

- **Runtime:** Chrome Extension Manifest V3 (Service Worker, declarativeNetRequest, Alarms, Storage).
- **UI Framework:** React 19, TypeScript 7.
- **Styling:** Tailwind CSS 4.
- **Bundler:** Vite 8.
- **Test Runner:** Node.js native test runner (`tsx --test`).

---

## 🚀 Development & Testing

```bash
# Install dependencies
npm install

# Start local interactive dev preview (Port 3000)
npm run dev

# Run comprehensive test suite (725/725 PASS — 0 failures)
npm test

# Typecheck and lint codebase (0 TypeScript errors)
npm run lint

# Build extension artifacts (outputs to dist/)
npm run build
```

> **Verification scope:** Automated tests execute on Node.js (`tsx --test`) using React SSR (`renderToString`), mock 2D canvas context, and mock Chrome adapters for background services. Previously completed milestones (`UX-1`–`UX-6`, `UX-5` terrain canvas, `UX-5.1` persistent camera, `LOFI-1`/`1b`/`2`, and `Milestone 5B.5` stages `1a`–`7` including `2b`, `5c`, `6+7`) have been verified and accepted in unpacked Chrome (`>= 116`). **Stage 5C-1**, **Milestone Villager V2–V5.2**, **CLEANUP-1**, **Milestone 5D-1 (Quest Pool)**, **Milestone 5E-1/1b/1c**, and **Milestone 5E-2 (Job Assignment & Multi-Site Focus Scene)** (`725/725 PASS`, `npm run lint` `0` errors, Vite build **PASS**) await visual/runtime verification in unpacked Chrome.

---

## 🗺️ Roadmap

- **Milestone 5C — Stage 5C-2 Era Progression:** Advance civilization progression from the Stone Age into the **Bronze Age** and subsequent historical eras (currently paused awaiting sprites/assets).
- **Awards System:** Implement achievement tracking and milestones to replace the remaining `Awards` tab `"Coming soon"` placeholder (`Quests`, `Stats`, `5E-1`, and `5E-2` are complete).

---

## 📦 Loading in Chrome

1. Build the extension: `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `/dist` directory.

---

## 🎨 Assets & Credits

- **CC0 Sprite Packs:** [Kenney Tiny Town (v1.1)](https://www.kenney.nl) & [Kenney Tiny Dungeon (v1.0)](https://www.kenney.nl) under Creative Commons Zero (CC0 1.0).
- **Stone Age Building Pixel Art:** Project-original SVG pixel-art sprites constrained to the Tiny Town palette.
- **Streamed Focus Music (`https://khangbui2010.github.io/FocusQuest-LOFI-archive/`):**
  - Music by Purrple Cat ([purrplecat.com](https://purrplecat.com/)), licensed under `CC-BY-4.0`: https://creativecommons.org/licenses/by/4.0/
  - Music by HoliznaCC0 ([Public Domain Lofi on FMA](https://freemusicarchive.org/music/holiznacc0/public-domain-lofi)), licensed under `CC0-1.0`: https://creativecommons.org/publicdomain/zero/1.0/
  - `whisper` by ikkun (ex. Barradeen) ([SoundCloud](https://soundcloud.com/ikkunwastaken)), licensed under `CC-BY-SA-3.0`: https://creativecommons.org/licenses/by-sa/3.0/deed.en_US
  - Track metadata is fetched dynamically from [`tracks.json`](https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json); see [Music Credits (`CREDITS.md`)](./CREDITS.md).
- Full tile mapping and license details: see [Assets & Sprite Credits (`public/assets/sprites/CREDITS.md`)](./public/assets/sprites/CREDITS.md).

