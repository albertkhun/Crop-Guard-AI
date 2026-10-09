const KEY = 'pg.deviceId';
let memoryId = null; // used if localStorage is unavailable (private mode): history then lasts only until reload

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Anonymous per-browser id. Sent as X-Device-Id so the server only returns THIS device's scans. */
export function getDeviceId(storage = globalThis.localStorage) {
  try {
    let id = storage?.getItem(KEY);
    if (!id) { id = uuid(); storage?.setItem(KEY, id); }
    return id;
  } catch {
    return (memoryId ??= uuid());
  }
}
