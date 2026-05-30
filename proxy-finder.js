const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

async function findProxy() {
  console.log("Fetching proxy list...");
  const res = await fetch('https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt');
  const text = await res.text();
  const proxies = text.split('\n').filter(p => !!p.trim());
  console.log(`Found ${proxies.length} proxies. Testing...`);

  for (let i = 0; i < Math.min(100, proxies.length); i++) {
    const proxyStr = `http://${proxies[i].trim()}`;
    const agent = new HttpsProxyAgent(proxyStr);
    try {
      const testRes = await fetch('https://api.telegram.org/', { agent, timeout: 3000 });
      if (testRes.status === 200) {
        console.log(`\nSuccess with proxy: ${proxyStr}`);
        let envContent = fs.readFileSync('.env', 'utf8');
        envContent = envContent.replace(/USE_PROXY=.*/, 'USE_PROXY=true');
        envContent = envContent.replace(/PROXY_URL=.*/, `PROXY_URL=${proxyStr}`);
        fs.writeFileSync('.env', envContent);
        console.log('.env updated successfully.');
        return proxyStr;
      }
    } catch (err) {
      if (i % 10 === 0) console.log(`Testing ${i}...`);
    }
  }
  console.log("Could not find a working proxy in the first 100.");
}

findProxy();
