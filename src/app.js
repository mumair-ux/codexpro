(function () {
  'use strict';
  const audit = window.CodexProAudit;
  const byId = id => document.getElementById(id);
  const fileInput = byId('fileInput');
  const dropzone = byId('dropzone');
  const status = byId('status');
  const results = byId('results');
  const details = byId('issueRows');
  const search = byId('search');
  const filter = byId('severityFilter');
  let report = null;
  let uploadedName = 'products.csv';

  function statusText(value, isError) {
    status.textContent = value;
    status.className = 'status' + (isError ? ' error' : '');
  }
  function makeCell(row, content, className) {
    const td = document.createElement('td');
    td.textContent = String(content == null ? '' : content);
    if (className) td.className = className;
    row.appendChild(td);
  }
  function filteredIssues() {
    if (!report) return [];
    const q = search.value.trim().toLowerCase();
    const level = filter.value;
    return report.issues.filter(issue => (level === 'all' || issue.severity === level) &&
      (!q || [issue.product, issue.handle, issue.code, issue.detail, issue.recommendation].some(value => String(value).toLowerCase().includes(q))));
  }
  function renderIssues() {
    details.replaceChildren();
    const visible = filteredIssues();
    byId('shownCount').textContent = visible.length + ' of ' + report.issues.length + ' findings';
    for (const issue of visible) {
      const tr = document.createElement('tr');
      makeCell(tr, issue.severity.toUpperCase(), 'sev ' + issue.severity);
      makeCell(tr, issue.product + '\n' + issue.handle, 'product-col');
      makeCell(tr, issue.category + ' · ' + issue.code, 'rule-col');
      makeCell(tr, issue.detail);
      makeCell(tr, issue.recommendation);
      makeCell(tr, issue.row);
      details.appendChild(tr);
    }
    byId('empty').hidden = visible.length !== 0;
  }
  function displayReport(value) {
    report = value;
    results.hidden = false;
    byId('reportMode').textContent = value.summary.mode === 'inventory' ? 'Inventory-location CSV' : 'Product catalog CSV';
    byId('productLabel').textContent = value.summary.mode === 'inventory' ? 'Product handles' : 'Products';
    byId('variantLabel').textContent = value.summary.mode === 'inventory' ? 'Variant identities' : 'Variants (estimated)';
    byId('productCount').textContent = value.summary.products;
    byId('variantCount').textContent = value.summary.variants;
    byId('criticalCount').textContent = value.summary.counts.critical;
    byId('warningCount').textContent = value.summary.counts.warning;
    byId('infoCount').textContent = value.summary.counts.info;
    byId('csvRows').textContent = value.summary.csvRows;
    byId('inventoryNote').hidden = value.summary.inventoryAvailable;
    byId('seoNote').hidden = value.summary.seoAvailable;
    search.value = ''; filter.value = 'all';
    renderIssues();
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function openFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { statusText('Please select a .csv file exported from Shopify Products.', true); return; }
    if (file.size > 25 * 1024 * 1024) { statusText('File exceeds the 25 MB browser limit. Split the export into smaller CSV files.', true); return; }
    uploadedName = file.name;
    statusText('Reading and analyzing ' + file.name + '…', false);
    try {
      const contents = await file.text();
      const parsed = audit.parseCsv(contents);
      const result = audit.isInventoryCsv(parsed) ? audit.auditInventory(parsed) : audit.auditProducts(parsed);
      statusText('Analysis complete: ' + file.name + '. Nothing was modified in Shopify.', false);
      displayReport(result);
    } catch (error) {
      results.hidden = true;
      report = null;
      statusText(error.message || 'The CSV file could not be read.', true);
    }
  }
  function download(filename, contents, type) {
    const link = document.createElement('a');
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  fileInput.addEventListener('change', () => openFile(fileInput.files[0]));
  for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, e => { e.preventDefault(); dropzone.classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, e => { e.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', e => openFile(e.dataTransfer.files[0]));
  search.addEventListener('input', renderIssues);
  filter.addEventListener('change', renderIssues);
  byId('downloadCsv').addEventListener('click', () => {
    if (report) download('codexpro-issues-' + uploadedName.replace(/\.csv$/i, '') + '.csv', audit.issuesToCsv(filteredIssues()), 'text/csv;charset=utf-8');
  });
  byId('downloadJson').addEventListener('click', () => {
    if (report) download('codexpro-report.json', JSON.stringify(report, null, 2), 'application/json');
  });
  byId('demoBtn').addEventListener('click', async () => {
    // Built-in synthetic data so the demo also works from a local file URL, offline.
    const rows = [
      'Handle,Title,Body (HTML),Variant SKU,Variant Price,Variant Compare-at Price,Variant Inventory Tracker,Variant Inventory Qty,SEO Title,SEO Description,Image Src,Published',
      'kids-space-bedding,Space Adventure Kids Single Bedsheet,"<p>Soft printed bedding.</p>",US-001,1199,2400,shopify,20,Space Adventure Kids Bedsheet,,https://example.com/space.jpg,TRUE',
      'kids-cat-bedding,Space Adventure Kids Single Bedsheet,,US-002,0,2400,shopify,0,,,https://example.com/cat.jpg,FALSE',
      'kids-cat-bedding,,,,,,,,,,https://example.com/cat-detail.jpg,',
      'kids-fleece-blanket,CloudSoft Fleece Blanket,,US-001,3499,3499,,3,,,https://example.com/blanket.jpg,TRUE'
    ];
    uploadedName = 'demo-shopify-products.csv';
    statusText('Running offline demo. This contains sample products only.', false);
    displayReport(audit.auditProducts(rows.join('\r\n')));
  });
})();
