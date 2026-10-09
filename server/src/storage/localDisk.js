import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Dev/offline driver (STORAGE_DRIVER=local). Files are served by Express at /uploads. */
export function createLocalStorage({ dir, publicBaseUrl }) {
  const root = path.resolve(dir);
  return {
    name: 'local',
    root,
    async save(buffer, { mimetype }) {
      await fs.mkdir(root, { recursive: true });
      const publicId = `${randomUUID()}.${mimetype === 'image/png' ? 'png' : 'jpg'}`;
      await fs.writeFile(path.join(root, publicId), buffer);
      return { provider: 'local', url: `${publicBaseUrl}/uploads/${publicId}`, publicId };
    },
    async remove(ref) {
      if (!ref?.publicId || ref.publicId !== path.basename(ref.publicId)) return; // no path traversal
      await fs.rm(path.join(root, ref.publicId), { force: true });
    },
  };
}
