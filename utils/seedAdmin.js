/**
 * Seeds (or updates) a single admin user using env vars:
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 *
 * Usage:
 *   npm run seed:admin
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function main() {
  await connectDB();

  const name = process.env.ADMIN_NAME || 'Admin';
  const email = (process.env.ADMIN_EMAIL || 'admin@promptkaizen.local').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  let user = await User.findOne({ email });
  if (user) {
    user.role = 'admin';
    user.name = name;
    user.emailVerified = true;
    if (process.env.ADMIN_RESET_PASSWORD === 'true') {
      user.password = password;
    }
    await user.save();
    console.log(`Admin updated: ${email} (role=admin, emailVerified=true)`);
  } else {
    user = await User.create({ name, email, password, role: 'admin', emailVerified: true });
    console.log(`Admin created: ${email} (password as configured)`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('seedAdmin failed:', err);
  process.exit(1);
});
