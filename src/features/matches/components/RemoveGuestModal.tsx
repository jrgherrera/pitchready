import { Loader2, Trash2, X } from 'lucide-react';
import { useT } from '../../../i18n';
import { getAvatarUrl } from '../../../utils/avatars';

interface RemoveGuestModalProps {
  /** Resolved by resolveRoster, so an unnamed +1 already reads "Guest". */
  guestName: string;
  hostName: string;
  hostId: string;
  hostPhotoURL?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function RemoveGuestModal({
  guestName,
  hostName,
  hostId,
  hostPhotoURL,
  busy = false,
  onConfirm,
  onClose,
}: RemoveGuestModalProps) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-end justify-center">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />
      <div className="w-full max-w-md bg-[#0a1c17] border-t border-[#1f453a] rounded-t-2xl z-10 px-6 pb-8 pt-4 space-y-5 animate-slide-up">
        <div className="flex justify-center mb-1">
          <div className="w-12 h-1.5 bg-[#1f453a] rounded-full" />
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-anton text-2xl text-[#d4f000] uppercase tracking-wider">
              {t('matches.removeGuestTitle')}
            </h2>
            <p className="text-xs text-gray-400 mt-1">{t('matches.removeGuestBody')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-full text-gray-400 hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center py-4">
          <div className="relative w-20 h-20 rounded-full border-2 border-[#1f453a] p-0.5 bg-[#0a1c17] mb-3">
            <img
              src={getAvatarUrl(hostId, hostPhotoURL)}
              alt={hostName}
              referrerPolicy="no-referrer"
              className="w-full h-full rounded-full object-cover"
            />
            <div className="absolute -top-1 -right-1 bg-[#d4f000] text-[#001710] rounded-full min-w-7 h-7 px-1.5 flex items-center justify-center shadow font-anton text-[11px] leading-none">
              +1
            </div>
          </div>
          <p className="font-bold text-white text-base">{guestName}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mt-0.5">
            {t('matches.plusOneFor', { name: hostName })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="py-3.5 rounded-xl border border-[#1f453a] text-gray-300 font-anton uppercase tracking-wider text-sm hover:bg-[#0f2d24] disabled:opacity-50"
          >
            {t('matches.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="py-3.5 rounded-xl bg-red-950/50 text-red-400 border border-red-900/60 font-anton uppercase tracking-wider text-sm hover:bg-red-900/50 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t('matches.removeGuestConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
