// server.cjs - Bridge for Hostinger LiteSpeed (Passenger)
// LiteSpeed requires a CommonJS startup file, but NestJS is compiled as an ES Module.
// This bridge dynamically imports the ESM entry point.

async function start() {
  try {
    console.log('Starting NestJS ESM application via CommonJS bridge...');
    await import('./dist/main.js');
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
