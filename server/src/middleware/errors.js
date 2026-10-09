import { HttpError } from '../utils/httpError.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'not_found', 'Route not found.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let e = err;
  if (err?.type === 'entity.parse.failed') e = new HttpError(400, 'invalid_json', 'Request body is not valid JSON.');
  else if (err?.type === 'entity.too.large') e = new HttpError(413, 'body_too_large', 'Request body is too large.');
  if (!(e instanceof HttpError)) {
    console.error('[unhandled]', req.method, req.originalUrl, err);
    e = new HttpError(500, 'internal_error', 'Something went wrong on the server.');
  }
  if (e.extra?.retryAfter) res.set('Retry-After', String(e.extra.retryAfter));
  res.status(e.status).json({ error: { code: e.code, message: e.message } });
}
