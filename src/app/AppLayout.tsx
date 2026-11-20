import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { useSettings } from '@/hooks/useSettings';
import { DemoBanner } from '@/components/DemoBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const NAV = [
  { to: '/', label: 'Panel', icon: 'dashboard' },
  { to: '/malzemeler', label: 'Hammaddeler', icon: 'box' },
  { to: '/urunler', label: 'Ürünler ve Reçeteler', icon: 'cup' },
  { to: '/faturalar', label: 'Faturalar', icon: 'receipt' },
  { to: '/giderler', label: 'Giderler', icon: 'wallet' },
  { to: '/satislar', label: 'Satışlar', icon: 'chart' },
  { to: '/raporlar', label: 'Raporlar', icon: 'calculator' },
  { to: '/simulasyon', label: 'Fiyat Simülasyonu', icon: 'flask' },
  { to: '/ayarlar', label: 'Ayarlar', icon: 'settings' },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const settings = useSettings();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-brand-50">
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-lg font-bold text-brand-900">
            m
          </span>
          <div>
            <p className="text-lg font-semibold leading-none tracking-tight">momo</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-brand-200">
              maliyet analizi
            </p>
          </div>
        </div>
        {settings?.businessName && settings.businessName !== 'momo' && (
          <p className="mt-3 truncate text-xs text-brand-200">{settings.businessName}</p>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-brand-100/80 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <Icon name={item.icon} size={17} className="shrink-0 opacity-90" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-4 text-[11px] leading-relaxed text-brand-200">
        <p className="flex items-center gap-1.5">
          <Icon name="check" size={13} /> Veriler bu tarayıcıda saklanır
        </p>
        <p className="mt-1 text-brand-300/70">Sunucuya hiçbir veri gönderilmez.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-sand-50">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-sand-200 bg-sand-50/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-sand-300 bg-white p-2 text-ink-700"
            aria-label="Menüyü aç"
          >
            <Icon name="menu" size={18} />
          </button>
          <span className="text-sm font-semibold">momo · maliyet analizi</span>
        </header>

        <main className="p-4 pb-16 sm:p-6 lg:p-8 print:p-0">
          <div className="mx-auto max-w-[1400px]">
            <DemoBanner />
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
