import { useT } from '../../i18n';
import type { PlayerRole } from '../../types';

interface RoleSelectProps {
  value: PlayerRole;
  onChange: (role: PlayerRole) => void;
  className?: string;
  includeCaptainFirst?: boolean;
}

export function RoleSelect({
  value,
  onChange,
  className = 'w-full p-3 bg-[#0a1c17] border border-[#1f453a] text-white focus:border-[#d4f000] rounded-lg text-sm',
  includeCaptainFirst = false,
}: RoleSelectProps) {
  const t = useT();

  const options = includeCaptainFirst
    ? (
      <>
        <option value="Captain">{t('roles.Captain')}</option>
        <option value="Striker">{t('roles.Striker')}</option>
        <option value="Midfield">{t('roles.Midfield')}</option>
        <option value="Defender">{t('roles.Defender')}</option>
        <option value="Keeper">{t('roles.Keeper')}</option>
      </>
    )
    : (
      <>
        <option value="Striker">{t('roles.Striker')}</option>
        <option value="Midfield">{t('roles.Midfield')}</option>
        <option value="Defender">{t('roles.Defender')}</option>
        <option value="Keeper">{t('roles.Keeper')}</option>
        <option value="Captain">{t('roles.Captain')}</option>
      </>
    );

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as PlayerRole)}
    >
      {options}
    </select>
  );
}
