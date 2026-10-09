import { randomUUID } from 'node:crypto';
import { v2 as cloudinaryV2 } from 'cloudinary';

/**
 * Cloudinary driver. Credentials come from config (.env). `sdk` is injectable for tests.
 * Images get an unguessable random public_id, and are capped to `maxEdge` px on upload
 * (saves storage; the AI service only needs 224 px).
 */
export function createCloudinaryStorage(cfg, sdk = cloudinaryV2) {
  sdk.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret, secure: true });

  return {
    name: 'cloudinary',

    async save(buffer) {
      const options = {
        folder: cfg.folder,
        public_id: randomUUID(),
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
        timeout: 20_000,
        transformation: [{ width: cfg.maxEdge, height: cfg.maxEdge, crop: 'limit' }],
      };
      const res = await new Promise((resolve, reject) => {
        const stream = sdk.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
        stream.end(buffer);
      });
      return { provider: 'cloudinary', url: res.secure_url, publicId: res.public_id };
    },

    async remove(ref) {
      if (ref?.publicId) await sdk.uploader.destroy(ref.publicId, { resource_type: 'image', invalidate: true });
    },
  };
}
