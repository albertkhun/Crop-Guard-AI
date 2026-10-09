// All configuration comes from environment variables (see ../.env.example). Validated once at startup.
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export function parseCloudinaryCreds(env) {
  // Accept either CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> or the three separate vars.
  if (env.CLOUDINARY_URL) {
    try {
      const u = new URL(env.CLOUDINARY_URL);
      if (u.protocol !== 'cloudinary:') throw new Error('bad protocol');
      return { cloudName: u.hostname, apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password) };
    } catch {
      throw new Error('CLOUDINARY_URL is malformed. Expected cloudinary://<api_key>:<api_secret>@<cloud_name>');
    }
  }
  return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const problems = [];

  const clientOrigins = (env.CLIENT_ORIGIN || (isProd ? '' : 'http://localhost:5173'))
    .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (!clientOrigins.length) problems.push('CLIENT_ORIGIN is required in production (comma-separated list allowed)');

  for (const k of ['MONGODB_URI', 'AI_SERVICE_URL', 'AI_INTERNAL_KEY']) if (!env[k]) problems.push(`${k} is required`);

  const driver = (env.STORAGE_DRIVER || 'cloudinary').toLowerCase();
  if (!['cloudinary', 'local'].includes(driver)) problems.push("STORAGE_DRIVER must be 'cloudinary' or 'local'");

  let cloudinary = null;
  if (driver === 'cloudinary') {
    try {
      cloudinary = parseCloudinaryCreds(env);
      const missing = [['cloudName', 'CLOUDINARY_CLOUD_NAME'], ['apiKey', 'CLOUDINARY_API_KEY'], ['apiSecret', 'CLOUDINARY_API_SECRET']]
        .filter(([k]) => !cloudinary[k]).map(([, n]) => n);
      if (missing.length) problems.push(`Cloudinary storage selected but missing: ${missing.join(', ')} (or set CLOUDINARY_URL)`);
    } catch (e) {
      problems.push(e.message);
    }
  }

  if (problems.length) {
    throw new Error(`Invalid server configuration:\n - ${problems.join('\n - ')}`);
  }

  return {
    nodeEnv,
    port: int(env.PORT, 4000),
    trustProxy: bool(env.TRUST_PROXY, false), // set true on Render/any reverse proxy so rate limiting sees real client IPs
    mongoUri: env.MONGODB_URI,
    clientOrigins,
    ai: {
      url: env.AI_SERVICE_URL.replace(/\/$/, ''),
      key: env.AI_INTERNAL_KEY,
      timeoutMs: int(env.AI_TIMEOUT_MS, 45_000),      // per attempt; generous for cold starts
      retryDelayMs: int(env.AI_RETRY_DELAY_MS, 2_000),
      healthTimeoutMs: int(env.AI_HEALTH_TIMEOUT_MS, 8_000),
    },
    upload: { maxBytes: int(env.MAX_UPLOAD_MB, 10) * 1024 * 1024 - 1 }, // "<10 MB", matches the AI service
    rateLimit: { windowMs: int(env.RATE_LIMIT_WINDOW_MS, 10 * 60_000), limit: int(env.RATE_LIMIT_SCANS, 30) },
    storage: {
      driver,
      cloudinary: cloudinary && { ...cloudinary, folder: env.CLOUDINARY_FOLDER || 'paddyguard/scans', maxEdge: int(env.IMAGE_MAX_EDGE_PX, 1600) },
      local: { dir: env.LOCAL_UPLOAD_DIR || './uploads', publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${int(env.PORT, 4000)}`).replace(/\/$/, '') },
    },
  };
}
