const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseCsv, auditProducts, issuesToCsv } = require('../src/audit.js');

const readExample = () => readFileSync(join(__dirname, '../examples/sample_shopify_products.csv'), 'utf8');
const codes = result => result.issues.map(i => i.code);

test('parses UTF-8 BOM, CRLF, escaped quotes, multiline descriptions and line numbers', () => {
  const csv = '\uFEFFHandle,Title,Body (HTML)\r\nexample,"A ""quoted"" title","Line 1\r\nLine 2"\r\n';
  const parsed = parseCsv(csv);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].values.Title, 'A "quoted" title');
  assert.equal(parsed.records[0].values['Body (HTML)'], 'Line 1\r\nLine 2');
  assert.equal(parsed.records[0].line, 2);
});

test('rejects malformed product files while routing inventory files separately', () => {
  assert.throws(() => parseCsv('URL handle,Title\na,"broken'), /matching closing quote/);
  assert.equal(require('../src/audit.js').isInventoryCsv(parseCsv('Handle,Location,On hand (new)\nabc,Main,10')), true);
  assert.throws(() => parseCsv('Title,Price\nProduct,100'), /missing Handle/);
  assert.throws(() => parseCsv('Handle,Title\na,b,extra'), /more columns/);
});

test('analyzes old-style Shopify product CSV and ignores extra image-only rows as product duplicates', () => {
  const result = auditProducts(readExample());
  assert.equal(result.summary.products, 3);
  assert.equal(result.summary.variants, 3);
  assert.equal(result.summary.csvRows, 4);
  assert(codes(result).includes('DUPLICATE_TITLE'));
  assert(codes(result).includes('DUPLICATE_SKU'));
  assert(codes(result).includes('INVALID_PRICE'));
  assert(codes(result).includes('COMPARE_AT_NOT_HIGHER'));
  assert(codes(result).includes('OUT_OF_STOCK'));
  assert(codes(result).includes('TRACKING_DISABLED'));
  assert(codes(result).includes('NOT_ACTIVE'));
  assert(codes(result).includes('NOT_PUBLISHED'));
  assert(codes(result).includes('SEO_DESCRIPTION_FALLBACK'));
  assert(!codes(result).includes('MISSING_HANDLE'));
  assert.equal(result.issues.filter(i => i.code === 'DUPLICATE_TITLE').length, 2);
});

test('supports newer Shopify headings, fallback SEO, handles and visible status', () => {
  const csv = 'URL handle,Title,Description,SKU,Price,Compare-at price,Inventory tracker,Inventory quantity,SEO title,SEO description,Status,Published on online store\n' +
    'kids-cat,A Cute Cat Kids Bedsheet,"<p>Soft cotton.</p>",CAT-1,1599,2500,shopify,20,,,active,TRUE\n';
  const result = auditProducts(csv);
  assert.equal(result.summary.products, 1);
  assert.equal(result.summary.variants, 1);
  assert.equal(result.summary.counts.critical, 0);
  assert.equal(result.summary.counts.warning, 0);
  assert(codes(result).includes('SEO_TITLE_FALLBACK'));
});

test('does not falsely flag repeated SKU and title for same variant with extra image row', () => {
  const csv = 'Handle,Title,Option1 Value,Variant SKU,Variant Price,Image Src\n' +
    'p1,Sheet,Default Title,SKU-1,500,https://example.com/1.png\n' +
    'p1,,Default Title,SKU-1,500,https://example.com/2.png\n';
  const result = auditProducts(csv);
  assert(!codes(result).includes('DUPLICATE_SKU'));
  assert(!codes(result).includes('DUPLICATE_TITLE'));
  assert.equal(result.summary.variants, 1);
});

test('flags same SKU for different variants even within one handle', () => {
  const csv = 'Handle,Title,Option1 Value,Variant SKU,Variant Price\n' +
    'p1,One,Red,X-100,500\n' +
    'p1,,Blue,X-100,550\n';
  const result = auditProducts(csv);
  assert.equal(result.issues.filter(x => x.code === 'DUPLICATE_SKU').length, 2);
});

test('skips inventory checks gracefully when product export lacks quantity column', () => {
  const result = auditProducts('Handle,Title,Variant Price\np1,Product,1300\n');
  assert.equal(result.summary.inventoryAvailable, false);
  assert(!codes(result).includes('OUT_OF_STOCK'));
});

test('CSV issue exports avoid spreadsheet formula injection', () => {
  const csv = issuesToCsv([{severity:'warning',category:'Content',code:'X',product:'=HYPERLINK("bad")',handle:'+SUM(1,2)',row:2,detail:'@cmd',recommendation:'-1'}]);
  assert(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert(csv.includes('"\'+SUM(1,2)"'));
  assert(csv.includes('"\'@cmd"'));
});

test('SEO title length is checked against exported maximum and basic HTML is not treated as a description', () => {
  const title = 'X'.repeat(75);
  const csv = 'Handle,Title,Body (HTML),SEO Title,SEO Description\np1,' + title + ',"<div> </div>",,\n';
  const result = auditProducts(csv);
  assert(codes(result).includes('SEO_TITLE_LONG'));
  assert(codes(result).includes('EMPTY_DESCRIPTION'));
});

test('inventory CSV auto detection and stock/location checking', () => {
  const { isInventoryCsv, auditInventory } = require('../src/audit.js');
  const parsed = parseCsv(readFileSync(join(__dirname, '../examples/sample_shopify_inventory.csv'), 'utf8'));
  assert.equal(isInventoryCsv(parsed), true);
  const result = auditInventory(parsed);
  assert.equal(result.summary.mode, 'inventory');
  assert.equal(result.summary.products, 2);
  assert.equal(result.summary.variants, 2);
  assert(codes(result).includes('DUPLICATE_INVENTORY_ROW'));
  assert(codes(result).includes('INVALID_NEW_QTY'));
  assert(codes(result).includes('NEW_QTY_ZERO'));
});

test('inventory auditor checks missing location and Option1 Value without changing rows', () => {
  const { auditInventory } = require('../src/audit.js');
  const csv = 'Handle,Location,Option1 Value,On hand (current),On hand (new)\nabc,,,3,5\n';
  const result = auditInventory(csv);
  assert(codes(result).includes('MISSING_LOCATION'));
  assert(codes(result).includes('MISSING_OPTION1'));
  assert.equal(result.summary.csvRows, 1);
});
