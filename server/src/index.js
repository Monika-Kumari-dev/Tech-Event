import { config } from './config.js';
import { disconnectDB } from './db.js';
import { bootstrap } from './bootstrap.js';
import { createApp } from './app.js';

async function main() {
  await bootstrap();

  const server = createApp().listen(config.port, () => {
    console.log(`[http] Teck Fluence X API listening on http://localhost:${config.port}/api`);
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[http] ${signal} received, shutting down`);
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (err) => {
  console.error('[fatal]', err);
  await disconnectDB();
  process.exit(1);
});
