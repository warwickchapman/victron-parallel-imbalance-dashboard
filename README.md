# Currently Amped · Victron Parallel Imbalance Dashboard

**See how parallel VE.Bus inverter/chargers share the work.** This Node-RED dashboard shows individual AC input and output power alongside phase totals, so uneven sharing is easier to spot during commissioning and troubleshooting. The latest version also shows AC output voltage and flags readings that deserve a closer look.

![Latest Inverter Load dashboard with per-unit bars, voltage readings, and an imbalance warning](./docs/images/inverter-load.jpg)

*Example from a 12-unit, three-phase system. The dashboard discovers the unit count from incoming MQTT data.*

## Choose a version

| Import file | Use it for |
| --- | --- |
| **[Latest dashboard](./victron-parallel-imbalance.json)** | The current three-page dashboard, including voltage readings and imbalance alerts. |
| [Histogram dashboard](./victron-parallel-imbalance-histogram.json) | The pre-Warren jazz-up version: per-unit load histograms, balance tables, and 60-minute time-series graphs. |

Both files are complete three-page Node-RED imports. They reuse the same node IDs and dashboard paths, so **import one version at a time**. Updating from the histogram version to the latest version replaces the matching nodes and adds two voltage MQTT inputs; review Node-RED's import choices before deploying.

### Histogram version

This is the dashboard from before Warren's later visual and voltage-alert work. It shows each inverter's AC input and output load as vertical bars on **Inverter Load %** (`/dashboard/load`), with **Parallel Balance** tables (`/dashboard/pb`) and a rolling 60-minute **Load History** time-series page (`/dashboard/page2`). [See the histogram screenshot](./screenshot-zw.jpeg). It does not include the latest voltage readouts or alert banner.

For this import, the **Parallel Balance** MQTT input is fixed to VE.Bus instance `276`; change it to your instance or use `+`. The Inverter Load input already uses a wildcard. Set `RATED_W_PER_UNIT` in **Build load % bars** for accurate percentages; **Load History** has a separate rating setting for graph scaling.

## What the latest dashboard shows

| Page | Path | View |
| --- | --- | --- |
| **Inverter Load %** | `/dashboard/load` | Per-unit AC input and output bars, phase load gauges, load-sharing balance, available AC output voltages, and an alert banner. |
| **Parallel Balance** | `/dashboard/pb` | Individual power readings and balance figures grouped by phase. |
| **Load History** | `/dashboard/page2` | Rolling 60-minute per-unit AC input and output graphs. |

Bar height represents power as a percentage of the unit rating. Colour shows how hard a unit is working compared with the others on its phase. The balance figure compares the least-loaded and most-loaded units; a lower figure means less even sharing.

## Install or update

You need Node-RED with **FlowFuse Dashboard 2.0** and access to the installation's Victron MQTT power topics.

1. In Node-RED, choose **Menu → Import** and select [the latest flow](./victron-parallel-imbalance.json). If updating an existing import, review the matching nodes that Node-RED offers to replace.
2. Check the imported MQTT broker. It defaults to `localhost:1883`; change it if your broker runs elsewhere.
3. In the **Parallel Balance** flow, edit **All unit AC power**. Its imported topic is fixed to VE.Bus instance `276`: `N/+/vebus/276/Devices/+/Ac/+/P`. Change the instance for your system, or use `N/+/vebus/+/Devices/+/Ac/+/P`. The Inverter Load flow already uses the wildcard.
4. Set `RATED_W_PER_UNIT` in **Build load % bars** to the continuous output rating of one inverter, in watts. Use `RATED_W_OVERRIDES` if ratings differ between units. The default `0` estimates a rating from observed peaks, so load percentages may be wrong until enough load has been seen. **Load History** has its own `RATED_W_PER_UNIT` setting for graph scaling.
5. **Deploy**, then open the dashboard at the paths above. The imported dashboard base path is `/dashboard`.

The latest flow subscribes to:

```text
N/+/vebus/+/Devices/+/Ac/+/P    per-unit AC input and output power
N/+/vebus/+/Ac/Out/+/V          phase AC output voltage
N/+/vebus/+/Devices/+/Ac/+/V    per-unit AC output voltage, when published
```

If per-unit voltage is unavailable, the display can fall back to the phase voltage. **A per-unit voltage-deviation alert needs real per-unit readings**; the shared phase value cannot reveal differences between units.

## Interpreting alerts

The latest page highlights uneven current sharing, phase-voltage imbalance, and per-unit voltage deviation. Its thresholds are near the top of [`src/load_fn.js`](./src/load_fn.js) and can be tuned for the installation. A warning is a prompt to investigate, **not proof of a wiring or inverter fault**. Compare readings under a meaningful load and follow safe electrical inspection practice before changing connections.

The MQTT power topics do not identify each device's phase. Automatic phase detection assumes contiguous, interleaved VE.Bus device numbers starting at zero. A single-phase installation with 3, 6, 9, or more units can look three-phase to this detector. If the layout is wrong, set `AUTO_PHASE_MODE` to `"single"` or `"three"` in the relevant function nodes.

## Source and history

The latest import is generated from the checked-in source with plain Node.js:

```sh
node build.js
```

This writes [`victron-parallel-imbalance.json`](./victron-parallel-imbalance.json). The [`src/`](./src/README.md) directory holds the functions, dashboard template, and original flow used by the builder. The standalone histogram JSON is a preserved historical import and is not changed by a rebuild. See the [changelog](./CHANGELOG.md) for the version history.

## Files

| File | Purpose |
| --- | --- |
| [`victron-parallel-imbalance.json`](./victron-parallel-imbalance.json) | Latest three-page Node-RED import. |
| [`victron-parallel-imbalance-histogram.json`](./victron-parallel-imbalance-histogram.json) | Pre-Warren three-page import with per-unit histograms and 60-minute time-series data. |
| [`docs/images/inverter-load.jpg`](./docs/images/inverter-load.jpg) | Latest dashboard screenshot shown above. |
| [`screenshot-zw.jpeg`](./screenshot-zw.jpeg) | Histogram-version screenshot. |
| [`build.js`](./build.js) and [`src/`](./src/README.md) | Sources and build script for the latest import. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Human-readable version history. |

Original parallel imbalance flow by Frank and Warwick; dashboard extension and dark theme by Currently Amped.
