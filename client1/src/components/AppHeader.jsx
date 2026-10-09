import { NavLink } from 'react-router-dom';

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const paths = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h4l1.5-2h5L16 7h4v12H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    message: (
      <>
        <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M8 10h8M8 13h5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const items = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/', label: 'Detect', icon: 'camera', end: true },
  { to: '/history', label: 'History', icon: 'history' },
];

export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <NavLink to="/" className="app-brand">
          <span className="app-brand__logo">🌱</span>

          <span>
            <strong>CropGuard AI</strong>
            <small>Smarter farming. Healthier crops.</small>
          </span>
        </NavLink>

        <nav className="desktop-nav" aria-label="Main navigation">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `desktop-nav__item ${isActive ? 'active' : ''}`
              }
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-header__actions">
          <button
            type="button"
            className="header-icon"
            aria-label="Notifications"
          >
            <span className="notification-dot" />
            🔔
          </button>

          <div className="profile-avatar" aria-hidden="true">
            👨🏽‍🌾
          </div>
        </div>
      </div>
    </header>
  );
}

export { Icon };