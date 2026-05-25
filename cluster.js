/**
 * Multi-process entry point for the Prompt Kaizen API.
 *
 * A single Node.js process pegs one CPU core and tops out around 1–2k
 * concurrent users on a real workload. This module forks one worker per
 * available CPU (or `WEB_CONCURRENCY` if the host sets it — Heroku/Render
 * conventions), giving you ~Nx throughput on multi-core boxes.
 *
 * Workers are stateless (JWT auth, no in-memory caches), so they don't need
 * any kind of coordination — each handles requests independently. If a worker
 * crashes, the primary respawns it.
 *
 * Use this in production: `node cluster.js`. Keep `server.js` as the dev /
 * single-process entry so `nodemon server.js` remains a smooth local loop.
 */

const cluster = require('cluster');
const os = require('os');

// `WEB_CONCURRENCY` is the convention Heroku/Render use to tell apps how many
// workers to run. Fall back to physical CPU count if it isn't set.
// Clamp to at least 1 (single-vCPU containers report `cpus().length === 1`).
const cpuCount = os.cpus().length;
const workerCount = Math.max(1, Number(process.env.WEB_CONCURRENCY) || cpuCount);

if (cluster.isPrimary) {
  console.log(`[cluster] primary ${process.pid} starting ${workerCount} worker(s)`);

  // Flag set during shutdown so the worker-exit handler stops respawning
  // and lets the primary actually exit when the last worker is done.
  let shuttingDown = false;

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    const uptime = Date.now() - (worker.bootedAt || Date.now());

    if (shuttingDown) {
      // Don't respawn during shutdown. Once every worker has exited the
      // primary has nothing left to do and exits with code 0.
      console.log(
        `[cluster] worker ${worker.process.pid} stopped (code=${code}, signal=${signal})`
      );
      if (Object.keys(cluster.workers).length === 0) {
        console.log('[cluster] all workers stopped, primary exiting');
        process.exit(0);
      }
      return;
    }

    // Normal-life respawn. Crash-loop protection: if a worker exits within
    // 5 seconds of starting, count it as a failed boot and back off to
    // avoid pegging the box during a crash storm.
    console.warn(
      `[cluster] worker ${worker.process.pid} exited (code=${code}, signal=${signal}, uptime=${uptime}ms). Respawning…`
    );
    setTimeout(() => cluster.fork(), uptime < 5000 ? 2000 : 0);
  });

  cluster.on('online', (worker) => {
    worker.bootedAt = Date.now();
    console.log(`[cluster] worker ${worker.process.pid} online`);
  });

  // Forward SIGTERM/SIGINT so platforms (Render, Heroku, Docker, k8s) can do
  // graceful shutdowns. Workers will exit when their HTTP server finishes
  // in-flight requests; once they're all gone the primary follows.
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[cluster] received ${signal}, asking workers to exit`);
    for (const id in cluster.workers) {
      cluster.workers[id].kill(signal);
    }
    // Failsafe: if a worker hangs on a long request, force-exit after 10s
    // instead of leaving the primary running forever.
    setTimeout(() => {
      console.warn('[cluster] forced exit after 10s shutdown timeout');
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
} else {
  // Each worker just boots the normal server.
  require('./server');
}
