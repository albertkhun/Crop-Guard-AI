import { NavLink } from 'react-router-dom';

function LoumiLogo() {
  return (
    <div className="loumi-logo" aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M24 42C24 42 11 34.8 11 21.5C11 13.7 16.6 7.7 24 6C31.4 7.7 37 13.7 37 21.5C37 34.8 24 42 24 42Z"
          fill="currentColor"
          opacity="0.12"
        />
        <path
          d="M24 39.5C24 39.5 14 33.5 14 23C14 15.8 18.2 10.5 24 8.5C29.8 10.5 34 15.8 34 23C34 33.5 24 39.5 24 39.5Z"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M24 38V17"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M24 27C20.5 24.5 18 21.5 17 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M24 30C28 27.5 30.5 24.5 31.5 21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
      <path d="M4 7v4h4" />
    </svg>
  );
}

function AssistantIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
      <path d="M7.5 10h9M7.5 13h6" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 21c.7-4 3.1-6 7-6s6.3 2 7 6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

const navItems = [
  {
    label: 'Home',
    to: '/',
    end: true,
    icon: HomeIcon,
  },
  {
    label: 'Detect',
    to: '/',
    icon: CameraIcon,
  },
  {
    label: 'History',
    to: '/history',
    icon: HistoryIcon,
  },
];

function DesktopNav() {
  return (
    <nav className="loumi-desktop-nav" aria-label="Main navigation">
      <NavLink to="/" end className="loumi-nav-link">
        <HomeIcon />
        <span>Home</span>
      </NavLink>

      <NavLink to="/" className="loumi-nav-link">
        <CameraIcon />
        <span>Detect</span>
      </NavLink>

      <NavLink to="/history" className="loumi-nav-link">
        <HistoryIcon />
        <span>History</span>
      </NavLink>

      <button type="button" className="loumi-nav-link loumi-nav-link--static">
        <AssistantIcon />
        <span>Assistant</span>
      </button>

      <button type="button" className="loumi-nav-link loumi-nav-link--static">
        <ProfileIcon />
        <span>Profile</span>
      </button>
    </nav>
  );
}

export default function Header() {
  return (
    <header className="loumi-header">
      <div className="loumi-header__inner">
        <NavLink to="/" className="loumi-brand" aria-label="Loumi AI home">
          <LoumiLogo />

          <div className="loumi-brand__text">
            <strong>Loumi AI</strong>
            <span>Smarter farming. Healthier crops.</span>
          </div>
        </NavLink>

        <DesktopNav />

        <div className="loumi-header__actions">
          <button
            type="button"
            className="loumi-icon-button loumi-notification"
            aria-label="Notifications"
          >
            <BellIcon />
            <span className="loumi-notification__dot" />
          </button>

          <button
            type="button"
            className="loumi-avatar"
            aria-label="Profile"
          >
            <span>LU</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export {
  LoumiLogo,
  HomeIcon,
  CameraIcon,
  HistoryIcon,
  AssistantIcon,
  ProfileIcon,
};