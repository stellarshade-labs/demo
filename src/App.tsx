import { Navigate, Route, Routes } from 'react-router-dom';
import { WalletProvider } from '@/wallet/WalletProvider';
import { StealthKeysProvider } from '@/stealth/StealthKeysProvider';
import { AppShell } from '@/components/layout/AppShell';
import { SendPage } from '@/features/send/SendPage';
import { ReceivePage } from '@/features/receive/ReceivePage';
import { HistoryPage } from '@/features/history/HistoryPage';

export function App() {
  return (
    <WalletProvider>
      <StealthKeysProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/send" replace />} />
            <Route path="/send" element={<SendPage />} />
            <Route path="/receive" element={<ReceivePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/send" replace />} />
          </Routes>
        </AppShell>
      </StealthKeysProvider>
    </WalletProvider>
  );
}
