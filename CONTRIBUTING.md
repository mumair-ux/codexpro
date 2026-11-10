# Contributing to CodexPro

Thank you for your interest in improving CodexPro. This is an early-stage project, and first-time contributors are welcome.

1. Open an Issue describing a bug or proposed feature. Please remove real product/store identifiers from any example.
2. Fork the repository and create a descriptive branch.
3. Make a focused change, add or update tests, and run `npm test`.
4. Open a pull request explaining what changed and how it was tested.

## Guidelines

- No dependency, tracking scripts, external API calls, or file uploads without a strong case and explicit review.
- Keep the browser app runnable by opening `index.html` locally; no build step.
- Support real Shopify CSV headers and avoid assuming all stores have single-location inventory.
- Do not introduce automatic product changes; the app is read-only by design.
- Use **synthetic data only** in public tests and bug reports.
- Maintain keyboard accessibility, responsive UI, and simple instructions.

## Development

`src/audit.js` exports `parseCsv`, `auditProducts`, and `issuesToCsv` to both `window.CodexProAudit` and Node.js `module.exports`.

Run tests with `npm test`. Open `index.html` directly to test the interface. Node.js is not needed to use the web app.
