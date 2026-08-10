import { useState } from 'react';
import { AppHeader, BottomNav } from './components/layout/AppShell';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { ForgotPasswordForm } from './features/auth/components/ForgotPasswordForm';
import { LoginScreen } from './features/auth/components/LoginScreen';
import { OnboardingScreen } from './features/auth/components/OnboardingScreen';
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
import type { AppTab } from './types';

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
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    createForm,
    setCreateForm,
    creatingMatch,
    signUpStatus,
    createMatch,
    deleteMatch,
    joinOrLeaveMatch,
    addGuestPlusOne,
    removeGuestPlusOne,
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
        initialName={profile?.name || user.displayName || ''}
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

  const activeMatch = matches.find((m) => m.id === activeMatchId);

  if (activeMatchId && activeMatch) {
    return (
      <MatchDetailView
        match={activeMatch}
        profile={profile}
        players={allPlayers}
        signUpStatus={signUpStatus}
        onBack={() => setActiveMatchId(null)}
        onJoinLeave={joinOrLeaveMatch}
        onAddGuest={addGuestPlusOne}
        onRemoveGuest={removeGuestPlusOne}
        onDelete={deleteMatch}
      />
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
            onProfileChange={setProfile}
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
