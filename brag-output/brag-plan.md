# Brag Plan: SASA 할 일 (SASA To-do)

## What is this app?
A bilingual (Korean/English) offline-capable PWA a student built for their own homework and class schedule — it groups tasks by Today/Tomorrow/Next 7 days/Later and auto-calculates due dates from a weekly timetable, so picking a subject fills in "due the evening before its next class" by itself.

## The angle
Not a startup pitch — a proud little feature trailer for a tool built by one student, for exactly one student. The joke/charm is the craft-for-an-audience-of-one: a full neobrutalist design system, bilingual UI, dark mode, and a due-date calculator, all built so one person never has to guess when homework is due.

## Hook (first 2-3 seconds)
The app icon — nested cream/ink/tan squares with a hard drop shadow — SLAMS onto a cream background like a rubber stamp. "SASA" snaps in beside it in the pixel display font.

## Key moments (the middle)
- The New Task form: a subject chip gets tapped, and the "AUTO-FILLED DUE DATE" card slides in explaining the due date picked itself — "Next Physics class is Tue, due the evening before — Mon 23:59."
- The List screen: Today/Tomorrow/Next 7 days groups cascade in one row at a time, counts ticking up next to each group header, the urgent "Today" card highlighted.
- The Timetable grid: colorful subject chips get painted onto the 5-day × 9-period grid one cell at a time, the placed-count badge ticking up.

## Outro / punchline
The five-icon bottom nav (LIST · CAL · NEW · SET · ME) sweeps across, the app icon stamps down small in the corner, and the line settles: "Built for one student. Runs for one student." — with the v1.2.4 version stamp beneath it in the pixel font.

## User flow worth showing
Pick a subject on the New Task form → due date auto-fills to the evening before its next class → the task lands in the List screen's Today/Tomorrow/Next-7-days grouping. Secondary beat: painting subjects onto the Timetable grid.

## Tone
- Preset: app-store
- Creative direction: a proud little feature trailer for a homework app built for an audience of one
- Interpretation: clean, confident feature-card pacing with no joke to oversell — restraint over hype, smooth slides instead of hard cuts, the product's own craft (contrast-tuned colors, hard shadows, custom fonts) carries the video

## Format: vertical — 1080x1920
(This is a phone PWA — showing real screens reads far stronger in a phone-shaped frame than letterboxed into landscape.)
## Duration: 20s

## Visual identity (from the project)
- Background: `#f7f4ed` (cream) / dark mode `#1e1f22`
- Accent: `#c8a96b` (tan/gold) and `#8fa28a` (sage)
- Text: `#34170d` (ink)
- Display font: MG Rounded (headings, wordmark)
- Body font: MG Pixel (monospace accents — dates, version stamp, datetime inputs)
- Strongest visual element: the neobrutalist system itself — 3px ink borders + 7px hard offset drop-shadows on every card, chip, and button; the nested-square app icon

## Share copy (draft)
Built a homework tracker that does the due-date math for me — pick the class, it figures out when it's due.

## Audio direction
- Role: warm bed with tasteful, motion-matched SFX
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (60s, ~110 BPM), trimmed to the first ~20-22s
- Music treatment: starts at moderate volume under the hook/reveal, eases back slightly under the auto-due-date explainer card so its text reads clearly, then rises into the strong-cue cluster for the outro
- Music cue guidance: preset read from `cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.md`. Tempo ~109.96 BPM. Strong cues to target for the outro: 18.55s, 20.19s, 20.74s, 21.83s (nav sweep / icon re-stamp / tagline settle). Beat grid available every ~0.54s for Scene 4 (List rows) and Scene 5 (Timetable chips) — snap sequential reveals to every OTHER beat (~1.1s apart) so each row/chip stays legible, not every beat.
- Audio-reactive treatment: none to subtle — at most a gentle presence/glow breathe on hard-shadow cards tied to bass; no waveform-style effects, keep it restrained
- SFX posture: moderate, motion-matched, and in the visual's own language — a soft thick "stamp thud" (not a synthetic click) for the icon hook and the outro re-stamp; a lighter card-arrival snap for each sequential row/chip
- Audio-coupled moments: subject-chip tap in Scene 2, the clock icon settling in Scene 3, each List row arriving in Scene 4, each Timetable chip placing in Scene 5, the icon re-stamp in Scene 6
- Restraint rule: no beepy/gamey UI SFX — everything should sound like paper and stamped ink, matching the warm neobrutalist visual identity, never synthetic

## Storyboard

### Scene 1 — Hook — 2.5s
Cream background. The app icon (nested cream/ink/tan squares, hard ink shadow) slams down center-frame like a rubber stamp. "SASA" snaps in beside it in MG Rounded, ink on cream.
Sequential/interaction: none
Audio intent: a confident, physical thud that announces the product without overselling it
Audio-coupled idea: stamp thud synced to the icon's landing frame
Music: starts here, moderate volume, first beat-grid tick
Transition mood: hard, tone-appropriate → Scene 2

### Scene 2 — Reveal — 3s
Real UI: the New Task form. A cursor taps the "물리학/Physics" subject chip (atom icon). The chip highlights on.
Sequential/interaction: yes — simulated tap on the subject chip
Audio intent: a small, satisfying UI-select confirmation
Audio-coupled idea: soft chip-select tap on the cursor's tap frame
Music: steady under this scene
Transition mood: clean slide → Scene 3

### Scene 3 — Key moment 1 (auto due date) — 4s
The "AUTO-FILLED DUE DATE" card slides up from below the chip row, clock icon settling first, then the sentence: "Next Physics class is Tue, due the evening before — Mon 23:59." Full sentence holds on screen to be read.
Sequential/interaction: yes — clock icon settles, then the sentence commits
Audio intent: a small "aha" — quiet, confident, not surprised
Audio-coupled idea: soft settle tick on the clock icon frame
Music: eases back slightly so the sentence reads clean
Transition mood: soft crossfade → Scene 4

### Scene 4 — Key moment 2 (List screen alive) — 4s
Cut to the List screen. The "Today" group header arrives with its urgent-highlighted row, then "Tomorrow" and "Next 7 days" groups cascade in one row at a time below it, each group's count ticking up as its rows land.
Sequential/interaction: yes — groups and rows arrive one by one, top to bottom
Audio intent: build a light, satisfying rhythm — the list "filling up"
Audio-coupled idea: a light card-arrival snap per row, snapped to every other beat (~1.1s apart) so each stays readable
Music: rises slightly, rhythm becomes more present
Transition mood: clean slide → Scene 5

### Scene 5 — Key moment 3 (Timetable painting) — 3.5s
Cut to the Timetable grid. Colorful subject chips get tapped onto grid cells one at a time — sage, cream, tan colors filling in — the "N placed" badge in the header ticking up with each one.
Sequential/interaction: yes — simulated taps placing 4-5 chips into the grid in sequence
Audio intent: playful, tactile, satisfying — like fitting puzzle pieces
Audio-coupled idea: a light placement snap per chip tap, on every other beat
Music: builds toward the outro's strong-cue cluster
Transition mood: hard, confident cut → Scene 6

### Scene 6 — Outro / punchline — 3s
The five-icon bottom nav sweeps left to right (LIST · CAL · NEW · SET · ME). The app icon re-stamps small in the corner on a strong beat. The line settles: "Built for one student. Runs for one student." with the v1.2.4 version stamp in MG Pixel beneath it.
Sequential/interaction: yes — nav icons sweep in, then icon stamp, then line settles
Audio intent: land the whole thing with quiet confidence, not a fanfare
Audio-coupled idea: icon re-stamp thud aligned to the 20.19s/20.74s strong-cue pair; tagline settles on 21.83s
Music: peaks through the strong-cue cluster, then a clean fade-out
Transition mood: soft fade → end

**Music mood for this video:** upbeat but restrained — confident, warm, unhurried
**Audio summary:** A warm, mid-tempo bed opens on the icon stamp, eases back for the auto-due-date explainer so it reads clean, then builds through the List and Timetable sequences into a beat-aligned outro stamp and a clean fade — SFX throughout stay in the product's own "stamped paper" language rather than synthetic UI clicks.
