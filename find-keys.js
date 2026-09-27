const fetch = require('node-fetch');
async function run() {
  const js = await fetch('https://www.ibyapa.com/js/certificates-BzPbBXud.js').then(r => r.text());
  console.log('=== FULL CERTIFICATES CHUNK ===');
  console.log(js);
}
run();
