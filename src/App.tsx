import { useEffect, useState } from 'react';
import { getStoredGuestName } from './utils/guestName';
import { AppHeader, BottomNav } from './components/layout/AppShell';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { ForgotPasswordForm } from './features/auth/components/ForgotPasswordForm';
import { LoginScreen } from './features/auth/components/LoginScreen';
import { OnboardingScreen } from './features/auth/components/OnboardingScreen';
import { UpgradeAccountScreen } from './features/auth/components/UpgradeAccountScreen';
import { VerifyEmailScreen } from './features/auth/components/VerifyEmailScreen';
import { useAuth } from './features/auth/hooks/useAuth';
import { CreateMatchModal } from './features/matches/components/CreateMatchModal';
import { DashboardTab } from './features/matches/components/DashboardTab';
import { MatchDetailView } from './features/matches/components/MatchDetailView';
import { MatchesTab } from './features/matches/components/MatchesTab';
import { useMatchActions } from './features/matches/hooks/useMatchActions';
import { useMatches } from './features/matches/hooks/useMatches';
import { PlayersTab } from './features/players/components/PlayersTab';
import { usePlayers } from './features/players/hooks/usePlayers';
import { SettingsTab } from './features/settings/components/SettingsTab';
import type { AppTab, MatchData } from './types';
import {
  canManageMatch,
  getStoredSuperAdminMode,
  matchIdFromPath,
  storeSuperAdminMode,
} from './utils/matches';

type AuthView = 'login' | 'forgot-password';

export default function App() {
  const {
    user,
    profile,
    setProfile,
    authLoading,
    gate,
    authError,
    statusMessage,
    authBusy,
    clearMessages,
    signUp,
    signIn,
    isGuest,
    upgradeGuestWithGoogle,
    upgradeGuestWithPassword,
    requestMagicLink,
    resetPassword,
    loginWithGoogle,
    logout,
    resendVerification,
    refreshUser,
    completeOnboarding,
    updateUserProfile,
  } = useAuth();

  const { matches, matchesLoading } = useMatches(user);
  const { allPlayers } = usePlayers(user);

  const [authView, setAuthView] = useState<AuthView>('login');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  // Shared links land on /match/<id> (hosting rewrites it to index.html)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(
    () => matchIdFromPath(window.location.pathname),
  );
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [superAdminMode, setSuperAdminMode] = useState(getStoredSuperAdminMode);

  // Once linked the guest is gone: drop the screen so it cannot reappear for a later guest
  useEffect(() => {
    if (!isGuest) setShowUpgrade(false);
  }, [isGuest]);

  // Keep the address bar on the open match so a refresh or a copied URL lands back here
  useEffect(() => {
    const path = activeMatchId ? `/match/${activeMatchId}` : '/';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [activeMatchId]);

  const {
    createForm,
    setCreateForm,
    creatingMatch,
    signUpStatus,
    createMatch,
    editingMatchId,
    startEditMatch,
    cancelEditMatch,
    updateMatch,
    deleteMatch,
    joinOrLeaveMatch,
    addGuestPlusOne,
    removeGuestPlusOne,
    saveTeams,
  } = useMatchActions(
    profile,
    (matchId) => {
      setShowCreateModal(false);
      setActiveMatchId(matchId);
    },
    () => setActiveMatchId(null),
  );

  if (authLoading || gate === 'loading') {
    return <LoadingScreen />;
  }

  if (gate === 'unauthenticated') {
    if (authView === 'forgot-password') {
      return (
        <ForgotPasswordForm
          busy={authBusy}
          error={authError}
          status={statusMessage}
          onSubmit={async (email) => {
            await resetPassword(email);
          }}
          onBack={() => {
            clearMessages();
            setAuthView('login');
          }}
        />
      );
    }

    return (
      <LoginScreen
        busy={authBusy}
        error={authError}
        status={statusMessage}
        onSignIn={async (email, password) => {
          await signIn(email, password);
        }}
        onSignUp={async (email, password) => {
          await signUp(email, password);
        }}
        onMagicLink={async (email) => {
          await requestMagicLink(email);
        }}
        onGoogleLogin={async () => {
          await loginWithGoogle();
        }}
        onForgotPassword={() => {
          clearMessages();
          setAuthView('forgot-password');
        }}
      />
    );
  }

  if (gate === 'verify-email' && user) {
    return (
      <VerifyEmailScreen
        email={user.email}
        busy={authBusy}
        error={authError}
        status={statusMessage}
        onResend={resendVerification}
        onRefresh={refreshUser}
        onLogout={() => {
          void logout();
          setAuthView('login');
        }}
      />
    );
  }

  if (gate === 'onboarding' && user) {
    return (
      <OnboardingScreen
        initialName={profile?.name || user.displayName || getStoredGuestName()}
        busy={authBusy}
        error={authError}
        onSubmit={completeOnboarding}
        onLogout={() => {
          void logout();
          setAuthView('login');
        }}
      />
    );
  }

  if (!user || !profile) {
    return <LoadingScreen />;
  }

  if (isGuest && showUpgrade) {
    return (
      <UpgradeAccountScreen
        busy={authBusy}
        error={authError}
        onGoogle={async () => {
          await upgradeGuestWithGoogle();
        }}
        onPassword={async (email, password) => {
          await upgradeGuestWithPassword(email, password);
        }}
        onBack={() => {
          clearMessages();
          setShowUpgrade(false);
        }}
      />
    );
  }

  const activeMatch = matches.find((m) => m.id === activeMatchId);
  const canManage = (match: MatchData) => canManageMatch(match, profile, superAdminMode);

  if (activeMatchId && activeMatch) {
    return (
      <>
        <MatchDetailView
          match={activeMatch}
          profile={profile}
          players={allPlayers}
          signUpStatus={signUpStatus}
          canManage={canManage(activeMatch)}
          onBack={() => setActiveMatchId(null)}
          onJoinLeave={joinOrLeaveMatch}
          onAddGuest={addGuestPlusOne}
          onRemoveGuest={removeGuestPlusOne}
          onSaveTeams={saveTeams}
          onEdit={startEditMatch}
          onDelete={deleteMatch}
        />

        {editingMatchId && (
          <CreateMatchModal
            form={createForm}
            creating={creatingMatch}
            editing
            onChange={setCreateForm}
            onClose={cancelEditMatch}
            onSubmit={updateMatch}
          />
        )}
      </>
    );
  }

  const changeTab = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveMatchId(null);
  };

  return (
    <div className="bg-[#020f0b] text-white min-h-screen pb-24 font-archivo">
      <AppHeader profile={profile} onOpenSettings={() => changeTab('settings')} />

      <main className="max-w-md mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            matches={matches}
            matchesLoading={matchesLoading}
            players={allPlayers}
            canHostMatches={Boolean(profile.admin)}
            canManage={canManage}
            onOpenMatch={setActiveMatchId}
            onCreateMatch={() => setShowCreateModal(true)}
            onViewAllMatches={() => changeTab('matches')}
          />
        )}

        {activeTab === 'matches' && (
          <MatchesTab
            matches={matches}
            matchesLoading={matchesLoading}
            canHostMatches={Boolean(profile.admin)}
            onOpenMatch={setActiveMatchId}
            onCreateMatch={() => setShowCreateModal(true)}
          />
        )}

        {activeTab === 'players' && (
          <PlayersTab players={allPlayers} currentUserId={profile.id} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            profile={profile}
            superAdminMode={superAdminMode}
            onProfileChange={setProfile}
            onSuperAdminModeChange={(enabled) => {
              storeSuperAdminMode(enabled);
              setSuperAdminMode(enabled);
            }}
            onUpgrade={
              isGuest
                ? () => {
                    clearMessages();
                    setShowUpgrade(true);
                  }
                : undefined
            }
            onSave={(e) => {
              e.preventDefault();
              void updateUserProfile(profile);
            }}
            onLogout={() => {
              void logout();
              setActiveMatchId(null);
              setAuthView('login');
            }}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onChangeTab={changeTab} />

      {showCreateModal && profile.admin && (
        <CreateMatchModal
          form={createForm}
          creating={creatingMatch}
          onChange={setCreateForm}
          onClose={() => setShowCreateModal(false)}
          onSubmit={createMatch}
        />
      )}
    </div>
  );
}
