import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { ensureInitialized } from './db/seed';

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await ensureInitialized();
  } catch (error) {
    console.error('Veritabanı başlatılamadı', error);
    root.render(
      <div className="mx-auto mt-20 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Uygulama başlatılamadı</h1>
        <p className="mt-2 text-sm text-ink-700">
          Tarayıcınızda yerel veritabanı (IndexedDB) kullanılamıyor olabilir. Gizli sekme yerine normal
          bir pencerede açmayı deneyin.
        </p>
        <p className="mt-2 text-xs text-ink-500">{String(error)}</p>
      </div>,
    );
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
