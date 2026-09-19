const https = require('https');

const url = 'https://drive.google.com/uc?export=download&id=1A6Nh6EXqv72vmkoBvpSAcpTMu4fb6b9G';

https.get(url, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  if (res.statusCode >= 300 && res.statusCode < 400) {
    console.log('Redirecting to:', res.headers.location);
  }
}).on('error', (e) => {
  console.error(e);
});
