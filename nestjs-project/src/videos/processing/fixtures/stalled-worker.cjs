// Disposable integration-test worker. The parent kills it only after the job
// owns a real Redis lock; no production process or media is involved.
const { Worker } = require('bullmq');
const worker = new Worker(
  process.argv[2],
  async (job) => {
    process.send({ active: job.id });
    await new Promise(() => {});
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'queue',
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: null,
    },
    lockDuration: 300,
    stalledInterval: 200,
    maxStalledCount: 1,
  },
);
worker.on('error', (error) => {
  process.stderr.write(error.message);
  process.exitCode = 1;
});
