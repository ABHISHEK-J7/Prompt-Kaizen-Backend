require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const promptRoutes = require('./routes/promptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { userRouter: contestUserRoutes, adminRouter: contestAdminRoutes } = require('./routes/contestRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

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
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Prompt Kaizen API' });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

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
    console.log(`Prompt Kaizen API listening on http://localhost:${PORT}`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  });
});
