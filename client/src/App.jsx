import { NavLink, Route, Routes } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import Logo from './components/Logo.jsx';
import WakeUpBanner from './components/WakeUpBanner.jsx';
import { useWakeUp } from './hooks/useWakeUp.js';
import HistoryPage from './pages/HistoryPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

// Only screens that have real backend support are in the nav.
const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/detect', label: 'Detect', icon: 'camera' },
  { to: '/history', label: 'History', icon: 'clock' },
];

function Links({ className }) {
  return NAV.map((n) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={className}>
      <Icon name={n.icon} size={20} /><span>{n.label}</span>
    </NavLink>
  ));
}

export default function App() {
  const wake = useWakeUp();
  return (
    <>
      <header className="top">
        <div className="wrap top__in">
          <NavLink to="/" className="brand" aria-label="PaddyGuard home">
            <Logo />
            <span><strong>PaddyGuard</strong><small>Smarter farming. Healthier crops.</small></span>
          </NavLink>
          <nav className="topnav" aria-label="Main"><Links /></nav>
        </div>
      </header>
      <main className="wrap">
        <WakeUpBanner state={wake} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/detect" element={<UploadPage />} />
          <Route path="/scan/:id" element={<ScanPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<p className="center">Page not found. <NavLink to="/">Go home</NavLink></p>} />
        </Routes>
      </main>
      <footer className="wrap foot">
        Prototype. AI results can be wrong. Always confirm with your local agriculture officer before treating your crop.
      </footer>
      <nav className="tabbar" aria-label="Main tabs"><Links /></nav>
    </>
  );
}
