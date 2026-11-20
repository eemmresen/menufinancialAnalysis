import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = 'artifacts';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
await makeTestPdf(context);

page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}\n${error.stack}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) {
    errors.push(`CONSOLE: ${message.text()}`);
  }
});

async function shot(name, fullPage = true) {
  try {
    await page.screenshot({
      path: `${OUT}/${name}.png`,
      fullPage,
      timeout: 20000,
      animations: 'disabled',
    });
  } catch {
    results.push(`NOT  ekran görüntüsü alınamadı: ${name}`);
  }
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`OK   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message.split('\n')[0]}`);
    try {
      await shot(`fail-${name.replace(/[^a-z0-9]+/gi, '-')}`);
    } catch {
      /* yoksay */
    }
  }
}

async function gotoHash(hash, heading) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle' });
  if (heading) {
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 25000 });
  }
  await page.waitForTimeout(500);
}

async function bodyText() {
  return (await page.locator('body').innerText()).toLocaleLowerCase('tr-TR');
}

async function makeTestPdf(browserContext) {
  const pdfPage = await browserContext.newPage();
  await pdfPage.setContent(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:48px;color:#111">
    <h1 style="font-size:24px;margin:0 0 8px">KAHVE DUNYASI TIC LTD</h1>
    <p style="margin:0 0 24px">Fatura Tarihi: 12.10.2026 · Fatura No: KDV2026001</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr><th align="left">Aciklama</th><th align="right">Miktar</th><th align="right">Birim Fiyat</th><th align="right">Tutar</th></tr></thead>
      <tbody>
        <tr><td>Espresso 2 kg</td><td align="right">2</td><td align="right">450,00</td><td align="right">900,00</td></tr>
        <tr><td>Sut 10 lt</td><td align="right">10</td><td align="right">42,00</td><td align="right">420,00</td></tr>
      </tbody>
    </table>
    <p style="margin-top:24px;text-align:right;font-size:14px">Ara Toplam 1.320,00</p>
    <p style="text-align:right;font-size:14px">Toplam KDV 164,00</p>
    <p style="text-align:right;font-size:16px;font-weight:bold">Genel Toplam 1.484,00</p>
  </body></html>`);
  await pdfPage.pdf({ path: `${OUT}/test-fatura.pdf`, format: 'A4' });
  await pdfPage.close();
}

await step('panel', async () => {
  await gotoHash('/', 'Panel');
  await page.waitForTimeout(1000);
  const text = await bodyText();
  if (!text.includes('en kârlı ürün')) throw new Error('Panel kartları görünmüyor');
  if (!text.includes('örnek veri yüklü')) throw new Error('Örnek veri uyarısı yok');
  if (!text.includes('başabaş satış miktarı')) throw new Error('Başabaş kartı yok');
  await shot('01-panel');
});

await step('malzemeler listesi', async () => {
  await gotoHash('/malzemeler', 'Hammaddeler');
  const rows = await page.locator('table tbody tr').count();
  if (rows < 20) throw new Error(`Hammadde satırı az: ${rows}`);
  await shot('02-malzemeler');
});

await step('malzeme ekleme', async () => {
  await page.getByRole('button', { name: 'Yeni hammadde' }).click();
  await page.getByPlaceholder('Örn. Espresso çekirdeği').fill('Test Malzeme');
  const dialog = page.getByRole('dialog');
  const numbers = dialog.locator('input[inputmode="decimal"]');
  await numbers.nth(0).fill('2');
  await numbers.nth(1).fill('100');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(700);
  const text = await page.locator('body').innerText();
  if (!text.includes('Test Malzeme')) throw new Error('Yeni malzeme tabloda yok');
  await shot('03-malzeme-eklendi');
});

await step('fiyat degisince urun maliyeti guncellenir', async () => {
  await gotoHash('/malzemeler', 'Hammaddeler');
  const row = page.locator('table tbody tr', { hasText: 'Espresso çekirdeği' }).first();
  await row.getByTitle('Düzenle').click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const numbers = dialog.locator('input[inputmode="decimal"]');
  await numbers.nth(1).fill('1800');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(800);

  await page.goto(`${BASE}/#/urunler/dm-p-latte`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Ürünü düzenle' }).waitFor();
  await page.waitForTimeout(800);
  const text = await page.locator('body').innerText();
  if (!text.includes('32,40')) throw new Error('Latte hammadde maliyeti 32,40 olmadı');

  await page.goto(`${BASE}/#/malzemeler`, { waitUntil: 'networkidle' });
  await page.locator('table tbody tr', { hasText: 'Espresso çekirdeği' }).first().getByTitle('Düzenle').click();
  const dialog2 = page.getByRole('dialog');
  await dialog2.waitFor();
  await dialog2.locator('input[inputmode="decimal"]').nth(1).fill('900');
  await dialog2.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(600);
});

await step('urunler listesi', async () => {
  await gotoHash('/urunler', 'Ürünler ve reçeteler');
  const rows = await page.locator('table tbody tr').count();
  if (rows < 20) throw new Error(`Ürün satırı az: ${rows}`);
  await shot('04-urunler');
});

await step('urun editoru', async () => {
  await page.getByRole('link', { name: 'Latte', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Ürünü düzenle' }).waitFor();
  await page.waitForTimeout(700);
  const text = await bodyText();
  if (!text.includes('maliyet ve kârlılık')) throw new Error('Maliyet paneli yok');
  if (!text.includes('başabaş fiyat')) throw new Error('Başabaş fiyat yok');
  await shot('05-urun-editoru');
});

await step('giderler', async () => {
  await gotoHash('/giderler', 'Giderler');
  const text = await bodyText();
  if (!text.includes('sabit gider')) throw new Error('Gider özeti yok');
  await shot('06-giderler');
});

await step('satislar kaydetme', async () => {
  await gotoHash('/satislar', 'Satışlar');
  const firstQty = page.locator('table tbody tr').first().locator('input[inputmode="decimal"]').first();
  await firstQty.fill('12');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(900);
  const text = await bodyText();
  if (!text.includes('satışları kaydedildi')) throw new Error('Satış kaydetme bildirimi yok');
  await shot('07-satislar');
});

await step('raporlar + excel', async () => {
  await gotoHash('/raporlar', 'Raporlar');
  const text = await bodyText();
  if (!text.includes('kdv özeti')) throw new Error('KDV özeti yok');
  if (!text.includes('gider dağıtımı')) throw new Error('Dağıtım tablosu yok');
  await shot('08-raporlar');
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`${OUT}/rapor.xlsx`);
  const size = readFileSync(`${OUT}/rapor.xlsx`).length;
  if (size < 3000) throw new Error(`Excel dosyası çok küçük: ${size}`);
});

await step('donem kapatma', async () => {
  await page.getByRole('button', { name: 'Dönemi kapat' }).click();
  await page.waitForTimeout(1200);
  const text = await bodyText();
  if (!text.includes('dönem kapalı')) throw new Error('Dönem kapatma rozeti yok');
  if (!text.includes('dondurulmuş kayıtlardan')) throw new Error('Dondurulmuş kayıt uyarısı yok');
  await shot('08b-donem-kapali');
});

await step('simulasyon', async () => {
  await gotoHash('/simulasyon', 'Fiyat simülasyonu');
  const rows = await page.locator('table tbody tr').count();
  if (rows < 2) throw new Error(`Senaryo satırı az: ${rows}`);
  const text = await bodyText();
  if (!text.includes('başabaş fiyat')) throw new Error('Başabaş fiyat kartı yok');
  const priceInput = page.locator('table tbody tr').first().locator('input[inputmode="decimal"]').first();
  await priceInput.fill('200');
  await page.waitForTimeout(400);
  await shot('09-simulasyon');
});

await step('fatura elle giris ve onay', async () => {
  await gotoHash('/faturalar', 'Faturalar');
  await page.getByRole('button', { name: 'Elle fatura gir' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.locator('input').first().fill('Test Tedarikçi');
  await dialog.getByRole('button', { name: 'Kalem ekle' }).click();
  const row = dialog.locator('table tbody tr').first();
  await row.locator('input').first().fill('Test Kalem');
  const numbers = row.locator('input[inputmode="decimal"]');
  await numbers.nth(0).fill('3');
  await numbers.nth(1).fill('50');
  await dialog.getByRole('button', { name: 'Toplamı satırlardan hesapla' }).click();
  await shot('10-fatura-inceleme');
  await dialog.getByRole('button', { name: 'Onayla ve alışa işle' }).click();
  await page.waitForTimeout(1200);
  const text = await bodyText();
  if (!text.includes('onaylandı')) throw new Error('Fatura onaylanmadı');
  await shot('11-fatura-onaylandi');

  await gotoHash('/malzemeler', 'Hammaddeler');
  const materialText = await page.locator('body').innerText();
  if (!materialText.includes('Test Kalem')) throw new Error('Faturadan hammadde oluşmadı');
});

await step('fatura PDF metni', async () => {
  await gotoHash('/faturalar', 'Faturalar');
  await page.locator('input[type="file"]').setInputFiles(`${OUT}/test-fatura.pdf`);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 60000 });
  const supplier = await dialog.locator('input').first().inputValue();
  const total = await dialog.locator('input[inputmode="decimal"]').first().inputValue();
  if (!supplier.includes('KAHVE DUNYASI')) throw new Error(`PDF tedarikçisi okunmadı: "${supplier}"`);
  if (!total.replace(/\./g, '').includes('1484')) throw new Error(`PDF toplamı okunmadı: "${total}"`);
  await shot('12b-pdf-sonucu');
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).last().click();
});

await step('fatura OCR', async () => {  await gotoHash('/faturalar', 'Faturalar');
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas yok');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 900, 400);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 56px Arial';
    ctx.fillText('KAHVE DUNYASI', 40, 90);
    ctx.fillText('Fatura Tarihi: 12.10.2026', 40, 180);
    ctx.fillText('Espresso 2 kg 450,00', 40, 270);
    ctx.fillText('TOPLAM 900,00', 40, 360);
    return canvas.toDataURL('image/png');
  });
  const base64 = dataUrl.split(',')[1];
  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-fatura.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 150000 });
  await page.waitForTimeout(500);
  const dialogText = await dialog.innerText();
  if (!dialogText.includes('Okunan ham metni göster') && !dialogText.includes('hammadde')) {
    throw new Error('OCR inceleme ekranı beklenen içeriği göstermiyor');
  }
  await shot('12-ocr-sonucu');
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).last().click();
});

await step('ayarlar + json yedek', async () => {
  await gotoHash('/ayarlar', 'Ayarlar');
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: 'JSON yedek indir' }).click();
  const download = await downloadPromise;
  await download.saveAs(`${OUT}/yedek.json`);
  const backup = JSON.parse(readFileSync(`${OUT}/yedek.json`, 'utf8'));
  if (backup.app !== 'momo-kafe-analiz') throw new Error('Yedek uygulama kimliği yanlış');
  if (!Array.isArray(backup.tables.materials) || backup.tables.materials.length < 20) {
    throw new Error('Yedekte hammaddeler eksik');
  }
  await shot('13-ayarlar', false);
});

await step('json yedekten geri yukleme', async () => {
  await gotoHash('/malzemeler', 'Hammaddeler');
  await page.getByRole('button', { name: 'Yeni hammadde' }).click();
  await page.getByPlaceholder('Örn. Espresso çekirdeği').fill('Silinecek Malzeme');
  const dialog = page.getByRole('dialog');
  const numbers = dialog.locator('input[inputmode="decimal"]');
  await numbers.nth(0).fill('1');
  await numbers.nth(1).fill('10');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(700);

  await gotoHash('/ayarlar', 'Ayarlar');
  await page.locator('input[type="file"]').setInputFiles(`${OUT}/yedek.json`);
  const restoreDialog = page.getByRole('dialog');
  await restoreDialog.waitFor();
  await restoreDialog.getByRole('button', { name: 'Mevcut veriyi değiştir' }).click();
  await page.waitForTimeout(2000);
  const toastText = await bodyText();
  if (!toastText.includes('yedek geri yüklendi')) throw new Error('Geri yükleme bildirimi yok');

  await gotoHash('/malzemeler', 'Hammaddeler');
  const materialText = await page.locator('body').innerText();
  if (materialText.includes('Silinecek Malzeme')) throw new Error('Yedek öncesi kayıt silinmedi');
  if (!materialText.includes('Test Malzeme')) throw new Error('Yedekteki kayıt geri gelmedi');
  await shot('13b-yedek-geri-yuklendi');
});

await step('mobil menu', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHash('/', 'Panel');
  await page.getByRole('button', { name: 'Menüyü aç' }).click();
  await page.waitForTimeout(400);
  await shot('14-mobil-menu');
  await page.getByRole('link', { name: 'Giderler', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Giderler', exact: true }).waitFor();
  await shot('15-mobil-giderler');
});

console.log(results.join('\n'));
console.log('---');
console.log(`KONSOL HATALARI: ${errors.length}`);
for (const error of errors.slice(0, 20)) console.log(error);

await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length > 0 ? 1 : 0);


