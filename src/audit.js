/* CodexPro Shopify Catalog Auditor | MIT License | No external dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CodexProAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALIASES = {
    handle: ['URL handle', 'Handle'],
    title: ['Title'],
    description: ['Description', 'Body (HTML)', 'Body HTML'],
    seoTitle: ['SEO title', 'SEO Title'],
    seoDescription: ['SEO description', 'SEO Description'],
    status: ['Status'],
    published: ['Published on online store', 'Published'],
    tags: ['Tags'],
    sku: ['SKU', 'Variant SKU'],
    barcode: ['Barcode', 'Variant Barcode'],
    price: ['Price', 'Variant Price'],
    compareAt: ['Compare-at price', 'Compare at price', 'Variant Compare-at Price'],
    tracker: ['Inventory tracker', 'Variant Inventory Tracker'],
    quantity: ['Inventory quantity', 'Variant Inventory Qty'],
    image: ['Product image URL', 'Image Src'],
    imageAlt: ['Image alt text', 'Image Alt Text'],
    option1: ['Option1 Value', 'Option 1 Value'],
    option2: ['Option2 Value', 'Option 2 Value'],
    option3: ['Option3 Value', 'Option 3 Value']
  };

  function normalized(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function normalHeader(value) {
    return normalized(value).replace(/[\s_-]+/g, '');
  }
  function toText(value) {
    return String(value == null ? '' : value).trim();
  }
  function plainText(value) {
    return toText(value).replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  function numeric(value) {
    const s = toText(value).replace(/,/g, '');
    return s !== '' && /^(?:\d+(?:\.\d+)?|\.\d+|-\d+(?:\.\d+)?)$/.test(s) ? Number(s) : null;
  }

  // RFC-4180-style parser: comma, CRLF, embedded newlines, escaped quotes and UTF-8 BOM.
  function parseCsv(input) {
    if (typeof input !== 'string' || input.trim() === '') throw new Error('Select a non-empty Shopify product CSV file.');
    const text = input.replace(/^\uFEFF/, '');
    const parsed = [];
    let row = [], field = '', quoted = false, closedQuote = false;
    let line = 1, rowLine = 1;
    function finishField() { row.push(field); field = ''; closedQuote = false; }
    function finishRow() {
      finishField();
      if (row.some(value => value.trim() !== '')) parsed.push({ cells: row, line: rowLine });
      row = [];
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closedQuote = true; }
        } else {
          field += char;
          if (char === '\n') line++;
          else if (char === '\r' && text[i + 1] !== '\n') line++;
        }
        continue;
      }
      if (char === ',') { finishField(); continue; }
      if (char === '\r' || char === '\n') {
        finishRow();
        if (char === '\r' && text[i + 1] === '\n') i++;
        line++; rowLine = line;
        continue;
      }
      if (char === '"') {
        if (field === '' && !closedQuote) { quoted = true; continue; }
        throw new Error('Malformed CSV: unexpected quote on line ' + line + '.');
      }
      if (closedQuote && char !== ' ' && char !== '\t') throw new Error('Malformed CSV: unexpected text after closing quote on line ' + line + '.');
      if (!closedQuote) field += char;
    }
    if (quoted) throw new Error('Malformed CSV: an opening quote has no matching closing quote.');
    if (field !== '' || row.length > 0 || closedQuote) finishRow();
    if (parsed.length < 2) throw new Error('CSV must contain a header row and at least one product row.');
    const headers = parsed[0].cells.map(x => x.trim());
    const headerIds = headers.map(normalHeader);
    if (new Set(headerIds).size !== headerIds.length) throw new Error('CSV contains duplicate column headers.');
    if (!headerIds.includes('handle') && !headerIds.includes('urlhandle')) throw new Error('This does not look like a Shopify product export: missing Handle / URL handle column.');
    const records = parsed.slice(1).map(item => {
      if (item.cells.length > headers.length) throw new Error('Row on line ' + item.line + ' has more columns than the CSV header.');
      const values = Object.create(null);
      headers.forEach((header, i) => { values[header] = item.cells[i] || ''; });
      return { values, line: item.line };
    });
    return { headers, records };
  }

  function buildColumns(headers) {
    const lookup = new Map(headers.map(h => [normalHeader(h), h]));
    const columns = {};
    for (const [key, choices] of Object.entries(ALIASES)) {
      columns[key] = choices.map(normalHeader).map(k => lookup.get(k)).find(Boolean) || null;
    }
    return columns;
  }

  function auditProducts(csvOrParsed) {
    const parsed = typeof csvOrParsed === 'string' ? parseCsv(csvOrParsed) : csvOrParsed;
    if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.records)) throw new Error('Invalid parsed CSV input.');
    const columns = buildColumns(parsed.headers);
    if (!columns.handle) throw new Error('The product Handle / URL handle column is required.');
    if (isInventoryCsv(parsed)) throw new Error('This is an inventory-location CSV. Use the inventory audit instead.');
    const read = (record, key) => columns[key] ? toText(record.values[columns[key]]) : '';
    const issues = [];
    const products = new Map();
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const add = (severity, category, code, product, record, detail, recommendation) => {
      issues.push({ severity, category, code, product: product ? product.title || '(Untitled)' : '(Unknown)',
        handle: product ? product.handle : '', row: record ? record.line : '', detail, recommendation });
    };

    for (const record of parsed.records) {
      const handle = read(record, 'handle');
      if (!handle) {
        add('critical', 'Structure', 'MISSING_HANDLE', null, record, 'A product row has no handle.', 'Re-export or correct its product URL handle.');
        continue;
      }
      if (!products.has(normalized(handle))) products.set(normalized(handle), { handle, title: '', rows: [], primary: record });
      const product = products.get(normalized(handle));
      product.rows.push(record);
      if (!product.title && read(record, 'title')) product.title = read(record, 'title');
    }

    const titleGroups = new Map();
    const skuGroups = new Map();
    const barcodeGroups = new Map();
    const imageGroups = new Map();
    let variants = 0;

    function captureIdentity(map, value, product, record, variantKey) {
      const key = normalized(value);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ product, record, variantKey });
    }

    for (const product of products.values()) {
      const first = product.primary;
      const preferred = key => product.rows.map(r => read(r, key)).find(Boolean) || '';
      const title = product.title;
      if (!title) add('critical', 'Content', 'MISSING_TITLE', product, first, 'No product title found for this handle.', 'Give the product a meaningful title.');
      else captureIdentity(titleGroups, title, product, first, 'product');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle)) {
        add('warning', 'Structure', 'INVALID_HANDLE', product, first, 'Handle contains spaces or characters outside lowercase letters, numbers and hyphens.', 'Review the Shopify URL handle.');
      }
      const description = preferred('description');
      if (columns.description && !plainText(description)) {
        add('warning', 'Content', 'EMPTY_DESCRIPTION', product, first, 'Product description is blank.', 'Add a useful, accurate description of the product.');
      }
      if (columns.seoTitle) {
        const explicitSeo = preferred('seoTitle');
        const effectiveTitle = explicitSeo || title;
        if (!explicitSeo && title) add('info', 'SEO', 'SEO_TITLE_FALLBACK', product, first, 'Custom SEO title is blank; Shopify uses the product title as a fallback.', 'Consider a tailored SEO title if the default is not suitable.');
        if (effectiveTitle.length > 70) add('warning', 'SEO', 'SEO_TITLE_LONG', product, first, 'SEO title or its fallback is ' + effectiveTitle.length + ' characters (Shopify CSV maximum: 70).', 'Shorten the SEO title to 70 characters or fewer.');
      }
      if (columns.seoDescription) {
        const explicit = preferred('seoDescription');
        if (!explicit) add('info', 'SEO', 'SEO_DESCRIPTION_FALLBACK', product, first, 'Custom SEO description is blank; Shopify uses the product description as a fallback.', 'Write a concise custom SEO description where useful.');
        if (explicit.length > 320) add('warning', 'SEO', 'SEO_DESCRIPTION_LONG', product, first, 'Custom SEO description is ' + explicit.length + ' characters (Shopify CSV maximum: 320).', 'Shorten the custom description to 320 characters or fewer.');
      }
      if (columns.tags && !preferred('tags')) add('info', 'Content', 'MISSING_TAGS', product, first, 'No product tags found.', 'Add tags if your collections or workflows depend on them.');
      if (columns.status) {
        const status = normalized(preferred('status'));
        if (status === 'draft' || status === 'archived') add('info', 'Visibility', 'NOT_ACTIVE', product, first, 'Product status is ' + status + '.', 'Check whether this status is intentional.');
      }
      if (columns.published) {
        const published = normalized(preferred('published'));
        if (published === 'false' || published === 'no') add('info', 'Visibility', 'NOT_PUBLISHED', product, first, 'Product is marked unpublished on the online store.', 'Check whether this visibility setting is intentional.');
      }
      if (columns.image && !preferred('image')) add('warning', 'Images', 'NO_IMAGE', product, first, 'No product image URL was found in this export.', 'Attach a product image in Shopify.');

      let foundVariants = 0;
      const seenVariants = new Set();
      for (const record of product.rows) {
        const sku = read(record, 'sku');
        const barcode = read(record, 'barcode');
        const price = read(record, 'price');
        const compareAt = read(record, 'compareAt');
        const track = read(record, 'tracker');
        const quantity = read(record, 'quantity');
        const options = [read(record, 'option1'), read(record, 'option2'), read(record, 'option3')];
        const distinctOption = options.filter(Boolean).map(normalized).join('|') || 'default';
        const isVariant = Boolean(sku || barcode || price || compareAt || track || quantity || options.some(Boolean));
        if (isVariant && !seenVariants.has(distinctOption)) {
          seenVariants.add(distinctOption);
          foundVariants++; variants++;
        }
        if (isVariant) {
          if (sku) captureIdentity(skuGroups, sku, product, record, distinctOption);
          if (barcode) captureIdentity(barcodeGroups, barcode, product, record, distinctOption);
          if (columns.price && price) {
            const num = numeric(price);
            if (num === null || num <= 0) add('critical', 'Pricing', 'INVALID_PRICE', product, record, 'Variant price is not a positive number: ' + price, 'Set a valid selling price.');
          } else if (columns.price && (sku || barcode || options.some(Boolean)) && !price) {
            add('warning', 'Pricing', 'MISSING_PRICE', product, record, 'Variant price is blank.', 'Check the selling price for this variant.');
          }
          if (columns.compareAt && compareAt) {
            const num = numeric(compareAt);
            const actual = numeric(price);
            if (num === null || num < 0) add('warning', 'Pricing', 'INVALID_COMPARE_AT', product, record, 'Compare-at price is invalid.', 'Use a valid numeric compare-at price.');
            else if (actual !== null && num > 0 && num <= actual) add('warning', 'Pricing', 'COMPARE_AT_NOT_HIGHER', product, record, 'Compare-at price is not higher than selling price.', 'Review the price comparison; a discount requires a higher compare-at price.');
          }
          if (columns.tracker && !track) add('info', 'Inventory', 'TRACKING_DISABLED', product, record, 'Inventory tracker is blank for this variant.', 'Enable inventory tracking if stock needs to be monitored.');
          if (columns.quantity && quantity !== '') {
            const qty = numeric(quantity);
            if (qty === null || !Number.isInteger(qty)) add('warning', 'Inventory', 'INVALID_QUANTITY', product, record, 'Inventory quantity is not an integer.', 'Use a whole-number inventory quantity.');
            else if (qty < 0) add('warning', 'Inventory', 'NEGATIVE_QUANTITY', product, record, 'Inventory quantity is negative (' + qty + ').', 'Verify actual stock and inventory settings.');
            else if (qty === 0) add('warning', 'Inventory', 'OUT_OF_STOCK', product, record, 'Exported quantity is zero.', 'Verify availability; quantity can be incomplete for multi-location stores.');
            else if (qty <= 5) add('info', 'Inventory', 'LOW_STOCK', product, record, 'Exported quantity is low (' + qty + ').', 'Consider a replenishment check if this item is actively sold.');
          }
        }
        const image = read(record, 'image');
        if (image) captureIdentity(imageGroups, image, product, record, 'image');
      }
      if (columns.price && foundVariants === 0) add('warning', 'Pricing', 'NO_VARIANT_DATA', product, first, 'No variant price data found for this product.', 'Check the product export and variant price.');
    }

    function duplicateCheck(map, code, category, severity, label, advice) {
      for (const [value, records] of map) {
        const unique = new Map();
        for (const item of records) unique.set(item.product.handle + '::' + item.variantKey, item);
        const entries = [...unique.values()];
        const handles = new Set(entries.map(e => normalized(e.product.handle)));
        if (entries.length <= 1 || (code === 'DUPLICATE_TITLE' && handles.size <= 1)) continue;
        if (code === 'SHARED_IMAGE' && handles.size <= 1) continue;
        for (const item of entries) {
          const others = entries.filter(e => e !== item).map(e => e.product.handle).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
          add(severity, category, code, item.product, item.record, label + ' "' + value.slice(0, 90) + '" is also used by: ' + others.join(', '), advice);
        }
      }
    }
    duplicateCheck(titleGroups, 'DUPLICATE_TITLE', 'Duplicates', 'warning', 'Product title', 'Review whether these are different products or accidental duplicates.');
    duplicateCheck(skuGroups, 'DUPLICATE_SKU', 'Duplicates', 'critical', 'SKU', 'Give different variants unique SKUs where appropriate.');
    duplicateCheck(barcodeGroups, 'DUPLICATE_BARCODE', 'Duplicates', 'warning', 'Barcode', 'Verify that each barcode represents the intended variant.');
    duplicateCheck(imageGroups, 'SHARED_IMAGE', 'Images', 'info', 'Exact image URL', 'Check whether both products deliberately use this image.');

    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (Number(a.row) || 0) - (Number(b.row) || 0) || a.code.localeCompare(b.code));
    const counts = { critical: 0, warning: 0, info: 0 };
    issues.forEach(issue => counts[issue.severity]++);
    return {
      summary: { mode: 'products', products: products.size, variants, csvRows: parsed.records.length, totalIssues: issues.length, counts,
        inventoryAvailable: Boolean(columns.quantity), seoAvailable: Boolean(columns.seoTitle || columns.seoDescription),
        columnsFound: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, Boolean(v)])) },
      issues
    };
  }

  function isInventoryCsv(parsed) {
    const fields = new Set(parsed.headers.map(normalHeader));
    return fields.has('location') && [...fields].some(x => x.startsWith('onhand'));
  }

  // Shopify's inventory-location CSV is distinct from the products CSV.
  // Never recommend automatically importing our reports into Shopify.
  function auditInventory(csvOrParsed) {
    const parsed = typeof csvOrParsed === 'string' ? parseCsv(csvOrParsed) : csvOrParsed;
    if (!isInventoryCsv(parsed)) throw new Error('Please select a Shopify inventory-location CSV (Handle, Location, On hand columns).');
    const headerMap = new Map(parsed.headers.map(h => [normalHeader(h), h]));
    function col(...names) { return names.map(normalHeader).map(x => headerMap.get(x)).find(Boolean) || null; }
    const cols = {
      handle: col('Handle'), title: col('Title'), location: col('Location'),
      opt1: col('Option1 Value', 'Option 1 Value'), opt2: col('Option2 Value', 'Option 2 Value'),
      opt3: col('Option3 Value', 'Option 3 Value'), bin: col('Bin name'),
      current: col('On hand (current)'), next: col('On hand (new)'),
      available: col('Available (not editable)')
    };
    const read = (record, key) => cols[key] ? toText(record.values[cols[key]]) : '';
    const issues = [];
    const counts = { critical: 0, warning: 0, info: 0 };
    const handles = new Set();
    const variants = new Set();
    const seenRows = new Map();
    function add(severity, category, code, item, detail, recommendation) {
      issues.push({ severity, category, code, product: read(item, 'title') || '(Inventory item)',
        handle: read(item, 'handle'), row: item.line, detail, recommendation });
      counts[severity]++;
    }
    for (const item of parsed.records) {
      const handle = read(item, 'handle');
      const location = read(item, 'location');
      const opt1 = read(item, 'opt1');
      const opt2 = read(item, 'opt2');
      const opt3 = read(item, 'opt3');
      const bin = read(item, 'bin');
      if (!handle) add('critical', 'Structure', 'MISSING_HANDLE', item, 'Inventory row is missing its product handle.', 'Use the correct product handle from Shopify.');
      else handles.add(normalized(handle));
      if (!location) add('critical', 'Inventory', 'MISSING_LOCATION', item, 'Inventory row has no location name.', 'Use an exact location name configured in Shopify.');
      if (cols.opt1 && !opt1) add('critical', 'Inventory', 'MISSING_OPTION1', item, 'Option1 Value is missing; the variant cannot be identified reliably.', 'Use the exported Option1 Value, such as Default Title.');
      if (!cols.opt1) add('warning', 'Structure', 'OPTION1_COLUMN_MISSING', item, 'Option1 Value column is absent.', 'Use a fresh Shopify inventory export with variant option columns.');
      if (handle) variants.add([normalized(handle), normalized(opt1), normalized(opt2), normalized(opt3)].join('::'));
      if (cols.current && read(item, 'current') !== '') {
        const current = numeric(read(item, 'current'));
        if (current === null || !Number.isInteger(current)) add('warning', 'Inventory', 'INVALID_CURRENT_QTY', item, 'On hand (current) is not a whole number.', 'Restore the value from Shopify rather than guessing the current quantity.');
      }
      if (cols.next && read(item, 'next') !== '') {
        const next = numeric(read(item, 'next'));
        if (next === null || !Number.isInteger(next)) add('critical', 'Inventory', 'INVALID_NEW_QTY', item, 'On hand (new) is not a whole number.', 'Use an integer for the proposed stock adjustment.');
        else if (next < 0) add('warning', 'Inventory', 'NEGATIVE_NEW_QTY', item, 'On hand (new) is negative (' + next + ').', 'Review the quantity; negative values may be unintended.');
        else if (next === 0) add('info', 'Inventory', 'NEW_QTY_ZERO', item, 'Proposed new on-hand quantity is zero.', 'Confirm that this item should have no on-hand stock at this location.');
      }
      if (handle && location) {
        const key = [handle, location, opt1, opt2, opt3, bin].map(normalized).join('::');
        if (seenRows.has(key)) add('warning', 'Duplicates', 'DUPLICATE_INVENTORY_ROW', item, 'A matching variant/location/bin record appears earlier on CSV line ' + seenRows.get(key) + '.', 'Review accidental duplicate lines before any Shopify import.');
        else seenRows.set(key, item.line);
      }
    }
    issues.sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a.severity] - ({ critical: 0, warning: 1, info: 2 })[b.severity] || a.row - b.row);
    return { summary: { mode: 'inventory', products: handles.size, variants: variants.size, csvRows: parsed.records.length,
      totalIssues: issues.length, counts, inventoryAvailable: true, seoAvailable: true,
      columnsFound: Object.fromEntries(Object.entries(cols).map(([k,v]) => [k, Boolean(v)])) }, issues };
  }

  const ISSUE_COLUMNS = ['severity', 'category', 'code', 'product', 'handle', 'row', 'detail', 'recommendation'];
  function csvCell(value) {
    let safe = String(value == null ? '' : value);
    // Do not allow CSV cells imported into spreadsheets to evaluate as formulas.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(safe)) safe = "'" + safe;
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  function issuesToCsv(issues) {
    return [ISSUE_COLUMNS.map(csvCell).join(','), ...issues.map(i => ISSUE_COLUMNS.map(k => csvCell(i[k])).join(','))].join('\r\n') + '\r\n';
  }
  return { parseCsv, auditProducts, auditInventory, isInventoryCsv, issuesToCsv, ISSUE_COLUMNS };
});
