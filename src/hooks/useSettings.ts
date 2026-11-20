import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { AppSettings } from '@/types';

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => db.settings.get('app'), []);
}
