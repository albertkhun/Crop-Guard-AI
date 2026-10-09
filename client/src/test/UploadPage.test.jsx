import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client.js';
import UploadPage from '../pages/UploadPage.jsx';
import ok from './fixtures/scan_ok.json';

const jpg = (name = 'leaf.jpg', type = 'image/jpeg') => new File([new Uint8Array(2000)], name, { type });
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/scan/:id" element={<p>RESULT PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const analyse = () => screen.getByRole('button', { name: /analyse photo|analysing/i });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('UploadPage', () => {
  it('defaults the district to Imphal West and disables Analyse until a photo is chosen', async () => {
    renderPage();
    expect(screen.getByLabelText(/or choose your district/i)).toHaveValue('Imphal West');
    expect(screen.getByText(/Weather for Imphal West, Manipur/)).toBeInTheDocument();
    expect(analyse()).toBeDisabled();
    await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
    expect(analyse()).toBeEnabled();
    expect(screen.getByRole('img', { name: /preview/i })).toBeInTheDocument();
  });

  it('tells users what is stored and how to keep location out', () => {
    renderPage();
    expect(screen.getByTestId('privacy-note')).toHaveTextContent(/only this device can open your scans/i);
    expect(screen.getByTestId('privacy-note')).toHaveTextContent(/don't use location/i);
  });

  it('rejects non-JPEG/PNG files with a friendly message', async () => {
    renderPage();
    await userEvent.setup({ applyAccept: false }).upload(screen.getByTestId('gallery-input'), jpg('x.gif', 'image/gif'));
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG or PNG/);
    expect(analyse()).toBeDisabled();
  });

  it('sends image + district coordinates + crop age to the API, then opens the result', async () => {
    const spy = vi.spyOn(api, 'createScan').mockResolvedValue(ok);
    renderPage();
    await userEvent.upload(screen.getByTestId('camera-input'), jpg());
    await userEvent.type(screen.getByLabelText(/days since/i), '45');
    await userEvent.click(analyse());
    await screen.findByText('RESULT PAGE');
    const form = spy.mock.calls[0][0];
    expect(form.get('image')).toBeInstanceOf(File);
    expect([form.get('lat'), form.get('lon'), form.get('district'), form.get('crop_age_days')]).toEqual(['24.817', '93.937', 'Imphal West', '45']);
  });

  it('"skip weather" sends no location fields', async () => {
    const spy = vi.spyOn(api, 'createScan').mockResolvedValue(ok);
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText(/or choose your district/i), "Don't use location (skip weather)");
    await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
    await userEvent.click(analyse());
    await screen.findByText('RESULT PAGE');
    const form = spy.mock.calls[0][0];
    expect([form.get('lat'), form.get('lon'), form.get('district')]).toEqual([null, null, null]);
  });

  it('remembers the chosen district', async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText(/or choose your district/i), 'Thoubal');
    expect(localStorage.getItem('pg.district')).toBe('Thoubal');
  });

  it('blocks an invalid crop age', async () => {
    renderPage();
    await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
    await userEvent.type(screen.getByLabelText(/days since/i), '999');
    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 400/);
    expect(analyse()).toBeDisabled();
  });

  describe('drag and drop + progress', () => {
    it('shows the drop state while dragging, and accepts a dropped JPEG', async () => {
      renderPage();
      const zone = document.querySelector('.dropzone');
      fireEvent.dragEnter(zone);
      expect(screen.getByText('Drop image here')).toBeInTheDocument();
      fireEvent.drop(zone, { dataTransfer: { files: [jpg('dropped.jpg')] } });
      expect(await screen.findByRole('img', { name: /preview/i })).toBeInTheDocument();
      expect(screen.getByText('dropped.jpg')).toBeInTheDocument();
      expect(analyse()).toBeEnabled();
    });
    it('rejects a dropped non-image with the same friendly message', () => {
      renderPage();
      fireEvent.drop(document.querySelector('.dropzone'), { dataTransfer: { files: [jpg('x.gif', 'image/gif')] } });
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to use this image/i);
      expect(screen.getByRole('alert')).toHaveTextContent(/JPEG or PNG/);
    });
    it('progress list reflects the real request: preparing is done and analysing is active while waiting for the server', async () => {
      let finish;
      vi.spyOn(api, 'createScan').mockImplementation(() => new Promise((res) => { finish = () => res(ok); }));
      renderPage();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      const list = await screen.findByRole('list', { name: 'Progress' });
      await waitFor(() => expect(within(list).getByText('Analysing the leaf').closest('li')).toHaveAttribute('data-state', 'active'));
      expect(within(list).getByText('Preparing your photo').closest('li')).toHaveAttribute('data-state', 'done');
      expect(within(list).getByText('Result ready').closest('li')).toHaveAttribute('data-state', 'todo');
      finish();
      await screen.findByText('RESULT PAGE');
    });
    it('a failed request surfaces the server message with the retry', async () => {
      vi.spyOn(api, 'createScan').mockRejectedValue(new ApiError('ai_service_unavailable', 'The AI service is waking up or temporarily unreachable.', 503));
      renderPage();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't finish the analysis/i);
    });
  });

  describe('GPS', () => {
    it('uses GPS coordinates (no district label) when granted', async () => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok_) => ok_({ coords: { latitude: 24.5, longitude: 93.9 } }) } });
      const spy = vi.spyOn(api, 'createScan').mockResolvedValue(ok);
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /use my gps location/i }));
      expect(await screen.findByText(/Using your GPS location \(24\.500, 93\.900\)/)).toBeInTheDocument();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      await screen.findByText('RESULT PAGE');
      const f = spy.mock.calls[0][0];
      expect([f.get('lat'), f.get('lon'), f.get('district')]).toEqual(['24.5', '93.9', null]);
    });

    it('permission denied -> clear message, district dropdown still works', async () => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_o, err) => err({ code: 1 }) } });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /use my gps location/i }));
      expect(await screen.findByText(/permission was denied/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/or choose your district/i)).toBeEnabled();
      expect(screen.getByText(/Weather for Imphal West/)).toBeInTheDocument();
    });
  });

  describe('loading and errors', () => {
    it('shows a busy state, then the cold-start wake-up message after 6 s, and can be cancelled', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let abort;
      vi.spyOn(api, 'createScan').mockImplementation((_f, { signal }) => new Promise((_res, rej) => { abort = () => rej(signal.reason); signal.addEventListener('abort', abort); }));
      renderPage();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      expect(analyse()).toBeDisabled();
      expect(analyse()).toHaveTextContent(/analysing/i);
      expect(screen.queryByText(/may be waking up/i)).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
      expect(screen.getByText(/may be waking up/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(analyse()).toBeEnabled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // user cancel is not an error
    });

    it('AI asleep (503): clear message + Try again that works', async () => {
      const spy = vi.spyOn(api, 'createScan')
        .mockRejectedValueOnce(new ApiError('ai_service_unavailable', 'The AI service is waking up or temporarily unreachable.', 503))
        .mockResolvedValueOnce(ok);
      renderPage();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      expect(await screen.findByRole('alert')).toHaveTextContent(/waking up/i);
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));
      await screen.findByText('RESULT PAGE');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('validation error: shown, but no pointless Try again button', async () => {
      vi.spyOn(api, 'createScan').mockRejectedValue(new ApiError('unsupported_file', 'File is not a valid JPEG or PNG image.', 415));
      renderPage();
      await userEvent.upload(screen.getByTestId('gallery-input'), jpg());
      await userEvent.click(analyse());
      expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid JPEG/);
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });
  });
});
