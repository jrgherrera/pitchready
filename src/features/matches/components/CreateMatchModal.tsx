import { useEffect, useState } from 'react';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import { useT } from '../../../i18n';
import type { CreateMatchForm } from '../../../types';
import { WEEKLY_MATCH_LIMIT } from '../../../utils/weeks';
import { getLocationAddress, getLocationLabel } from '../../../utils/location';
import { countMyActiveMatchesInWeek } from '../api/matchWrites';
import { isWeekAtLimit } from '../api/weeklyLimit';
import { LocationPickerModal } from './LocationPickerModal';

interface CreateMatchModalProps {
  form: CreateMatchForm;
  /** The host — the weekly cap counts matches they created */
  uid: string;
  creating: boolean;
  /** Same form, editing an existing match — only the wording changes */
  editing?: boolean;
  onChange: (form: CreateMatchForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CreateMatchModal({
  form,
  uid,
  creating,
  editing = false,
  onChange,
  onClose,
  onSubmit,
}: CreateMatchModalProps) {
  const t = useT();
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [weekFull, setWeekFull] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  // Editing keeps the match's own slot, so only a new match is checked, and only once it has a date
  useEffect(() => {
    setWeekFull(false);
    setLookupFailed(false);
    if (editing || !form.date) return;
    let stale = false;
    const [y, m, d] = form.date.split('-').map(Number);
    countMyActiveMatchesInWeek(uid, new Date(y, m - 1, d))
      .then((count) => !stale && setWeekFull(isWeekAtLimit(count)))
      .catch(() => {
        // Fail open, loudly: a transient read error must not block a host, but silence would
        // make the cap look like it works while it does not
        if (!stale) setLookupFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [editing, uid, form.date]);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/80 flex items-end justify-center">
        <div className="absolute inset-0" onClick={creating ? undefined : onClose} />

        <div className="w-full max-w-md bg-[#0a1c17] border-t border-[#1f453a] rounded-t-2xl max-h-[90vh] overflow-y-auto z-10 px-6 pb-8 pt-4 space-y-5 animate-slide-up">
          <div className="flex justify-center mb-1">
            <div
              className="w-12 h-1.5 bg-[#1f453a] rounded-full cursor-pointer"
              onClick={creating ? undefined : onClose}
            />
          </div>

          <div className="flex justify-between items-center">
            <h2 className="font-anton text-2xl text-[#d4f000] uppercase tracking-wider">
              {editing ? t('createMatch.editTitle') : t('createMatch.title')}
            </h2>
            <button
              onClick={onClose}
              disabled={creating}
              className="p-1 rounded-full text-gray-400 hover:text-white disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 block">{t('createMatch.matchName')}</label>
              <input
                type="text"
                placeholder={t('createMatch.matchNamePlaceholder')}
                className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                required
                disabled={creating}
                value={form.title}
                onChange={(e) => onChange({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 block">{t('createMatch.location')}</label>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowMapPicker(true)}
                className="w-full p-3 bg-[#020f0b] border border-[#1f453a] hover:border-[#d4f000] text-left rounded-lg text-sm transition-all disabled:opacity-60"
              >
                {form.location ? (
                  <span className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[#d4f000] shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-white font-medium truncate">
                        {getLocationLabel(form.location)}
                      </span>
                      {getLocationAddress(form.location) !== getLocationLabel(form.location) && (
                        <span className="block text-xs text-gray-400 mt-0.5 line-clamp-2">
                          {getLocationAddress(form.location)}
                        </span>
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-gray-500">
                    <MapPin className="w-4 h-4 text-[#d4f000]" />
                    {t('createMatch.tapToChoose')}
                  </span>
                )}
              </button>
              {form.location && (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => onChange({ ...form, location: null })}
                  className="text-[11px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 disabled:opacity-40 flex items-center gap-1 pt-0.5"
                >
                  <X className="w-3.5 h-3.5" /> {t('createMatch.removeLocation')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 block">{t('createMatch.date')}</label>
                <input
                  type="date"
                  className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                  required
                  disabled={creating}
                  value={form.date}
                  onChange={(e) => onChange({ ...form, date: e.target.value })}
                />
                {lookupFailed && (
                  <p role="alert" className="text-[11px] text-amber-400 pt-0.5">
                    {t('createMatch.weeklyLimitUnchecked')}
                  </p>
                )}
                {weekFull && (
                  <p role="alert" className="text-[11px] text-red-400 pt-0.5">
                    {t('createMatch.weeklyLimit', { count: WEEKLY_MATCH_LIMIT })}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 block">{t('createMatch.time')}</label>
                <input
                  type="time"
                  className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                  required
                  disabled={creating}
                  value={form.time}
                  onChange={(e) => onChange({ ...form, time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 block">
                  {t('createMatch.totalPlayers')}
                </label>
                <input
                  type="number"
                  min={2}
                  max={40}
                  step={1}
                  required
                  disabled={creating}
                  className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                  value={form.capacity}
                  onChange={(e) => onChange({ ...form, capacity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 block">
                  {t('createMatch.durationMins')}
                </label>
                <input
                  type="number"
                  min={30}
                  max={180}
                  step={15}
                  required
                  disabled={creating}
                  className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                  value={form.duration}
                  onChange={(e) => onChange({ ...form, duration: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 block">
                {t('createMatch.pricePerHead')}
              </label>
              <input
                type="number"
                placeholder="2000"
                step="100"
                min="0"
                className="w-full p-3 bg-[#020f0b] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm transition-all"
                disabled={creating}
                value={form.price}
                onChange={(e) =>
                  onChange({ ...form, price: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
            </div>

            <button
              type="submit"
              disabled={creating || weekFull}
              className="w-full bg-[#d4f000] hover:bg-[#b0c800] text-[#001710] font-anton py-4 rounded-xl uppercase tracking-wider text-base transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#d4f000]/10 disabled:opacity-80"
            >
            {creating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />{' '}
                {editing ? t('createMatch.saving') : t('createMatch.publishing')}
              </>
            ) : (
                <>
                  {editing ? t('createMatch.save') : t('createMatch.publish')}{' '}
                  <Check className="w-5 h-5 stroke-[3]" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {showMapPicker && (
        <LocationPickerModal
          initial={form.location}
          onClose={() => setShowMapPicker(false)}
          onConfirm={(location) => {
            onChange({ ...form, location });
            setShowMapPicker(false);
          }}
        />
      )}
    </>
  );
}
