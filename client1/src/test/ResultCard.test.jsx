import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client.js';
import ResultCard from '../components/ResultCard.jsx';
import classes from './fixtures/classes.json';
import low from './fixtures/scan_low.json';
import ok from './fixtures/scan_ok.json';
import okNoLoc from './fixtures/scan_ok_noloc.json';
import unclear from './fixtures/scan_unclear.json';

// All fixtures are REAL responses captured from Express -> FastAPI -> MongoDB.
const show = (scan, onRetake = vi.fn()) => {
  render(<MemoryRouter><ResultCard scan={scan} onRetake={onRetake} /></MemoryRouter>);
  return onRetake;
};
beforeEach(() => { vi.spyOn(api, 'classes').mockResolvedValue(classes.classes); });

describe('status = ok', () => {
  it('shows diagnosis, RAW confidence, runners-up, advice and the safety note', () => {
    show(ok);
    expect(screen.getByRole('heading', { name: 'Rice Blast', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /image model confidence/i })).toHaveAttribute('aria-valuenow', '93');
    const others = screen.getByRole('region', { name: 'Other possibilities' });
    expect(within(others).getByText('Brown Spot')).toBeInTheDocument();
    expect(within(others).queryByText('Rice Blast')).not.toBeInTheDocument(); // winner is not repeated
    expect(screen.getByText(/What to do now/)).toBeInTheDocument();
    expect(screen.getByText(/confirm with your local agriculture officer/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload another photo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /uploaded leaf/i })).toHaveAttribute('src', ok.imageRef.url);
  });

  it('weather is labelled as rule-based and NOT part of the AI diagnosis (honest framing)', () => {
    show(ok);
    const w = screen.getByRole('region', { name: 'Weather context' });
    expect(within(w).getByText(/not part of the AI diagnosis/i)).toBeInTheDocument();
    expect(within(w).getAllByText(/Rule-based environmental context; trainable fusion is future work/).length).toBeGreaterThan(0);
    expect(within(w).getAllByText(/unverified placeholders/i).length).toBeGreaterThan(0); // server flags placeholder thresholds
    expect(within(w).getByText('Hours above 90% humidity')).toBeInTheDocument();
    expect(within(w).queryByText(/fusion model|trained on weather/i)).not.toBeInTheDocument();
  });

  it('without a location, prompts to add one instead of showing weather', () => {
    show(okNoLoc);
    expect(screen.getByText(/Add a location to see weather context/i)).toBeInTheDocument();
  });

  it('weather unavailable (but a location was given) is explained, diagnosis unaffected', () => {
    show({ ...ok, aiResponse: { ...ok.aiResponse, weather: null } });
    expect(screen.getByText(/Weather context isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rice Blast', level: 2 })).toBeInTheDocument();
  });

  it('a healthy result is styled as good news', () => {
    const healthy = structuredClone(ok);
    healthy.aiResponse.prediction = { class_key: 'normal', display_name: 'Healthy', confidence: 0.97 };
    show(healthy);
    expect(screen.getByText('Looks healthy')).toBeInTheDocument();
  });
});

describe('status = low_confidence', () => {
  it('shows the retake hint and an upload-another button, with NO diagnosis or advice', async () => {
    const onRetake = show(low);
    expect(screen.getByText(/can't give a confident answer/i)).toBeInTheDocument();
    expect(screen.getByText(low.aiResponse.retake_hint)).toBeInTheDocument();
    expect(screen.queryByText('Likely diagnosis')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Advice' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /upload another photo/i }));
    expect(onRetake).toHaveBeenCalledOnce();
  });

  it('lists candidates as "not a diagnosis", showing raw and weather-adjusted scores', () => {
    show(low);
    const c = screen.getByRole('region', { name: /possible matches \(not a diagnosis\)/i });
    expect(within(c).getByText('Rice Blast')).toBeInTheDocument();
    expect(within(c).getByText(/52%/)).toBeInTheDocument();
    expect(within(c).getByText(/after weather context 55\.3%/)).toBeInTheDocument();
  });

  it('offers to record what it really was', async () => {
    show(low);
    expect(await screen.findByLabelText(/what was it actually/i)).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Tungro (viral)' })).toBeInTheDocument();
  });
});

describe('status = unclear_image', () => {
  it('shows the hint and retake button; no weather, no feedback, no advice', async () => {
    const onRetake = show(unclear);
    expect(screen.getByText(/couldn't recognise a clear rice leaf/i)).toBeInTheDocument();
    expect(screen.getByText(unclear.aiResponse.retake_hint)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Weather context' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /feedback/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /upload another photo/i }));
    expect(onRetake).toHaveBeenCalled();
  });
});

describe('misc', () => {
  it('tells the user when the photo could not be saved to history', () => {
    show({ ...ok, imageRef: null, warnings: ['image_not_saved'] });
    expect(screen.getByText(/couldn't be saved to your history/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /uploaded leaf/i })).not.toBeInTheDocument();
  });
});
