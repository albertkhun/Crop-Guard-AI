// Storage interface (what the rest of the app depends on):
//   name: string
//   save(buffer, { mimetype }) -> Promise<{ provider, url, publicId }>
//   remove({ publicId })       -> Promise<void>
// Switching provider = change STORAGE_DRIVER in .env. Nothing else in the codebase knows which one is used.
import { createCloudinaryStorage } from './cloudinary.js';
import { createLocalStorage } from './localDisk.js';

export function createStorage(config) {
  const s = config.storage;
  return s.driver === 'cloudinary' ? createCloudinaryStorage(s.cloudinary) : createLocalStorage(s.local);
}
