import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);

import { vi } from 'vitest';
// jsdom has no object URLs
globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
globalThis.URL.revokeObjectURL = vi.fn();
