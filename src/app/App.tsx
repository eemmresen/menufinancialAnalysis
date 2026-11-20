import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ToastProvider } from '@/components/ui/Toast';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { ProductEditorPage } from '@/features/products/ProductEditorPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { SalesPage } from '@/features/sales/SalesPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SimulationPage } from '@/features/simulation/SimulationPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="malzemeler" element={<MaterialsPage />} />
            <Route path="urunler" element={<ProductsPage />} />
            <Route path="urunler/yeni" element={<ProductEditorPage />} />
            <Route path="urunler/:id" element={<ProductEditorPage />} />
            <Route path="faturalar" element={<InvoicesPage />} />
            <Route path="giderler" element={<ExpensesPage />} />
            <Route path="satislar" element={<SalesPage />} />
            <Route path="raporlar" element={<ReportsPage />} />
            <Route path="simulasyon" element={<SimulationPage />} />
            <Route path="ayarlar" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
