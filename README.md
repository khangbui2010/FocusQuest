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
  - **Expandable Grid Map:** 8×8 starting grid (4 chunks of 4×4 = 64 cells) with adjacent 4×4 chunk expansion (`cost(k) = round(60 × 1.25^(k-1))` under `LAND_EXPANSION_RATIO_CAP = 1.25`, `k = 20` is `4,163`, gated at `Player Level >= k + 2`), pure-UI deterministic forest border & post-commit axe chop reveal.
  - **Building Categories & Rebalanced Economy (`Stage 5C-1` + `Villager V5`):**
    - `DECORATIVE`: Aesthetic and cultural monuments (Campfire `8`, Ancient Totem `15`).
    - `FOCUS_SUPPORT`: Unlocks statistics and focus insights (`Elder's Hut` `40`), and anchors villager housing (`Meditation Cave` `25`: 3×3 footprint, max 1 Cave per map, upgradeable Lv. 1–5 for 2–10 villager capacity, zero passive income/bonuses).
    - `ECONOMY_EFFECT`: Grants additive CoinBonus percentages to focus session rewards (`Foraging Post` `30`, `+2%/lv`; `Primitive Granary` `60`, `+3%/lv`; upgradeable up to Lv. 5 via `UPGRADE_BUILDING`, Build Limit: 4 per building type; max Stone Age build+upgrade total `7,845` Coins).
  - **Villager Role Buffs, Map Wandering, Dynamic Focus Scene & Pure Era Rules (`Villager V2–V5`):** Recruit villagers (`elder`, `crafter`, `woodworker`, cost `round(40 × 1.35^n)`), unlock additive buffs (**Crafter** `+3%` CoinBonus cap `+30%`, **Woodworker** `-5%` land expansion discount cap `-40%` while preserving `k+2` level gate, **Elder** `-4%` building upgrade discount cap `-30%`, **Complete Tribe** `+5%` CoinBonus → theoretical Stone Age ceiling **`+135%`**), watch them wander unlocked map tiles (`villagerWander.ts` + `useVillagerWander.ts`), and see only actually constructed buildings (max 1 sprite per type) + up to 6 recruited villagers animated inside `FocusSceneArea`. Pure `eraRules.ts` (`ERA_LEVEL_RULES` with provisional flags for `IRON_AGE..INTERPLANETARY`, `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS` floor `4,303 + 3,500 = 7,803`) prepares 3h/day 9–14 day progression; Era switching remains deferred to `5C-2`.
- **Focus Music Player (MV3 Offscreen Streaming):** Streams curated tracks from the online `FocusQuest-LOFI-archive` catalog through a Chrome Offscreen Document (`Chrome >= 116`), persisting playback position past Chrome's 30s audio idle cutoff with a session-scoped mini-player and expandable bottom sheet.
- **Map-First 5-Tab Popup & Analytics Engine (`Stage 5c`):** Compact `Quests | Focus | Map | Awards | Stats` bottom navigation (hidden inside active/post-focus sessions until Exit), upgraded `StatsView` (`Day | Month | Year` navigation, custom SVG `StatsBarChart`, and `Focus Streak` gated by `Elder's Hut` `FOCUS_STAT_UNLOCK`), and half-up 2-decimal UI display (`formatRewardAmount`) preserving full IEEE-754 precision in storage.
- **Daily & Weekly Quests (`Stage 2b` + `Stage 5c`):** Interactive `QuestView` (4 card states, manual claim via `CLAIM_QUEST_REWARD`, unclaimed badge on `Navbar`, live reset countdowns, Quest Streak with zero passive Coins), `QuestCoordinator`, Schema v4 migration (`v3_questsSchema` + `v4_villagersSchema`), and atomic Session-Quest settlement under `StorageMutex` with rollback compensation.
- **Full EN/VI Localization & MV3 CSP Compliance (`Stage 6+7`, `Stage 5C-1`, `Villager V2–V5`, `CLEANUP-1`):** `582`-key EN/VI dictionary parity enforced by static `t(...)`/`translate(...)` key-usage tests, dynamic `RewardHelpModal`, all 7 Chrome notification paths, `113` structured `ErrorCode`s with technical error sanitization (`errorTranslator.ts`), Chrome `_locales`, and CSP-safe `blocked.html` + `blocked.js`.
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

# Run comprehensive test suite (693/693 PASS — 0 failures)
npm test

# Typecheck and lint codebase (0 TypeScript errors)
npm run lint

# Build extension artifacts (outputs to dist/)
npm run build
```

> **Verification scope:** Automated tests execute on Node.js (`tsx --test`) using React SSR (`renderToString`), mock 2D canvas context, and mock Chrome adapters for background services. Previously completed milestones (`UX-1`–`UX-6`, `UX-5` terrain canvas, `UX-5.1` persistent camera, `LOFI-1`/`1b`/`2`, and `Milestone 5B.5` stages `1a`–`7` including `2b`, `5c`, `6+7`) have been verified and accepted in unpacked Chrome (`>= 116`). **Stage 5C-1**, **Milestone Villager V2–V5**, and **CLEANUP-1** (`693/693 PASS`, `npm run lint` `0` errors, Vite build **PASS**) await visual/runtime verification in unpacked Chrome.

---

## 🗺️ Roadmap

- **Milestone 5C — Stage 5C-2 Era Progression:** Advance civilization progression from the Stone Age into the **Bronze Age** and subsequent historical eras (`Stage 5C-1` Economy building upgrades are implemented and awaiting Chrome acceptance).
- **Awards System:** Implement achievement tracking and milestones to replace the remaining `Awards` tab `"Coming soon"` placeholder (`Quests`, `Stats`, and Milestone `5B.5` localization/polish are complete).

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

