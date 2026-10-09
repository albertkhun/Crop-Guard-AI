import { HttpError } from '../utils/httpError.js';

// Identity, v1: an anonymous per-device id. The client generates a random UUID once, keeps it in the
// browser, and sends it as `X-Device-Id`. Every scan is owned by that id, so each browser only ever sees
// its own history. This is a privacy boundary, NOT authentication: whoever holds the UUID can read those
// scans, and it is unguessable (122 random bits) but not secret-per-user.
//
// JWT later: replace the body of `authenticate` (verify `Authorization: Bearer <jwt>`, set
// req.user = { id: <user id> }). Controllers and queries already scope by req.user.id via ownerScope().
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authenticate(req, _res, next) {
  const id = req.get('x-device-id');
  if (!id || !UUID.test(id)) {
    return next(new HttpError(400, 'device_id_required', 'Missing or invalid X-Device-Id header. Reload the app and try again.'));
  }
  req.user = { id: `device:${id.toLowerCase()}` };
  next();
}

/** Mongo filter restricting queries to the caller's own scans. Never empty: there is no "see everything" path. */
export function ownerScope(req) {
  return { owner: req.user.id };
}
