const http = require('http');

const baseUrl = process.env.LOAD_TEST_URL || 'http://localhost:3000/health';
const requests = Number(process.env.LOAD_TEST_REQUESTS || 100);
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 10));
let next = 0; let ok = 0; let failed = 0;

function request() {
  return new Promise((resolve) => {
    const req = http.get(baseUrl, (res) => {
      res.resume();
      res.on('end', () => { res.statusCode >= 200 && res.statusCode < 400 ? ok++ : failed++; resolve(); });
    });
    req.on('error', () => { failed++; resolve(); });
    req.setTimeout(10000, () => { req.destroy(); failed++; resolve(); });
  });
}
async function worker() {
  while (next < requests) {
    next++;
    await request();
  }
}
Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker)).then(() => {
  console.log(JSON.stringify({ url: baseUrl, requests, concurrency, ok, failed }));
  process.exitCode = failed ? 1 : 0;
});
