import type { ReactNode } from 'react';
import { useT } from '../../../i18n';
import { LOGIN_HERO_IMAGE } from '../../matches/constants';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const t = useT();
  return (
    <div className="bg-[#020f0b] text-white min-h-screen flex flex-col font-archivo overflow-x-hidden">
      <div className="relative h-[280px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <div
          className="absolute inset-0 z-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url('${LOGIN_HERO_IMAGE}')` }}
        />
        <div className="absolute bottom-0 left-0 p-6 z-20 w-full flex flex-col justify-end h-full">
          <h1 className="font-anton text-4xl text-white uppercase leading-none tracking-tighter">
            {t('brand')}
          </h1>
          <p className="text-white/80 mt-2 max-w-[80%] uppercase tracking-widest text-xs font-semibold">
            {t('auth.tagline')}
          </p>
        </div>
      </div>

      <main className="flex-grow flex flex-col px-6 py-8 bg-[#020f0b] rounded-t-2xl -mt-4 z-30 relative shadow-[0_-8px_30px_rgba(15,45,36,0.3)] border-t border-[#14352b]">
        <header className="mb-6">
          <h2 className="font-anton text-2xl text-[#d4f000] mb-1 tracking-tight">{title}</h2>
          {subtitle && <p className="text-gray-400 text-sm">{subtitle}</p>}
        </header>
        {children}
      </main>

      <footer className="mt-auto py-6 px-6 flex flex-col items-center gap-2 bg-[#020f0b] border-t border-[#14352b]/50">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
          {t('auth.footer')}
        </p>
      </footer>
    </div>
  );
}

interface AuthMessageProps {
  error?: string | null;
  status?: string | null;
}

export function AuthMessage({ error, status }: AuthMessageProps) {
  if (!error && !status) return null;
  return (
    <div
      className={`p-3 rounded-lg text-sm ${
        error
          ? 'bg-red-950/40 border border-red-900/60 text-red-300'
          : 'bg-[#0f2d24] border border-[#1f453a] text-[#d4f000]'
      }`}
    >
      {error || status}
    </div>
  );
}

export const authInputClass =
  'w-full pl-10 pr-4 py-3 bg-[#0a1c17] border border-[#1f453a] text-white focus:border-[#d4f000] focus:ring-1 focus:ring-[#d4f000] rounded-lg text-sm transition-all';

export const authInputPlainClass =
  'w-full px-4 py-3 bg-[#0a1c17] border border-[#1f453a] text-white focus:border-[#d4f000] focus:ring-1 focus:ring-[#d4f000] rounded-lg text-sm transition-all';
