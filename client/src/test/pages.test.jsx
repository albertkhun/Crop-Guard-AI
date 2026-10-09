import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client.js';
import WakeUpBanner from '../components/WakeUpBanner.jsx';
import { useWakeUp } from '../hooks/useWakeUp.js';
import HistoryPage from '../pages/HistoryPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import ScanPage from '../pages/ScanPage.jsx';
import classes from './fixtures/classes.json';
import history from './fixtures/history.json';
import ok from './fixtures/scan_ok.json';

afterEach(() => vi.restoreAllMocks());
const inRouter = (ui, entry = '/') => render(<MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>);

describe('HistoryPage (real history response)', () => {
  it('lists scans with status, date, district and links to each result', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: null });
    inRouter(<HistoryPage />);
    const rows = await screen.findAllByRole('link');
    expect(rows).toHaveLength(history.items.length);
    expect(screen.getAllByText('Rice Blast').length).toBeGreaterThan(0);
    expect(screen.getAllByText('More information needed').length + screen.getAllByText('Photo unclear').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Imphal West/).length).toBeGreaterThan(0);
    expect(rows[0]).toHaveAttribute('href', `/scan/${history.items[0].id}`);
  });

  it('empty state offers to scan', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: [], nextBefore: null });
    inRouter(<HistoryPage />);
    expect(await screen.findByText('No scans yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scan your first leaf/i })).toBeInTheDocument();
  });

  it('error state with working retry', async () => {
    const spy = vi.spyOn(api, 'listScans')
      .mockRejectedValueOnce(new ApiError('network_error', "Can't reach the server.", 0))
      .mockResolvedValueOnce({ items: history.items, nextBefore: null });
    inRouter(<HistoryPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't reach the server/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(history.items.length));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('"Load more" appends the next page using the cursor', async () => {
    const [a, ...rest] = history.items;
    const spy = vi.spyOn(api, 'listScans')
      .mockResolvedValueOnce({ items: [a], nextBefore: a.id })
      .mockResolvedValueOnce({ items: rest, nextBefore: null });
    inRouter(<HistoryPage />);
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(history.items.length));
    expect(spy).toHaveBeenLastCalledWith({ before: a.id });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});

describe('HistoryPage filters, search and stats', () => {
  const kinds = () => history.items.map((s) => s.aiResponse.status);
  it('stat cards are computed from the loaded scans', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: null });
    inRouter(<HistoryPage />);
    await screen.findAllByRole('link');
    const total = screen.getByText('Total analyses').previousSibling;
    expect(total).toHaveTextContent(String(history.items.length));
  });
  it('the "+" marks counts as lower bounds while more pages exist', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: 'abc' });
    inRouter(<HistoryPage />);
    await screen.findAllByRole('link');
    expect(screen.getByText('Total analyses').previousSibling).toHaveTextContent(`${history.items.length}+`);
  });
  it('"Needs a new photo" shows only low-confidence and unclear scans', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: null });
    inRouter(<HistoryPage />);
    await screen.findAllByRole('link');
    await userEvent.click(screen.getByRole('button', { name: 'Needs a new photo' }));
    const expected = kinds().filter((k) => k !== 'ok').length;
    expect(screen.queryAllByRole('link')).toHaveLength(expected);
    expect(screen.getByRole('button', { name: 'Needs a new photo' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('search matches the result name and explains an empty match', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: null });
    inRouter(<HistoryPage />);
    await screen.findAllByRole('link');
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz-nothing');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/no analyses match/i)).toBeInTheDocument();
  });
});

describe('HomePage (data comes from the API)', () => {
  it('shows activity counts and the three most recent scans, each linking to its result', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: history.items, nextBefore: null });
    inRouter(<HomePage />);
    const recent = await screen.findAllByRole('link', { name: /confidence|more information|photo unclear/i });
    expect(recent.length).toBeLessThanOrEqual(3);
    expect(recent[0]).toHaveAttribute('href', `/scan/${history.items[0].id}`);
    expect(screen.getByText('Analyses').previousSibling).toHaveTextContent(String(history.items.length));
    expect(screen.getByRole('link', { name: /analyse a leaf/i })).toHaveAttribute('href', '/detect');
  });
  it('first-time user sees an empty state that points to the scan page', async () => {
    vi.spyOn(api, 'listScans').mockResolvedValue({ items: [], nextBefore: null });
    inRouter(<HomePage />);
    expect(await screen.findByText('No scans yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scan your first leaf/i })).toHaveAttribute('href', '/detect');
  });
  it('API failure shows the server message and a retry, while the hero stays usable', async () => {
    const spy = vi.spyOn(api, 'listScans')
      .mockRejectedValueOnce(new ApiError('network_error', "Can't reach the server.", 0))
      .mockResolvedValueOnce({ items: history.items, nextBefore: null });
    inRouter(<HomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't reach the server/i);
    expect(screen.getByRole('link', { name: /analyse a leaf/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('ScanPage', () => {
  const routes = (
    <Routes><Route path="/scan/:id" element={<ScanPage />} /><Route path="/" element={<p>HOME</p>} /><Route path="/history" element={<p>HIST</p>} /></Routes>
  );
  it('uses the scan passed from the upload page without refetching', () => {
    const spy = vi.spyOn(api, 'getScan');
    render(<MemoryRouter initialEntries={[{ pathname: `/scan/${ok.id}`, state: { scan: ok } }]}>{routes}</MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Rice Blast', level: 2 })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
  it('deep link: fetches by id, then shows the result', async () => {
    vi.spyOn(api, 'classes').mockResolvedValue(classes.classes);
    vi.spyOn(api, 'getScan').mockResolvedValue(ok);
    inRouter(routes, `/scan/${ok.id}`);
    expect(screen.getByText(/loading scan/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Rice Blast', level: 2 })).toBeInTheDocument();
  });
  it('404 shows a friendly message and a way back', async () => {
    vi.spyOn(api, 'getScan').mockRejectedValue(new ApiError('not_found', 'Scan not found.', 404));
    inRouter(routes, '/scan/aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't find that scan/i);
    expect(screen.getByRole('link', { name: /back to history/i })).toBeInTheDocument();
  });
});

describe('wake-up banner + hook', () => {
  it('banner explains the cold start while waking, and is silent when up', () => {
    const { rerender } = render(<WakeUpBanner state="waking" />);
    const b = screen.getByRole('status');
    expect(b).toHaveTextContent(/waking up the ai service/i);
    expect(b).toHaveTextContent(/up to a minute/i);
    rerender(<WakeUpBanner state="checking" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows "ready" briefly after having been asleep', () => {
    const { rerender } = render(<WakeUpBanner state="waking" />);
    rerender(<WakeUpBanner state="up" />);
    expect(screen.getByRole('status')).toHaveTextContent(/ready/i);
  });
  it('hook polls until the AI service answers, then stops', async () => {
    const check = vi.fn().mockResolvedValueOnce('waking').mockResolvedValueOnce('waking').mockResolvedValue('up');
    function Probe() { return <p data-testid="s">{useWakeUp({ intervalMs: 10, check })}</p>; }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('up'));
    const calls = check.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(check.mock.calls.length).toBe(calls); // stopped polling
    expect(calls).toBe(3);
  });
});
