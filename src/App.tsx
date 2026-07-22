import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WalletProvider } from '@/wallet/WalletProvider';
import { IdentityProvider, useIdentity } from '@/identity/IdentityProvider';
import { TourProvider, useTour } from '@/features/tutorial/TourProvider';
import { AppShell } from '@/components/layout/AppShell';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { UnlockScreen } from '@/features/onboarding/UnlockScreen';
import { SendPage } from '@/features/send/SendPage';
import { ReceivePage } from '@/features/receive/ReceivePage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DemoPage } from '@/features/demo/DemoPage';
import { WatchOnlyPage } from '@/features/view/WatchOnlyPage';
import { ScanProvider } from '@/stealth/ScanProvider';
import { NotificationHost } from '@/notifications/NotificationHost';
import { AutoPublishHost } from '@/notifications/AutoPublishHost';
import { useSession } from '@/store/session';

export function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <IdentityProvider>
          <TourProvider>
            {/* `/view` is watch-only and needs no identity, so it sits OUTSIDE the
                identity gate; every other path is gated by <Gate />. */}
            <Routes>
              <Route path="/view" element={<WatchOnlyPage />} />
              <Route path="*" element={<Gate />} />
            </Routes>
          </TourProvider>
        </IdentityProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

/**
 * The whole app is gated on identity: nothing is reachable until one exists and
 * is unlocked. No identity → onboarding; locked → passphrase; unlocked → app.
 */
function Gate() {
  const { hydrated, status } = useIdentity();
  const sendOnly = useSession((s) => s.sendOnly);
  const tour = useTour();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Loader2 className="size-5 animate-spin text-copper-500" />
      </div>
    );
  }

  // Send-only mode: the user skipped identity creation. With no vault, only Send
  // works (it needs a wallet, not an identity), so we lock the app to /send —
  // every other route and any direct URL bounces back. An existing unlocked
  // vault always takes precedence, so this only applies before one exists.
  if (sendOnly && status === 'absent') {
    return (
      <AppShell sendOnly>
        <Routes>
          <Route path="/" element={<Navigate to="/send" replace />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="*" element={<Navigate to="/send" replace />} />
        </Routes>
      </AppShell>
    );
  }

  if (status === 'absent') {
    return <OnboardingFlow onComplete={() => tour.start()} />;
  }

  if (status === 'locked') {
    return <UnlockScreen />;
  }

  // One app-wide scan engine (feeds Receive, notifications, and auto-claim) plus
  // the invisible notification/auto-claim host, live for the whole unlocked app
  // so payments are detected on any page — not only on Receive.
  return (
    <ScanProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/send" replace />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/receive" element={<ReceivePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="*" element={<Navigate to="/send" replace />} />
        </Routes>
      </AppShell>
      <NotificationHost />
      <AutoPublishHost />
    </ScanProvider>
  );
}
