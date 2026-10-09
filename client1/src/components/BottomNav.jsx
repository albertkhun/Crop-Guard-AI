import { NavLink } from 'react-router-dom';
import { Icon } from './AppHeader.jsx';

const items = [
  {
    to: '/',
    label: 'Home',
    icon: 'home',
    end: true,
  },
  {
    to: '/',
    label: 'Detect',
    icon: 'camera',
    end: true,
  },
  {
    to: '/history',
    label: 'History',
    icon: 'history',
  },
  {
    to: '#',
    label: 'Assistant',
    icon: 'message',
  },
  {
    to: '#',
    label: 'Profile',
    icon: 'user',
  },
];

export default function BottomNav() {
  function handleUnavailable(e, label) {
    if (label === 'Assistant' || label === 'Profile') {
      e.preventDefault();
    }
  }

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.end}
          onClick={(e) => handleUnavailable(e, item.label)}
          className={({ isActive }) =>
            `bottom-nav__item ${
              isActive && item.to !== '#'
                ? 'active'
                : ''
            }`
          }
        >
          <span className="bottom-nav__icon">
            <Icon name={item.icon} size={21} />
          </span>

          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}