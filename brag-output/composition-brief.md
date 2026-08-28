# Hyperframes Composition Brief: SASA 할 일 (SASA To-do)

## Objective
Create a short launch-style brag video for SASA 할 일 — a bilingual homework/class-schedule tracker one student built for themselves.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: vertical — 1080x1920
- Duration: 20 seconds

## Source Material
- Project root: `/Users/studyhard/Claude/Task Manager`
- Primary files read: `src/styles/tokens.css`, `src/App.tsx`, `src/screens/List.tsx`, `src/components/TaskRow.tsx`, `src/screens/Timetable.tsx`, `src/components/TaskForm.tsx`, `src/components/BottomNav.tsx`, `src/lib/subjects.ts`, `public/icon-512.png`, `index.html`, `package.json`
- Product name: SASA 할 일 (SASA To-do)
- Tagline / strongest claim: "Built for one student. Runs for one student."
- Key UI or visual moment to recreate: the "AUTO-FILLED DUE DATE" card on the New Task form — picking a subject auto-computes "due the evening before its next class"
- Copy that must appear verbatim:
  - "SASA"
  - "Next Physics class is Tue, due the evening before — Mon 23:59."
  - "Built for one student. Runs for one student."
  - "v1.2.4"

## Creative Direction
- Tone preset: app-store
- Creative direction: a proud little feature trailer for a homework app built for an audience of one
- Interpretation: clean, confident feature-card pacing, restraint over hype, smooth slides instead of hard cuts — the product's own neobrutalist craft carries the video
- Angle: not a startup pitch — a proud little feature trailer for a tool built by one student, for exactly one student. The charm is the craft-for-an-audience-of-one: a full bilingual neobrutalist design system with a due-date calculator, built so one person never has to guess when homework is due.
- Hook: the app icon SLAMS onto a cream background like a rubber stamp; "SASA" snaps in beside it.
- Outro / punchline: "Built for one student. Runs for one student." over the v1.2.4 version stamp.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign — recreate the app's real neobrutalist system (hard ink borders, offset drop-shadows), not a generic clean-app look

## Visual Identity
- Background: `#f7f4ed` (cream) / dark mode `#1e1f22`
- Text: `#34170d` (ink)
- Accent: `#c8a96b` (tan/gold), `#8fa28a` (sage)
- Display font: MG Rounded (headings, wordmark) — fallback: a rounded geometric sans (e.g. Baloo 2 / Fredoka) if the font file isn't embeddable
- Body font: MG Pixel (monospace accents — dates, version stamp) — fallback: a pixel/monospace font (e.g. Press Start 2P for stamp accents, or a plain monospace for dates) if not embeddable
- Visual references from the project: nested-square app icon; 3px ink borders + 7px hard offset drop-shadows on every card/chip/button; List screen Today/Tomorrow/Next-7-days grouping; Timetable 5-day×9-period grid with colorful subject chips; 5-icon bottom nav (LIST · CAL · NEW · SET · ME)

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 2.5s — app icon stamps down center-frame; "SASA" snaps in
2. Reveal — 3s — New Task form, cursor taps the Physics subject chip
3. Key moment 1 (auto due date) — 4s — "AUTO-FILLED DUE DATE" card slides up, clock icon settles, full sentence reads
4. Key moment 2 (List screen alive) — 4s — Today/Tomorrow/Next-7-days groups cascade in, counts tick up
5. Key moment 3 (Timetable painting) — 3.5s — subject chips get placed onto the grid one at a time, "N placed" badge ticks up
6. Outro / punchline — 3s — bottom nav sweeps in, icon re-stamps small, tagline + version settle

## Audio
- Audio role: warm bed with tasteful, motion-matched SFX
- Audio arc: moderate under the hook/reveal, eases back under the due-date explainer so its text reads clean, rises through List/Timetable, peaks into a beat-locked outro stamp, then a clean fade
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (60s, ~109.96 BPM), trimmed to the first ~20-22s
- Music treatment: start at moderate volume (~0.35) under scene 1, ease to ~0.25 under scene 3's explainer sentence, rise back to ~0.35-0.4 through scenes 4-5, peak through the scene 6 strong-cue cluster, then fade out over the last ~1s
- Music cue guidance: bundled preset at `assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.json` (and `.md`). Tempo ~109.96 BPM. Strong-cue candidates for the scene 6 outro: 18.55s, 20.19s, 20.74s, 21.83s — lock the icon re-stamp and tagline settle to 1-2 of these within ±0.15s. Beat grid available every ~0.54s for scenes 4 (List rows) and 5 (Timetable chips) — snap sequential reveals to every other beat (~1.1s apart) so each stays readable.
- Audio-reactive treatment: subtle — a gentle presence/glow breathe on hard-shadow cards tied to bass/RMS; no waveform, equalizer, or particle visuals
- Audio-coupled moments:
  - Scene 1 — icon landing — stamp thud on the icon's landing frame
  - Scene 2 — subject-chip tap — soft chip-select click
  - Scene 3 — clock icon settling — soft settle tick
  - Scene 4 — each List row arriving — light card-arrival snap, every other beat
  - Scene 5 — each Timetable chip placing — light placement snap, every other beat
  - Scene 6 — icon re-stamp — stamp thud beat-locked to a strong cue; tagline settle shortly after
- SFX selection guidance: everything should sound like paper and stamped ink — prefer `impact/impactSoft_medium_*` or `impact/impactWood_*` for the stamp thuds (not a bell/metal sound), `interface/drop_*` or `casino/card-place-*` for row/chip arrivals, `interface/click_*` or `ui/mouseclick1` for the simulated subject-chip tap. Keep levels in the app-store range (~0.65-0.75).
- SFX analysis guidance: read `skills/brag/assets/sfx/sfx-analysis.md` (or the installed-skill path) before final selection; prefer low/medium HF-risk files for the repeated row/chip snaps.
- Exact SFX choice: Hyperframes should choose exact filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the chosen music and any selected SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. `/brag` is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (the New Task auto-due-date card, the List screen grouping, and the Timetable grid are the three centerpiece scenes — recreate them faithfully in HTML/CSS, not as abstract diagrams).
- Keep all text readable in the final render — respect the reading-time floors from `brag-plan.md`.
- Keep the video within 15-25 seconds (target 20s per the storyboard).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, scene pacing, or the product story. Use only 1-3 strong-cue locks in this 20s video.
- Use local assets for audio; run `hyperframes check` before render — it is brag's single gate.
