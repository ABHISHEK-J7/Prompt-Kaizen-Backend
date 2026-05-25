const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  // Tuned for ~5k concurrent users.
  // - maxPoolSize: 100 — every worker holds up to 100 sockets to MongoDB.
  //   With 4 cluster workers that's 400 sockets total — well within Atlas M10 limits.
  // - minPoolSize: 5 — keep a warm pool so the first burst of traffic
  //   doesn't pay TCP handshakes.
  // - serverSelectionTimeoutMS: 5000 — fail fast if Mongo is unreachable
  //   instead of hanging requests indefinitely.
  // - socketTimeoutMS: 45000 — long enough for the heaviest aggregation,
  //   short enough to recycle dead sockets.
  // - maxIdleTimeMS: 60000 — close idle sockets after a minute so the pool
  //   stays healthy when traffic dips.
  const options = {
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 100,
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 60000,
  };

  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(uri, options);
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    // Surface connection-pool health in production logs so operators can
    // see disconnect/reconnect cycles instead of guessing from 5xx spikes.
    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected.'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected.'));
    mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
