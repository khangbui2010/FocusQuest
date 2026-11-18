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
  - **Expandable Grid Map:** 8×8 starting grid (4 chunks of 4×4 = 64 cells) with adjacent 4×4 chunk expansion (`cost(k) = round(60 × prod min(1.5, 1.25 + 0.01×(i-1)))`, gated at `Player Level >= k + 2`), pure-UI deterministic forest border & post-commit axe chop reveal.
  - **Building Categories:**
    - `DECORATIVE`: Aesthetic and cultural monuments (Campfire, Ancient Totem).
    - `FOCUS_SUPPORT`: Unlocks statistics and focus insights (Elder's Hut, Meditation Cave).
    - `ECONOMY_EFFECT`: Grants additive CoinBonus percentages to focus session rewards (+2%, +3% per level).
- **Focus Music Player (MV3 Offscreen Streaming):** Streams curated tracks from the online `FocusQuest-LOFI-archive` catalog through a Chrome Offscreen Document (`Chrome >= 116`), persisting playback position past Chrome's 30s audio idle cutoff with a session-scoped mini-player and expandable bottom sheet.
- **Map-First 5-Tab Popup & Analytics Engine:** Compact `Quests | Focus | Map | Awards | Stats` bottom navigation (hidden inside active/post-focus sessions until Exit), pure Gregorian Day/Month/Year Stats aggregator with custom SVG bar charts, and half-up 2-decimal UI display (`formatRewardAmount`) preserving full IEEE-754 precision in storage.
- **Quest Engine & Schema v3 Foundation (Stage 2a):** Pure Daily & Weekly Quest domain engine (`src/core/quests/`) with fixed flat rewards, streak tracking, anti-clock-rollback ledger, and idempotent v3 storage migration (wiring into background/UI scheduled for Stage 2b & 5c).
- **Full EN/VI Localization & MV3 CSP Compliance:** 100% EN/VI translations across UI, Chrome notifications, backend error mapper, Chrome `_locales`, and CSP-safe `blocked.html` + `blocked.js`.
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

# Run comprehensive test suite (574/574 tests)
npm test

# Typecheck and lint codebase
npm run lint

# Build extension artifacts (outputs to dist/)
npm run build
```

> **Verification scope:** Automated tests execute on Node.js (`tsx --test`) using React SSR (`renderToString`) for UI components and mock Chrome adapters for background services. Core runtime flows—the `400×600` popup (5-tab navigation, grid map, dark forest overlay, axe chop reveal animation), `blocked.html` with DNR rules, `chrome.i18n` & `manifest.json`, Offscreen Audio streaming (including Pause > 30s recovery), and remote music catalog fetching—have additionally been manually verified end-to-end in unpacked Chrome (`>= 116`).

---

## 🗺️ Roadmap

- **Quest Integration & UI (`Stage 2b` → `Stage 5c`):** Atomically connect the Quest Engine into `SessionCoordinator` / `MessageHandler` (`GET_QUEST_STATE`, `CLAIM_QUEST_REWARD`), complete the interactive `QuestView` and Day/Month/Year `StatsView` (`Quests` and `Awards` tabs currently show `"Coming soon"` placeholders).
- **Awards System:** Implement achievement tracking and milestones to replace the `Awards` tab placeholder.
- **Milestone 5C — Era Progression & Upgrades:** Enable `UPGRADE_BUILDING` (unlocking the currently locked `"Milestone 5C"` upgrade action) and advance civilization progression into the **Bronze Age** and subsequent historical eras.

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

