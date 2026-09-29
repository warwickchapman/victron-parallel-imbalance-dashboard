# Changelog

All notable changes to this dashboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the dashboard package.

## Unreleased

### Corrected
- Restored the standalone histogram import to the pre-Warren three-page flow. It includes
  per-unit load bars, Parallel Balance tables, and 60-minute Load History graphs; the
  previously listed one-page import did not contain time-series data.
- Updated the README's version descriptions and file listing to distinguish the histogram
  import from the latest voltage-aware dashboard.

## [2.1.0] — 2026-09-29

### Added
- **AC output voltage per phase** tiles and a **phase voltage-imbalance %** readout.
- **Per-unit AC output voltage** in the per-unit readout list.
- **Per-unit voltage deviation flag**: when per-unit readings are available, a unit whose
  output voltage differs from its phase peers beyond `UNIT_V_WARN` / `UNIT_V_CRIT` is flagged
  for investigation. The flag alone does not diagnose a loose connection.
- **Imbalance alert banner** covering current-sharing, phase-voltage, and per-unit-voltage imbalance.

### Changed
- Per-phase layout: **PHASE LOAD gauge on the left**, bars centre, **per-unit readout list on the right**.
- **Enlarged unit fonts** for wall-display legibility.
- The repository's primary import now contains this version. The earlier histogram dashboard
  remains available as a separate, self-contained JSON import.

### Removed
- **Battery (DC-bus) voltage** tile and its MQTT subscription.

## [2.0.0] — 2026-09-29

### Added
- New **Inverter Load %** page (`/load`): per-unit load bars, phase arc gauges, KPI strip.
- **Current-sharing balance** per phase (lowest ÷ highest, spread ÷ average) on Output and Input,
  plus a **Worst Balance** KPI.
- **Imbalance heat gradient** on bars (green → red) with a **▲ hardest** flag.
- **Automatic rating detection** (nearest standard inverter class from observed peak).
- **Graph auto-ranging**: Load History Y-axis scales to the detected rating.

### Changed
- Whole dashboard re-skinned to the **Currently Amped dark** theme (shared across all pages).
- Original **Parallel Balance tables** and **Load History graphs** restyled dark (logic unchanged).
- `/page2` renamed from "graphic" to **Load History**.

## [1.0.0] — original

- **Parallel Balance** tables (per-unit AC in/out, Average/Lowest/Highest/Balance colour cells).
- **Load History** 60-minute per-unit load line graphs.
- Light "Default Theme".
