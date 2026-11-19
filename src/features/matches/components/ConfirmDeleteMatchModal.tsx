import { Loader2, Trash2, X } from 'lucide-react';
import { useT } from '../../../i18n';

interface ConfirmDeleteMatchModalProps {
  /** Shown so the confirmation names what it is about to destroy. */
  matchTitle: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The single confirmation for deleting a match, used by both the card in the list and the detail
 * view. It replaced a `window.confirm` that lived inside `deleteMatch` itself — see the comment
 * there. Deleting is irreversible and wipes the match for every member, so the copy says so and
 * the title is named: in a list of cards, "are you sure?" alone does not tell you which one.
 */
export function ConfirmDeleteMatchModal({
  matchTitle,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDeleteMatchModalProps) {
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('matches.deleteMatchTitle')}
    >
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />
      <div className="w-full max-w-md bg-[#0a1c17] border-t border-[#1f453a] rounded-t-2xl z-10 px-6 pb-8 pt-4 space-y-5 animate-slide-up">
        <div className="flex justify-center mb-1">
          <div className="w-12 h-1.5 bg-[#1f453a] rounded-full" />
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-anton text-2xl text-[#d4f000] uppercase tracking-wider">
              {t('matches.deleteMatchTitle')}
            </h2>
            <p className="text-xs text-gray-400 mt-1">{t('matches.deleteMatchBody')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('matches.cancel')}
            className="p-1 rounded-full text-gray-400 hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#020f0b] border border-[#1f453a]/40 rounded-lg px-4 py-3">
          <p className="font-anton text-lg text-white leading-tight break-words">{matchTitle}</p>
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
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t('matches.deleteMatchConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
