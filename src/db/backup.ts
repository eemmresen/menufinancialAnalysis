import { db } from './schema';
import { DEFAULT_SETTINGS } from './defaults';

export const BACKUP_VERSION = 1;
export const BACKUP_APP_ID = 'momo-kafe-analiz';

export const BACKUP_TABLES = [
  'settings',
  'suppliers',
  'materials',
  'materialLots',
  'products',
  'expenses',
  'sales',
  'invoices',
  'periods',
  'snapshots',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  tables: Partial<Record<BackupTable, unknown[]>>;
}

export interface BackupCounts {
  [key: string]: number;
}

export async function getDataCounts(): Promise<BackupCounts> {
  const counts: BackupCounts = {};
  for (const name of BACKUP_TABLES) {
    counts[name] = await db.table(name).count();
  }
  return counts;
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: Partial<Record<BackupTable, unknown[]>> = {};
  for (const name of BACKUP_TABLES) {
    tables[name] = await db.table(name).toArray();
  }
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function validateBackup(data: unknown): asserts data is BackupFile {
  if (!data || typeof data !== 'object') {
    throw new Error('Yedek dosyası okunamadı: geçerli bir JSON değil.');
  }
  const file = data as Partial<BackupFile>;
  if (file.app !== BACKUP_APP_ID) {
    throw new Error('Bu dosya bu uygulamaya ait bir yedek değil.');
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > BACKUP_VERSION) {
    throw new Error(
      `Yedek sürümü desteklenmiyor (dosya: ${String(file.schemaVersion)}, uygulama: ${BACKUP_VERSION}).`,
    );
  }
  if (!file.tables || typeof file.tables !== 'object') {
    throw new Error('Yedek dosyasında veri tabloları bulunamadı.');
  }
  for (const name of Object.keys(file.tables)) {
    if (!BACKUP_TABLES.includes(name as BackupTable)) {
      throw new Error(`Yedekte tanınmayan tablo: ${name}`);
    }
    const rows = (file.tables as Record<string, unknown>)[name];
    if (!Array.isArray(rows)) throw new Error(`"${name}" tablosu dizi değil.`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') {
        throw new Error(`"${name}" tablosunda kimliksiz kayıt var.`);
      }
    }
  }
  const settings = file.tables.settings;
  if (settings && settings.length > 0) {
    const first = settings[0] as { id?: string };
    if (first.id !== 'app') throw new Error('Ayarlar kaydı geçersiz.');
  }
}

export interface RestoreResult {
  mode: 'replace' | 'merge';
  imported: BackupCounts;
}

/** Yedeği geri yükler. "replace" mevcut tüm veriyi siler, "merge" üzerine ekler. */
export async function importBackup(
  data: unknown,
  mode: 'replace' | 'merge' = 'replace',
): Promise<RestoreResult> {
  validateBackup(data);
  const imported: BackupCounts = {};

  await db.transaction('rw', db.tables, async () => {
    for (const name of BACKUP_TABLES) {
      const rows = (data.tables[name] ?? []) as Array<Record<string, unknown>>;
      imported[name] = rows.length;
      if (mode === 'replace') await db.table(name).clear();
      if (rows.length > 0) await db.table(name).bulkPut(rows);
    }
    // Yedekte ayar yoksa uygulama varsayılan ayarlarla açılabilsin
    if ((await db.settings.count()) === 0) {
      await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() });
    }
  });

  return { mode, imported };
}

export function downloadBackupFile(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kafe-yedek-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil.');
  }
  validateBackup(parsed);
  return parsed;
}
