const fetch = require('node-fetch');
async function run() {
  const html = await fetch('https://www.ibyapa.com/certificate').then(r => r.text());
  const scripts = [...html.matchAll(/href="(\/js\/[^"]+\.js)"/g)];
  const m = html.match(/src="(\/js\/index[^"]+\.js)"/);
  if (m) scripts.push(m);
  
  for (const match of scripts) {
    const js = await fetch('https://www.ibyapa.com' + match[1]).then(r => r.text());
    
    // Find cookie getters
    const cookieMatches = [...js.matchAll(/[a-zA-Z0-9_$]+\.get\(['"]([^'"]+)['"]/g)].map(m => m[1]);
    if (cookieMatches.length) console.log(match[1], 'cookie gets:', Array.from(new Set(cookieMatches)));
  }
}
run();
