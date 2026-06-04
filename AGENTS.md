# AGENTS.md

## Cursor Cloud specific instructions

### Product

**SpecAnalyzer DASA** is a static, Portuguese-language demo for analyzing technical specification text in the browser. There is no backend, database, package manager, or Docker stack—only HTML, CSS, and vanilla JavaScript served from the repository root.

### Running locally

1. From the repo root, start a static HTTP server (required; `file://` URLs are not reliable for this app):

   ```bash
   python3 -m http.server 8080
   ```

2. Open:
   - Landing: http://127.0.0.1:8080/index.html
   - Analyzer: http://127.0.0.1:8080/app.html

3. Core flow: paste spec text → **Analisar** → review requirements, restrictions, inconsistencies, and keywords → **Limpar** to reset.

Use a tmux session for long-running dev servers so they survive backgrounding (see cloud agent tmux conventions).

### Lint / test / build

| Check | Command | Notes |
|-------|---------|--------|
| JS syntax | `node --check app.js` | Only automated check in-repo; no ESLint/Prettier config |
| Unit tests | — | None defined |
| Production build | — | None; CI deploys the static root as-is (`.github/workflows/deploy-pages.yml` → `gh-pages`) |

### Optional external dependency

Google Fonts load from `fonts.googleapis.com` when online. The UI works offline with system font fallbacks.

### Gotchas

- Do not expect `npm install`, `docker compose`, or API env vars—this repo has none.
- Analysis is client-side regex/heuristics only; landing-page copy about uploads/AI is aspirational, not implemented.
