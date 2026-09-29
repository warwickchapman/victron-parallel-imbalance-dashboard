# Source

- `load_fn.js` — "Build load % bars" function (load %, balance, heat, voltages, alerts, auto-rating).
- `load_template.html` — FlowFuse Dashboard 2.0 `ui-template` for the Inverter Load page.
- `graph_fn.js` — Load History function (rolling 60-min per-unit history + rating detection).
- `original-flow.json` — the original `parallel imbalance` flow (merged and re-skinned by `../build.js`).

From the repo root, run `node build.js` to regenerate `victron-parallel-imbalance.json`.
The standalone `victron-parallel-imbalance-histogram.json` is not generated from these sources.
