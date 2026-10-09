import AppHeader from './AppHeader.jsx';
import BottomNav from './BottomNav.jsx';

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <AppHeader />

      <main className="app-main">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}