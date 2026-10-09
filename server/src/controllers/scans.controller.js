import mongoose from 'mongoose';
import { Scan, toDto } from '../models/Scan.js';
import { ownerScope } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

const bad = (code, msg) => new HttpError(400, code, msg);

function num(v, name) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad('bad_field', `${name} must be a number.`);
  return n;
}

export function parseScanFields(body = {}) {
  const lat = num(body.lat, 'lat');
  const lon = num(body.lon, 'lon');
  if ((lat === undefined) !== (lon === undefined)) throw bad('bad_location', 'Provide both lat and lon, or neither.');
  if (lat !== undefined && (lat < -90 || lat > 90 || lon < -180 || lon > 180)) throw bad('bad_location', 'lat/lon are out of range.');

  let district;
  if (typeof body.district === 'string') {
    district = body.district.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) || undefined;
  }
  const cropAgeDays = num(body.crop_age_days, 'crop_age_days');
  if (cropAgeDays !== undefined && (!Number.isInteger(cropAgeDays) || cropAgeDays < 0 || cropAgeDays > 400)) {
    throw bad('bad_field', 'crop_age_days must be a whole number between 0 and 400.');
  }
  const location = lat !== undefined || district ? { lat, lon, district } : null;
  return { lat, lon, district, cropAgeDays, location };
}

function parseObjectId(id) {
  if (!mongoose.isValidObjectId(id) || String(id).length !== 24) throw bad('invalid_id', 'Scan id is not valid.');
  return id;
}

export function createScansController({ storage, ai, catalog, config }) {
  const swallow = (label) => (e) => console.error(`[${label}]`, e?.message || e);

  return {
    async create(req, res) {
      const f = parseScanFields(req.body);
      const { buffer, mimetype, originalname } = req.file;
      const mockScenario = config.nodeEnv !== 'production' && typeof req.body?.mock_scenario === 'string' ? req.body.mock_scenario : undefined;

      // AI inference and the image upload run concurrently; neither blocks the other.
      const [aiR, stR] = await Promise.allSettled([
        ai.predict({ buffer, mimetype, filename: originalname, lat: f.lat, lon: f.lon, cropAgeDays: f.cropAgeDays, mockScenario }),
        storage.save(buffer, { mimetype }),
      ]);

      if (aiR.status === 'rejected') {
        if (stR.status === 'fulfilled') await storage.remove(stR.value).catch(swallow('cleanup')); // don't orphan images
        throw aiR.reason;
      }

      const warnings = [];
      let imageRef = null;
      if (stR.status === 'fulfilled') imageRef = stR.value;
      else {
        console.error('[storage] image upload failed:', stR.reason?.message || stR.reason);
        warnings.push('image_not_saved'); // the diagnosis is still valuable, so don't fail the scan
      }

      let doc;
      try {
        doc = await Scan.create({ owner: req.user.id, imageRef, location: f.location, cropAgeDays: f.cropAgeDays ?? null, aiResponse: aiR.value });
      } catch (e) {
        if (imageRef) await storage.remove(imageRef).catch(swallow('cleanup'));
        throw e;
      }
      res.status(201).json({ ...toDto(doc), warnings });
    },

    async list(req, res) {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '20', 10) || 20, 1), 50);
      const filter = { ...ownerScope(req) };
      if (req.query.before) filter._id = { $lt: parseObjectId(String(req.query.before)) };
      const rows = await Scan.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
      const page = rows.slice(0, limit);
      res.json({ items: page.map(toDto), nextBefore: rows.length > limit ? String(page.at(-1)._id) : null });
    },

    async get(req, res) {
      const doc = await Scan.findOne({ _id: parseObjectId(req.params.id), ...ownerScope(req) }).lean();
      if (!doc) throw new HttpError(404, 'not_found', 'Scan not found.');
      res.json(toDto(doc));
    },

    async feedback(req, res) {
      const id = parseObjectId(req.params.id);
      const { correct, true_class: trueClass } = req.body ?? {};
      if (typeof correct !== 'boolean') throw bad('bad_field', "'correct' must be true or false.");
      let tc = null;
      if (trueClass !== undefined && trueClass !== null) {
        if (correct) throw bad('bad_field', "'true_class' only makes sense when correct is false.");
        if (typeof trueClass !== 'string' || !/^[a-z0-9_]{1,64}$/.test(trueClass)) throw bad('bad_field', "'true_class' must be a class key.");
        const classes = await catalog.get(); // validate against the AI service's own list when available
        if (classes && !classes.some((c) => c.class_key === trueClass)) throw bad('unknown_class', `Unknown class '${trueClass}'.`);
        tc = trueClass;
      }
      const doc = await Scan.findOneAndUpdate(
        { _id: id, ...ownerScope(req) },
        { $set: { feedback: { correct, trueClass: tc, at: new Date() } } },
        { returnDocument: 'after' },
      ).lean();
      if (!doc) throw new HttpError(404, 'not_found', 'Scan not found.');
      res.json(toDto(doc));
    },
  };
}
