const fetch = require('node-fetch');
async function run() {
  const html = await fetch('https://www.ibyapa.com/certificate').then(r => r.text());
  const scripts = [...html.matchAll(/href="(\/js\/[^"]+\.js)"/g)];
  const m = html.match(/src="(\/js\/index[^"]+\.js)"/);
  if (m) scripts.push(m);
  
  for (const match of scripts) {
    const js = await fetch('https://www.ibyapa.com' + match[1]).then(r => r.text());
    const gets = js.match(/localStorage\.getItem\(([^)]+)\)/g);
    if (gets) console.log(match[1], 'gets:', gets);
  }
}
run();
