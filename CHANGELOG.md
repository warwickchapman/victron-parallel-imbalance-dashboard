# Changelog

All notable changes to this dashboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the dashboard package.

> The dashboard is the main deliverable. An **experimental, unsupported** native GX Touch view
> (Venus OS gui-v1 and gui-v2 QML) is included separately under `gx-touch/` for experimentation
> only — it is not supported and is wiped by firmware updates (see its README).

## [Unreleased]

### Added
- **Experimental native GX Touch add-on** under `gx-touch/` (gui-v1 and gui-v2 QML) for showing
  the imbalance view on the GX screen itself. Unsupported, firmware-update-fragile, bench-only —
  caveats in the README and the add-on's own READMEs.
- **Appearance control (Auto / Light / Dark)** — Auto follows each viewer's device; Light/Dark
  force the choice. All pages theme-aware; light mode uses white cards with darkened accent text.
- **Sample-rate slider** on the Load History page — set graph sampling from **1 s** (fine
  detail for commissioning) to **60 s** (normal logging), with a **Reset to 1 / min** button.
  To protect memory, the graph **window shortens at fast rates** (≈5 min at 1 s, up to 60 min at
  slower rates) and a hard point-cap applies. Time axis and footer follow the active rate/window.
  Caveat: real resolution is limited by how often Venus OS publishes (~1 s for power; sub-second
  is not guaranteed).

## [2.1.0] — 2026-09-29

### Added
- **AC output voltage per phase** tiles and a **phase voltage-imbalance %** readout.
- **Per-unit AC output voltage** in the per-unit readout list.
- **Loose-connection detection**: a unit whose output voltage deviates from its phase-siblings
  beyond `UNIT_V_WARN` / `UNIT_V_CRIT` is flagged (⚠) and raises a "check connection / retorque" alert.
- **Imbalance alert banner** covering current-sharing, phase-voltage, and per-unit-voltage imbalance.

### Changed
- Per-phase layout: **PHASE LOAD gauge on the left**, bars centre, **per-unit readout list on the right**.
- **Enlarged unit fonts** for wall-display legibility.

### Removed
- **Battery (DC-bus) voltage** tile and its MQTT subscription.

## [2.0.0] — 2026-09-29

### Added
- New **Inverter Load %** page (`/load`): per-unit load bars, phase arc gauges, summary tiles.
- **Current-sharing balance** per phase (lowest ÷ highest, spread ÷ average) on Output and Input,
  plus a **Worst Balance** tile.
- **Imbalance heat gradient** on bars (green → red) with a **▲ hardest** flag.
- **Automatic rating (spec) detection** — nearest standard inverter class from the observed
  peak (unit-count, phase and portal/instance detection were already in the original flow).
- **Graph auto-ranging**: Load History Y-axis scales to the detected rating.

### Changed
- Whole dashboard re-skinned to the **Currently Amped dark** theme (shared across all pages).
- Original **Parallel Balance tables** and **Load History graphs** restyled dark (logic unchanged).
- `/page2` renamed from "graphic" to **Load History**.

## [1.0.0] — original

- **Parallel Balance** tables (per-unit AC in/out, Average/Lowest/Highest/Balance colour cells).
- **Load History** 60-minute per-unit load line graphs.
- **Automatic detection** of VE.Bus portal ID, instance, unit count and phase configuration
  (Victron's interleaved device ordering) — no manual entry required.
- Light "Default Theme".
