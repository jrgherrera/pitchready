import { Loader2 } from 'lucide-react';
import { useT } from '../../i18n';

export function LoadingScreen() {
  const t = useT();
  return (
    <div className="min-h-screen bg-[#020f0b] flex flex-col items-center justify-center text-[#d4f000]">
      <Loader2 className="w-12 h-12 animate-spin mb-4" />
      <p className="font-anton tracking-widest text-lg uppercase">{t('common.loading')}</p>
    </div>
  );
}
