const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');
const fs = require('fs');

async function testLocalProxyList(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const proxies = text.split('\n').filter(p => !!p.trim());
  console.log(`Loaded ${proxies.length} proxies from ${filePath}`);
  proxies.sort(() => Math.random() - 0.5);

  for(let i = 0; i < proxies.length; i += 200) {
    const batch = proxies.slice(i, i + 200);
    console.log(`Testing batch of ${batch.length} (index ${i})...`);
    await Promise.all(batch.map(async proxy => {
      const agent = new HttpsProxyAgent(`http://${proxy}`);
      try {
        const res = await fetch('https://api.telegram.org/bot8807711307:AAFa_6DZtzJnUVhbhX8reF2LCE76XlQs7rE/getMe', { agent, timeout: 5000 });
        const json = await res.json();
        if (json && json.ok) {
          console.log('WORKING PROXY:', proxy);
          fs.writeFileSync('working_proxy.txt', proxy);
          process.exit(0);
        }
      } catch (e) {}
    }));
  }
}

async function run() {
  console.log("Testing local proxy list...");
  await testLocalProxyList('proxy_list.txt');
  console.log('Failed to find working proxy in local list.');
  process.exit(1);
}
run();
