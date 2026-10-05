# Native GX Touch views (experimental)

Optional native-display re-implementations of the imbalance view, for showing it **on the
GX Touch screen itself** rather than in a browser. Both are **unsupported, bench-only, and
wiped by firmware updates** — deploy via a SetupHelper-style package and test on a bench GX.
For client-facing use, prefer the web dashboard (works on both GUI versions, update-proof).

- **`gui-v1/`** — classic Venus OS GUI (editable QML). See `gui-v1/README.md`.
- **`gui-v2/`** — current Venus OS GUI (built app; follows the GX light/dark setting
  automatically). See `gui-v2/README.md`.
