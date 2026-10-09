import { Route, Routes } from 'react-router-dom';

import WakeUpBanner from './components/WakeUpBanner.jsx';
import AppShell from './components/AppShell.jsx';

import { useWakeUp } from './hooks/useWakeUp.js';

import HistoryPage from './pages/HistoryPage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

export default function App() {
  const wake = useWakeUp();

  return (
    <AppShell>
      <div className="page-container">
        <WakeUpBanner state={wake} />

        <Routes>
          <Route
            path="/"
            element={<UploadPage />}
          />

          <Route
            path="/scan/:id"
            element={<ScanPage />}
          />

          <Route
            path="/history"
            element={<HistoryPage />}
          />

          <Route
            path="*"
            element={
              <p className="center">
                Page not found.
              </p>
            }
          />
        </Routes>
      </div>
    </AppShell>
  );
}