import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  CameraIcon,
  HistoryIcon,
  AssistantIcon,
  ProfileIcon,
} from './Header.jsx';

export default function BottomNav() {
  return (
    <nav className="loumi-bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end className="loumi-bottom-nav__item">
        <HomeIcon />
        <span>Home</span>
      </NavLink>

      <NavLink to="/" className="loumi-bottom-nav__item">
        <CameraIcon />
        <span>Detect</span>
      </NavLink>

      <NavLink to="/history" className="loumi-bottom-nav__item">
        <HistoryIcon />
        <span>History</span>
      </NavLink>

      <button type="button" className="loumi-bottom-nav__item">
        <AssistantIcon />
        <span>Assistant</span>
      </button>

      <button type="button" className="loumi-bottom-nav__item">
        <ProfileIcon />
        <span>Profile</span>
      </button>
    </nav>
  );
}