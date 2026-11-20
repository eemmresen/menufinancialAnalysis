import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  BACKUP_TABLES,
  exportBackup,
  getDataCounts,
  importBackup,
  validateBackup,
} from '@/db/backup';
import { resetAllData, seedDemoData, ensureInitialized, clearDemoData } from '@/db/seed';
import { closePeriod, reopenPeriod } from '@/db/repos';
import { currentPeriod } from '@/lib/dates';
import { DEFAULT_SETTINGS } from '@/db/defaults';

async function freshDatabase() {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDatabase();
});

describe('JSON yedekleme ve geri yükleme', () => {
  it('yedek tüm tabloları içerir ve doğrulanır', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS });
    await seedDemoData();

    const backup = await exportBackup();
    expect(backup.app).toBe('momo-kafe-analiz');
    expect(backup.schemaVersion).toBe(1);
    expect(() => validateBackup(backup)).not.toThrow();

    for (const table of BACKUP_TABLES) {
      expect(Array.isArray(backup.tables[table])).toBe(true);
    }
    expect(backup.tables.materials!.length).toBeGreaterThan(20);
  });

  it('yedek alıp sıfırladıktan sonra geri yükleme veriyi aynen döndürür', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS });
    await seedDemoData();
    const before = await getDataCounts();
    const backup = await exportBackup();

    await resetAllData();
    const afterReset = await getDataCounts();
    expect(afterReset.materials).toBe(0);
    expect(afterReset.products).toBe(0);

    const result = await importBackup(backup, 'replace');
    expect(result.mode).toBe('replace');

    const after = await getDataCounts();
    for (const table of BACKUP_TABLES) {
      expect(after[table]).toBe(before[table]);
    }

    const product = await db.products.get('dm-p-latte');
    expect(product?.name).toBe('Latte');
    expect(product?.recipe.length).toBe(2);
  });

  it('birleştirme modu aynı kimlikli kayıtları çoğaltmaz', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS });
    await seedDemoData();
    const before = await getDataCounts();
    const backup = await exportBackup();

    await importBackup(backup, 'merge');
    await importBackup(backup, 'merge');

    const after = await getDataCounts();
    expect(after.materials).toBe(before.materials);
    expect(after.products).toBe(before.products);
  });

  it('bozuk veya yabancı yedeği reddeder', async () => {
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup({ app: 'baska-uygulama', schemaVersion: 1, tables: {} })).toThrow();
    expect(() =>
      validateBackup({ app: 'momo-kafe-analiz', schemaVersion: 99, tables: {} }),
    ).toThrow();
    expect(() =>
      validateBackup({
        app: 'momo-kafe-analiz',
        schemaVersion: 1,
        tables: { materials: [{ name: 'id yok' }] },
      }),
    ).toThrow();
  });

  it('ilk açılışta ayarlar ve örnek veri oluşur, tekrar çalıştırma çoğaltmaz', async () => {
    await ensureInitialized();
    const first = await getDataCounts();
    expect(first.materials).toBeGreaterThan(20);
    expect(first.products).toBeGreaterThan(20);

    await ensureInitialized();
    const second = await getDataCounts();
    expect(second.materials).toBe(first.materials);
  });

  it('örnek veri kaldırma kullanıcı kayıtlarını silmez', async () => {    await ensureInitialized();
    await db.materials.put({
      id: 'mat-kullanici',
      name: 'Kullanıcı malzemesi',
      category: 'Diğer',
      purchaseQty: 1,
      purchaseUnit: 'kg',
      purchasePrice: 100,
      vatRate: 0.2,
      purchaseDate: '2026-01-01',
      wasteRate: 0,
      createdAt: '',
      updatedAt: '',
    });

    await clearDemoData();
    expect(await db.materials.get('mat-kullanici')).toBeTruthy();
    expect(await db.materials.get('dm-m-espresso')).toBeUndefined();
    expect(await db.products.count()).toBe(0);
  });

  it('dönem kapatma maliyet anlık görüntüsü oluşturur ve fiyat değişiminden etkilenmez', async () => {
    await ensureInitialized();
    const period = currentPeriod();
    const count = await closePeriod(period);
    expect(count).toBeGreaterThan(20);

    const snapshots = await db.snapshots.where('period').equals(period).toArray();
    expect(snapshots.length).toBe(count);
    const latte = snapshots.find((s) => s.productId === 'dm-p-latte');
    expect(latte).toBeTruthy();
    const before = latte!.cost.variableCost;

    const material = await db.materials.get('dm-m-espresso');
    await db.materials.update(material!.id, { purchasePrice: 5000 });

    const after = (await db.snapshots.get(latte!.id))!.cost.variableCost;
    expect(after).toBe(before);

    const periodRecord = await db.periods.get(period);
    expect(periodRecord?.status).toBe('closed');

    await reopenPeriod(period);
    expect((await db.periods.get(period))?.status).toBe('open');
  });
});
