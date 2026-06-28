# Autoloom Cable OS Demo

Static offline demo for an AI-SaaS client pitch to a small cable manufacturer.

The demo presents a three-phase roadmap:

- Phase 1: Operations layer for costing, quotes, order tracking, job cards, and dispatch readiness.
- Phase 2: Accounting layer for invoice readiness, receivables, payment holds, and Zoho Books sync visibility.
- Phase 3: Sales layer for inquiries, customer contacts, follow-ups, EMD, and bank guarantee tracking.

## Run Locally

Open `index.html` directly in a browser, or serve it with:

```sh
npm start
```

Then open `http://localhost:8765`.

## Conductor

The repository includes `.conductor/settings.toml` so the Conductor Run button serves the static demo on the workspace's assigned `CONDUCTOR_PORT`.

Manual equivalent:

```sh
CONDUCTOR_PORT=8765 npm run conductor:run
```

## Demo Path

Use the five-minute flow in `.context/demo-script.md`:

Dashboard -> Costing -> Quote Preview -> Order Board -> Operator Card -> Dispatch -> Accounting -> Sales.

The app stores demo changes in browser local storage. Use the top-right `Reset` button before a client meeting to return to the clean starting dataset.

## Implementation Notes

- No backend or build step is required.
- `assets/mock-data.js` contains realistic deterministic mock data.
- `assets/app.js` owns routing and in-memory demo interactions.
- `assets/styles.css` defines the dense ERP-style visual system.
