import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FeedbackButton from '../components/FeedbackButton.jsx';
import classes from './fixtures/classes.json';
import ok from './fixtures/scan_ok.json';

function Harness({ send, scan = ok }) {
  const [s, setS] = useState(scan);
  return <FeedbackButton scan={s} send={send} classLoader={async () => classes.classes} onSaved={(u) => setS({ ...s, feedback: u.feedback })} />;
}
const saved = (fb) => vi.fn(async () => ({ feedback: fb }));

describe('FeedbackButton', () => {
  it('"Yes" sends correct=true and then shows thanks', async () => {
    const send = saved({ correct: true, trueClass: null });
    render(<Harness send={send} />);
    await userEvent.click(screen.getByRole('button', { name: /yes, correct/i }));
    expect(send).toHaveBeenCalledWith(ok.id, { correct: true, trueClass: undefined });
    expect(await screen.findByText(/you marked this as correct/i)).toBeInTheDocument();
  });

  it('"No" lets you pick the real class and sends it', async () => {
    const send = saved({ correct: false, trueClass: 'hispa' });
    render(<Harness send={send} />);
    await userEvent.click(screen.getByRole('button', { name: /^👎 no/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/what was it actually/i), 'hispa');
    await userEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(send).toHaveBeenCalledWith(ok.id, { correct: false, trueClass: 'hispa' });
    expect(await screen.findByText(/not correct \(actually: Rice Hispa \(insect damage\)\)/i)).toBeInTheDocument();
  });

  it('"No" works without choosing a class', async () => {
    const send = saved({ correct: false, trueClass: null });
    render(<Harness send={send} />);
    await userEvent.click(screen.getByRole('button', { name: /^👎 no/i }));
    await userEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(send).toHaveBeenCalledWith(ok.id, { correct: false, trueClass: undefined });
  });

  it('shows the server error and stays usable', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Scan not found.'));
    render(<Harness send={send} />);
    await userEvent.click(screen.getByRole('button', { name: /yes, correct/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scan not found.');
    expect(screen.getByRole('button', { name: /yes, correct/i })).toBeEnabled();
  });

  it('existing feedback can be changed', async () => {
    render(<Harness send={saved({ correct: true })} scan={{ ...ok, feedback: { correct: true, trueClass: null } }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByLabelText(/what was it actually/i)).toBeInTheDocument();
  });
});
