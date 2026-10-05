# Victron Parallel Imbalance Dashboard (web dashboard only)

A FlowFuse Dashboard 2.0 (Node-RED, Venus OS Large) for monitoring **parallel Victron VE.Bus
inverter/charger systems** — per-unit load sharing, current-sharing balance, AC output
voltages, and live imbalance alerting, in the Currently Amped dark theme.

**This package is the web dashboard only.** It does **not** touch the Venus OS GUI / GX Touch
screen — it adds no QML, no root changes, nothing to the device firmware. Everything runs
inside Node-RED and is viewed in a browser (LAN or VRM) or on a networked wall tablet. Safe to
deploy on client systems; nothing here is affected by Venus OS firmware updates.

![Dashboard](screenshot.jpg)

---

## What it shows

Importing the flow adds/updates three pages on the **"My Dashboard"** base:

| Page | Path | Description |
|------|------|-------------|
| **Inverter Load %** | `/load` | Per-unit load bars, phase gauges, balance, voltages, alerts |
| **Parallel Balance** | `/pb` | Per-unit AC in/out tables with balance colour cells |
| **Load History** | `/page2` | Per-unit load line graphs with a 1–60 s sample-rate slider (auto-ranging) |

### Highlights
- **Light / Dark / Auto appearance** — Auto follows each viewer's device; Light/Dark can be forced.
- **Per-unit load bars** as a percentage of each unit's configured maximum, grouped by phase.
- **Imbalance heat gradient** — green (lightest) → red (hardest), scaled by the real spread, with a **▲ hardest** flag per phase.
- **Current-sharing balance** per phase (lowest ÷ highest) on **Output and Input**, plus a **Worst Balance** tile.
- **Per-unit AC output voltage** with **loose-connection detection** (a unit drifting from its phase-siblings is flagged for a "check connection / retorque").
- **Imbalance alert banner** — fires on current-sharing, phase-voltage, or per-unit-voltage imbalance.
- **Sample-rate slider** (1–60 s) on the Load History page, with **Reset to 1 / min**; the window auto-shortens at fast rates to protect memory.
- **Automatic detection** — unit count, phase configuration and portal/instance come from the original flow; **per-unit rating** detection is added here, and the graphs auto-range to it.

---

## Install

1. In Node-RED: **menu → Import**.
2. Select **`victron-parallel-imbalance.json`**.
3. **Import → Deploy.**

The flow reuses the original node IDs, so Node-RED offers to **replace** the existing Parallel
Balance nodes — this is intended and yields one unified dashboard. Let it replace (don't choose
"import a copy"), or you may end up with duplicate pages sharing the same URL.

**MQTT** is expected on `localhost:1883` (the GX/Venus OS broker). Topics:

| Topic | Purpose |
|-------|---------|
| `N/+/vebus/+/Devices/+/Ac/+/P` | Per-unit AC in/out power |
| `N/+/vebus/+/Ac/Out/+/V` | Phase AC output voltage |
| `N/+/vebus/+/Devices/+/Ac/+/V` | Per-unit AC output voltage (if published) |

Instance is auto-detected on the Inverter Load page.

---

## Configuration

Key settings live at the top of the **Build load % bars** function (edit in Node-RED):

| Setting | Default | Purpose |
|---------|---------|---------|
| `RATED_W_PER_UNIT` | `0` (auto) | Per-unit rating; `0` auto-detects, or set e.g. `20000` to pin |
| `DIRECTION_MODE` | `"both"` | `"out"`, `"in"`, or `"both"` |
| `BAR_COLOUR_MODE` | `"severity"` | `"severity"` heat, or `"phase"` solid colour |
| `SPREAD_FULL_RATIO` | `0.25` | Phase spread treated as "fully severe" |
| `BAL_WARN_PCT` / `BAL_CRIT_PCT` | `85` / `78` | Current-sharing alert thresholds |
| `VOLT_WARN_PCT` / `VOLT_CRIT_PCT` | `2.0` / `4.0` | Phase voltage-imbalance thresholds |
| `UNIT_V_WARN` / `UNIT_V_CRIT` | `1.5` / `3.0` V | Per-unit voltage-deviation (loose-connection) thresholds |
| `PHASE_COLOURS` | amber/green/blue | Per-phase badge/gauge colours |

---

## Experimental: native GX Touch add-on (unsupported)

The `gx-touch/` folder holds **optional, experimental** QML pages that render the imbalance
view **natively on the GX Touch / HDMI screen** — one for the classic **gui-v1** and one for
the current **gui-v2** (which follows the GX's own light/dark setting). They're there to
experiment with, **not** for client sites.

> ⚠️ **Caution.** Modifying the Venus OS GUI is **not supported by Victron** and is
> **wiped by firmware updates**. gui-v2 is a *built* app, so its page is added by building
> gui-v2 from source or via a gui-v2 mod package, not by dropping a file in. Deploy only via a
> SetupHelper-style package (so it re-applies after updates) and **test on a bench GX first** —
> a bad GUI edit can leave the screen unusable until you SSH in. The QML follows current
> conventions but must be **compiled/tested against your Venus OS version**. For anything
> client-facing, use the web dashboard above — it works on both GUI versions and survives updates.

See `gx-touch/README.md`, `gx-touch/gui-v1/README.md` and `gx-touch/gui-v2/README.md` for details.

## Credits

This dashboard is **based on the original "parallel imbalance" Node-RED flow** — the
current-sharing / balance calculation, the automatic unit-count and phase detection, and the
load history originate from that earlier work and remain the work of its author(s), built on
here with thanks. The dark theme, the Inverter Load page (load bars, heat gradient, balance
pills, voltages and loose-connection detection, alerts, and per-unit rating auto-detection) and
the packaging are by **Currently Amped** (Harare, Zimbabwe).

If you are an original author and would like your credit shown differently, please let us know.
