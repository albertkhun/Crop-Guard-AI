import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

/** Real file type from magic bytes. Never trust the client-declared mimetype or the filename. */
export function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export function createUploadMiddleware(maxBytes) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 1024 },
    fileFilter: (_req, file, cb) =>
      ALLOWED_MIME.has(file.mimetype) ? cb(null, true) : cb(new HttpError(415, 'unsupported_file', 'Only JPEG and PNG images are accepted.')),
  }).single('image');

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'file_too_large', `Image is larger than ${Math.round((maxBytes + 1) / 1048576)} MB.`));
        if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new HttpError(400, 'bad_field', "Send exactly one file in the form field 'image'."));
        return next(new HttpError(400, 'bad_upload', 'Could not read the upload.'));
      }
      if (err) return next(err);
      if (!req.file) return next(new HttpError(400, 'image_required', "Attach an image in the form field 'image'."));
      const real = sniffImageType(req.file.buffer);
      if (!real) return next(new HttpError(415, 'unsupported_file', 'File is not a valid JPEG or PNG image.'));
      req.file.mimetype = real; // trust the bytes, not the header
      next();
    });
  };
}
