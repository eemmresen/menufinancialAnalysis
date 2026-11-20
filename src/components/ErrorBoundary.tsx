import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Beklenmeyen bir hata olduğunda beyaz ekran yerine anlaşılır mesaj gösterir. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Uygulama hatası', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-red-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-red-700">Bir hata oluştu</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Verileriniz silinmedi; kayıtlar tarayıcıda duruyor. Sayfayı yenileyerek devam edebilirsiniz.
            Sorun sürerse Ayarlar ekranından JSON yedeği alın.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-sand-50 p-3 text-[11px] text-ink-600">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Sayfayı yenile
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-sm font-medium hover:bg-sand-50"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
