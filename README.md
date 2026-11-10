# CodexPro — Shopify Catalog Auditor

**A free, offline-first catalog quality checker for Shopify product and inventory CSV exports.**

CodexPro is an early-stage open-source project for practical e-commerce automation. Its first working release is a browser-based Shopify product **and inventory CSV auditor**. It helps small businesses spot issues **without** connecting a Shopify account, uploading sensitive store data, or changing any store products.

## Use it in three steps

1. In **Shopify Admin → Products → Export**, export products to CSV. Alternatively, go to **Products → Inventory** and export a stock-by-location CSV.
2. Download this repository as a ZIP, extract it, and **double-click `index.html`**. You can also host these static files with GitHub Pages.
3. Select your exported CSV. Review the findings and download a filtered CSV or full JSON report.

**Try the sample:** Click **Try with sample data** in the application to see typical findings without having a Shopify store. An additional sample export is at [`examples/sample_shopify_products.csv`](examples/sample_shopify_products.csv).

## Features

| Area | Checks |
| --- | --- |
| Duplicates | Repeated titles across different product handles, duplicate variant SKUs, duplicate barcodes, exact image URL reuse |
| Pricing | Missing/invalid variant prices, compare-at price not higher than selling price |
| Inventory | Missing inventory tracker, zero/negative/low quantity (when available in product CSV) |
| SEO | Blank product descriptions, long SEO titles, long custom SEO descriptions, missing custom SEO with Shopify fallback |
| Visibility | Draft/archived products and online-store unpublished products (when indicated by export) |
| Structure | Missing or invalid handles, missing titles, malformed CSV |

For **inventory-location CSVs**, CodexPro checks missing handles, location names, variant identifiers, invalid stock figures, zero proposed stock, and duplicate records for the same product/variant/location/bin. It never changes stock and does not attempt to validate that location names exist in your account.

The tool supports **new and legacy Shopify product CSV column names** including `URL handle` / `Handle`, `SKU` / `Variant SKU`, `Price` / `Variant Price`, and `Inventory quantity` / `Variant Inventory Qty`. Multi-image rows from the same product are grouped to avoid falsely reporting the same product as a duplicate.

## What this tool cannot verify

- Similar-looking designs or visually duplicate product photos — only repeated titles, IDs, or **exact image URLs** can be detected.
- Whether a product is in the correct manual or automated **collection**. Standard product CSV exports do not reliably prove collection membership.
- Actual **live Shopify product page** appearance, Add to Cart button colors, storefront speed, or checkout behavior.
- Live stock levels or whether an inventory CSV location actually exists in your account. An inventory CSV is a **snapshot**, not live store data. For multi-location stock, use the dedicated inventory CSV auditor rather than the product CSV checks.
- Whether an unpublished/draft product, low inventory, or a repeated title is intentional.

**Findings are advisory, not necessarily defects.** Blank `On hand (new)` means no inventory adjustment is proposed, not a missing quantity. Empty custom SEO fields are marked informational because Shopify falls back to the product title and description. A single product can have several rows for its images and variants. Variant counts are estimates based on values available in the CSV.

## Privacy and safety

- **Runs locally in your browser** with JavaScript; no server, analytics, third-party scripts, login, store tokens, or Shopify API requests.
- No products are created, edited, deleted, imported or published.
- No file data is uploaded by this application. Downloaded results are generated locally.
- CSV exports are protected against spreadsheet formula injection for cells beginning with formula characters.
- Avoid committing **real store exports**, private SKUs or customer data into public GitHub repositories. Product exports generally do not include order/customer information, but may still reveal proprietary catalog details.

## Run tests (contributors)

Requires **Node.js 18+**, only for automated tests, not for the browser tool.

```bash
npm test
```

No package install is needed. Tests use Node's built-in test runner; the application works without Node.js.

## File layout

```text
index.html              Offline browser interface
assets/styles.css       Responsive UI
src/audit.js            CSV parser, Shopify checks, export module (browser + Node)
src/app.js              Browser UI logic
tests/audit.test.js     Automated tests
examples/               Synthetic product and inventory sample CSVs
CONTRIBUTING.md         Contribution guidelines
LICENSE                 MIT license
```

## Publish with GitHub Pages

After uploading the repository files: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**. GitHub Pages is optional. You can use the tool offline immediately without publishing it.

## Roadmap

- [x] Browser-based CSV product auditor
- [x] Duplicate titles / SKUs / barcodes and shared image URL checks
- [x] Pricing, SEO, inventory and visibility checks
- [x] Export of findings as CSV and JSON
- [x] Unit tests and realistic sample data
- [x] Dedicated inventory-by-location CSV auditor
- [ ] Configurable SEO and low-stock thresholds
- [ ] Image perceptual similarity (client-side, opt-in)
- [ ] Additional locales and accessible visualizations

Ideas and bug reports are welcome through GitHub Issues. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Sources

Shopify product CSV column reference: <https://help.shopify.com/en/manual/products/import-export/using-csv>

Shopify inventory CSV reference: <https://help.shopify.com/en/manual/inventory-and-locations/setup/inventory-csv>

## License

MIT — see [LICENSE](LICENSE). The project is not affiliated with or endorsed by Shopify.
