require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const promptRoutes = require('./routes/promptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { userRouter: contestUserRoutes, adminRouter: contestAdminRoutes } = require('./routes/contestRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Render/Heroku/most reverse-proxy hosts terminate TLS upstream. Without this
// the real client IP is hidden behind the proxy IP — which breaks per-IP rate
// limiting (everyone shares the same load-balancer IP) and any IP logging.
app.set('trust proxy', 1);

// --- Security headers ------------------------------------------------------
// CSP is disabled because this is a JSON API consumed by separate SPA origins,
// not a server-rendered site. helmet's other defaults (HSTS, no-sniff, frame
// guard, etc.) are kept.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- Compression -----------------------------------------------------------
// gzip JSON responses. Skips already-compressed payloads automatically.
app.use(compression());

// --- CORS ------------------------------------------------------------------
// Support multiple allowed origins (user app + admin app)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools like curl / Postman with no Origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// --- Logging ---------------------------------------------------------------
// `dev` format is colorized + verbose — fine locally, expensive in prod.
// `combined` is Apache-style, far cheaper to format, and what most log
// aggregators expect.
app.use(morgan(isProd ? 'combined' : 'dev'));

// --- Rate limiting ---------------------------------------------------------
// Numbers sized for ~5k concurrent users hitting the app at human cadences.
// Tuned to NOT throttle legitimate use; the goal is to cap abuse and runaway
// clients, not to slow down real users.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL_PER_MIN) || 300, // 300 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_PER_MIN) || 20, // 20 login attempts/min/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth attempts, please wait a minute.' },
});

// Apply the broad limiter to every /api/* route. The narrower auth limiter
// stacks on top of it for /api/auth so brute-force login attempts hit the
// tighter ceiling first.
app.use('/api/', generalLimiter);
app.use('/api/auth', authLimiter);

// --- Health / root ---------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Prompt Kaizen API' });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// --- Routes ----------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/contests', contestAdminRoutes);
app.use('/api/contests', contestUserRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Prompt Kaizen API listening on http://localhost:${PORT} (pid ${process.pid})`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  });
});
