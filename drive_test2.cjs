const https = require('https');
const fs = require('fs');

const url = 'https://drive.usercontent.google.com/download?id=1A6Nh6EXqv72vmkoBvpSAcpTMu4fb6b9G&export=download';

https.get(url, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  
  if (res.statusCode === 200) {
    const file = fs.createWriteStream("emily.pdf");
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Download Completed');
    });
  } else {
    console.log('Failed to download, status:', res.statusCode);
  }
}).on('error', (e) => {
  console.error(e);
});
