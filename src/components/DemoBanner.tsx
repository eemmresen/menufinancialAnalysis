import { Link } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { Icon } from './icons';

export function DemoBanner() {
  const settings = useSettings();
  if (!settings?.demoData) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
      <Icon name="info" size={16} className="shrink-0" />
      <p className="flex-1">
        <strong className="font-semibold">Örnek veri yüklü.</strong> Menü fiyatları menüden alınmıştır;
        malzeme alış fiyatları örnek amaçlıdır ve gerçek tedarikçi fiyatı değildir.
      </p>
      <Link
        to="/ayarlar"
        className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
      >
        Verileri yönet
      </Link>
    </div>
  );
}
