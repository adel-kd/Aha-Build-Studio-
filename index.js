require('dotenv').config(); // Config ready
const { Telegraf, Markup, session } = require('telegraf');
const { HttpsProxyAgent } = require('https-proxy-agent');
const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// --- 1. PROXY MANAGEMENT SYSTEM ---
const USE_PROXY = process.env.USE_PROXY === 'true';

async function getWorkingAgent() {
  if (!USE_PROXY) {
    console.log("🌐 Deployment Mode: Proxy disabled, connecting directly to Telegram API.");
    return null;
  }

  // First, try the one from .env
  if (process.env.PROXY_URL) {
    console.log(`📡 Testing current proxy: ${process.env.PROXY_URL}`);
    const agent = new HttpsProxyAgent(process.env.PROXY_URL);
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`, { agent, timeout: 5000 });
      if (res.ok) return agent;
    } catch (e) {
      console.log("⚠️ Current proxy timed out. Finding a new one...");
    }
  }

  // AUTOMATIC FRESH PROXY FETCHING
  if (!fs.existsSync('proxy_list.txt') || fs.statSync('proxy_list.txt').size < 10) {
    console.log("🌐 Local proxy list empty. Fetching fresh proxies from API...");
    try {
      const response = await fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=1000&country=all&ssl=all&anonymity=all');
      const text = await response.text();
      fs.writeFileSync('proxy_list.txt', text);
      console.log("✅ Fresh proxies downloaded.");
    } catch (err) {
      console.error("❌ Failed to fetch fresh proxies:", err.message);
    }
  }

  // If failed or not set, scan proxy_list.txt
  if (fs.existsSync('proxy_list.txt')) {
    let proxies = fs.readFileSync('proxy_list.txt', 'utf8').split('\n').filter(p => !!p.trim());
    
    // Shuffle and pick top 200 for speed
    proxies.sort(() => Math.random() - 0.5);
    proxies = proxies.slice(0, 200);

    console.log(`🔍 Scanning ${proxies.length} proxies (High Concurrency Mode)...`);

    const batchSize = 100;
    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      console.log(`⚡ Testing batch ${Math.floor(i/batchSize) + 1}...`);

      const results = await Promise.all(batch.map(async p => {
        const url = p.trim().startsWith('http') ? p.trim() : `http://${p.trim()}`;
        try {
          const agent = new HttpsProxyAgent(url);
          // Reduced timeout for faster skipping of dead proxies
          const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`, { agent, timeout: 2000 });
          return res.ok ? { agent, url } : null;
        } catch (e) { return null; }
      }));

      const found = results.find(r => r !== null);
      if (found) {
        console.log(`✅ Found working proxy: ${found.url}`);
        // Optionally save back to .env if local
        if (process.env.NODE_ENV !== 'production') {
          try {
            let envContent = fs.readFileSync('.env', 'utf8');
            if (envContent.includes('PROXY_URL=')) {
              envContent = envContent.replace(/PROXY_URL=.*/, `PROXY_URL=${found.url}`);
              fs.writeFileSync('.env', envContent);
            }
          } catch (e) { /* ignore if env not writable */ }
        }
        return found.agent;
      }
    }
  }

  console.error("❌ No working proxies found. If you are on a VPS, set USE_PROXY=false.");
  return null;
}






// --- 1. CONFIGURATION ---
if (!process.env.BOT_TOKEN || !process.env.ADMIN_CHAT_ID || !process.env.MY_TELEGRAM_USERNAME) {
  console.error("❌ Error: Missing critical configuration in .env file.");
  process.exit(1);
}

// Global Bot Instance
const bot = new Telegraf(process.env.BOT_TOKEN);
// Enable memory sessions
bot.use(session());

// Permanent Bottom Menu Keyboard Layout
const mainKeyboard = Markup.keyboard([
  [
    Markup.button.webApp('📦 Packages', process.env.MINI_APP_URL),
    Markup.button.webApp('📁 Portfolio', process.env.MINI_APP_URL)
  ],
  ['🚀 Start a Project'],
  ['ℹ️ About Us', '📞 Contact Us']
]).resize();

// --- 1. START COMMAND ---
bot.start((ctx) => {
  // Initialize session if it doesn't exist
  ctx.session = { step: null, data: {} };

  const welcomeMessage =
    `✨ <b>Welcome to Aha Agency!</b> ✨\n\n` +
    `We transform your vision into reality by building high-performance <b>web applications</b>, <b>mobile apps</b>, and <b>intelligent automation bots</b>.\n\n` +
    `Use the menu buttons below to explore our services or tap <b>🚀 Start a Project</b> to get a fast quote!`;

  return ctx.replyWithHTML(welcomeMessage, mainKeyboard);
});

// --- 2. ABOUT US ---
bot.hears('ℹ️ About Us', (ctx) => {
  const aboutText =
    `🏢 <b>About Aha Agency</b>\n\n` +
    `We are a progressive software engineering collective specializing in fast-paced prototyping and production-grade software.\n\n` +
    `🚀 <b>Our Core Tech Pillars:</b>\n` +
    `• <b>Web Ecosystems:</b> React, Next.js, Node.js, Cloud Architectures.\n` +
    `• <b>Mobile Development:</b> Seamless Flutter & React Native applications.\n` +
    `• <b>AI & Telegram Bots:</b> Custom automated systems built to scale workflows.\n\n` +
    `Let's skip the boilerplate and build something that matters.`;

  return ctx.replyWithHTML(aboutText);
});

// --- 3. PACKAGES (Opening Mini App) ---
bot.hears('📦 Packages', (ctx) => {
  return ctx.reply('Explore our service packages in the interactive Mini App:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('🌟 Open Packages Manager', process.env.MINI_APP_URL)]
    ])
  );
});

// Handling Inline Actions dynamically
bot.action('pkg_web', (ctx) => {
  const text = `🌐 <b>Web Development Suites</b>\n\n• <b>Landing Pages:</b> conversion-focused frontend deployment.\n• <b>Full-Stack SaaS:</b> Custom dashboards, robust database schemas, secure payment Gateways.\n\n⏱️ <b>Avg. Timeline:</b> 2–4 Weeks\n🚀 Click <b>Start a Project</b> below to get a custom breakdown.`;
  ctx.replyWithHTML(text);
  return ctx.answerCbQuery();
});

bot.action('pkg_app', (ctx) => {
  const text = `📱 <b>Mobile App Development</b>\n\n• <b>Cross-Platform Excellence:</b> High-fidelity iOS and Android solutions written in Flutter or React Native.\n• Fully integrated with custom backend REST/GraphQL APIs.\n\n⏱️ <b>Avg. Timeline:</b> 4–8 Weeks`;
  ctx.replyWithHTML(text);
  return ctx.answerCbQuery();
});

bot.action('pkg_bot', (ctx) => {
  const text = `🤖 <b>Telegram & Automation Bots</b>\n\n• <b>Interactive Flow Infrastructure:</b> Mini Apps, inline interactive grids, payment routing.\n• <b>Integrations:</b> Webhooks, OpenAI/LLM models, CRM integrations.\n\n⏱️ <b>Avg. Timeline:</b> 5–14 Days`;
  ctx.replyWithHTML(text);
  return ctx.answerCbQuery();
});

// --- 4. PORTFOLIO SHOWCASE (Opening Mini App) ---
bot.hears('📁 Portfolio', (ctx) => {
  return ctx.reply('Browse our successful case studies in the interactive Mini App:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('📁 Open Portfolio Hub', process.env.MINI_APP_URL)]
    ])
  );
});

// --- 5. CONTACT US ---
bot.hears('📞 Contact Us', (ctx) => {
  const directUsername = process.env.MY_TELEGRAM_USERNAME;
  const contactText =
    `📞 <b>Connect Directly With Us</b>\n\n` +
    `Have a direct inquiry or technical specification documentation ready?\n\n` +
    `💬 <b>Telegram Direct PM:</b> @${directUsername}\n` +
    `📞 <b>Hotline Phone:</b> +251912345678\n\n` +
    `Alternatively, choose <b>Start a Project</b> to let our automated parser organize your inquiry.`;

  return ctx.replyWithHTML(
    contactText,
    Markup.inlineKeyboard([
      [Markup.button.url('⚡ Open Direct Chat', `https://t.me/${directUsername}`)]
    ])
  );
});

// --- 6. INTERACTIVE LEAD CAPTURE FORM (Conversational Flow) ---
bot.hears('🚀 Start a Project', (ctx) => {
  ctx.session = { step: 'AWAITING_PROJECT_TYPE', data: {} };

  return ctx.replyWithHTML(
    `🚀 <b>Let's build your product!</b>\n\nFirst, what are we building today?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Web App', 'lead_type_web')],
      [Markup.button.callback('📱 Mobile App', 'lead_type_mobile')],
      [Markup.button.callback('🤖 Automation/Bot', 'lead_type_bot')],
      [Markup.button.callback('🧩 Other / Custom Work', 'lead_type_other')],
      [Markup.button.callback('❌ Cancel', 'lead_cancel')]
    ])
  );
});

// Handle Cancel action
bot.action('lead_cancel', (ctx) => {
  ctx.session = null;
  ctx.answerCbQuery('Project inquiry cancelled.');
  return ctx.reply('No problem! Let me know if you change your mind. Use the menu anytime.', mainKeyboard);
});

// Handle project type selection from form
const handleLeadType = (typeLabel) => (ctx) => {
  if (!ctx.session || ctx.session.step !== 'AWAITING_PROJECT_TYPE') {
    return ctx.reply('Please restart the intake form by tapping "🚀 Start a Project".');
  }
  ctx.session.data.projectType = typeLabel;
  ctx.session.step = 'AWAITING_PACKAGE';

  ctx.reply(`Great choice! Now, which tier are you looking for ${typeLabel}?`, Markup.inlineKeyboard([
    [Markup.button.callback('🌱 Starter', 'pkg_tier_starter')],
    [Markup.button.callback('🚀 Business', 'pkg_tier_business')],
    [Markup.button.callback('💎 Premium', 'pkg_tier_premium')],
    [Markup.button.callback('❌ Cancel', 'lead_cancel')]
  ]));

  return ctx.answerCbQuery();
};

// Handle package tier selection
const handlePkgTier = (tierLabel) => (ctx) => {
  if (!ctx.session || ctx.session.step !== 'AWAITING_PACKAGE') {
    return ctx.reply('Please restart the intake form.');
  }
  ctx.session.data.packageTier = tierLabel;
  ctx.session.step = 'AWAITING_DESCRIPTION';
  ctx.reply(`Excellent. Please type a short, single-message description of your project requirements and goals:\n\n(Or type /cancel to quit)`, Markup.keyboard([['/cancel']]).resize());
  return ctx.answerCbQuery();
};

bot.action('pkg_tier_starter', handlePkgTier('Starter'));
bot.action('pkg_tier_business', handlePkgTier('Business'));
bot.action('pkg_tier_premium', handlePkgTier('Premium'));

bot.action('lead_type_web', handleLeadType('Web Application'));
bot.action('lead_type_mobile', handleLeadType('Mobile Application'));
bot.action('lead_type_bot', handleLeadType('Telegram/Automation Bot'));
bot.action('lead_type_other', handleLeadType('Custom Development Project'));

// Process text replies based on current session stage
bot.on('text', async (ctx, next) => {
  if (ctx.message.text === '/cancel') {
    ctx.session = null;
    return ctx.reply('Project inquiry cancelled.', mainKeyboard);
  }

  if (ctx.session && ctx.session.step === 'AWAITING_DESCRIPTION') {
    ctx.session.data.description = ctx.message.text;
    ctx.session.step = 'AWAITING_CONTACT';
    return ctx.reply('Got it! Lastly, please drop your best contact phone number or confirm your prefered email address:', Markup.keyboard([['/cancel']]).resize());
  }

  if (ctx.session && ctx.session.step === 'AWAITING_CONTACT') {
    ctx.session.data.contactInfo = ctx.message.text;

    // Compile data to forward to Admin
    const leadData = ctx.session.data;
    const clientUser = ctx.from.username ? `@${ctx.from.username}` : 'No username set';
    const clientName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();

    const adminNotification =
      `🚨 <b>New Inbound Lead Received!</b> 🚨\n\n` +
      `👤 <b>Client:</b> ${escapeHTML(clientName)} (${escapeHTML(clientUser)})\n` +
      `🆔 <b>User ID:</b> <code>${ctx.from.id}</code>\n\n` +
      `🗂️ <b>Project Type:</b> ${escapeHTML(leadData.projectType)}\n` +
      `💎 <b>Package Tier:</b> ${escapeHTML(leadData.packageTier || 'N/A')}\n` +
      `📝 <b>Description:</b> ${escapeHTML(leadData.description)}\n` +
      `📞 <b>Contact Provided:</b> ${escapeHTML(leadData.contactInfo)}`;

    try {
      // Send Lead directly to your private admin chat ID
      await ctx.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminNotification, { parse_mode: 'HTML' });

      // Confirm success to the user
      const clientConfirmation =
        `🎉 <b>Thank you! Your inquiry has been submitted.</b>\n\n` +
        `Our engineering lead will review your requirements and reach out to you within 2-4 hours. Let's make something amazing!`;

      await ctx.replyWithHTML(clientConfirmation, mainKeyboard);
    } catch (error) {
      console.error("Failed to forward lead notification to Admin:", error);
      ctx.reply('Something went wrong processing your request. Please reach out directly using the "📞 Contact Us" option.');
    }

    // Reset session flow state
    ctx.session.step = null;
    return;
  }
});

// Handle data coming from the WebApp
bot.on('web_app_data', (ctx) => {
  try {
    const data = JSON.parse(ctx.message.web_app_data.data);
    if (data.action === 'start_project') {
      ctx.session = {
        step: 'AWAITING_DESCRIPTION',
        data: {
          projectType: data.package.split(' – ')[0],
          packageTier: data.package.split(' – ')[1]
        }
      };
      return ctx.reply(`🚀 Initiating intake for ${data.package}...\n\nPlease type a short description of your specific goals:`, Markup.keyboard([['/cancel']]).resize());
    }
  } catch (err) {
    console.error("WebApp Data Parsing Error:", err);
  }
});

// --- UTILITY: Escapes text for Telegram HTML ---
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Global error wrapper
bot.catch((err, ctx) => {
  console.error(`Encountered an error for updates in context: ${ctx.updateType}`, err);
});

// --- 7. BOT LIFECYCLE & FAILOVER ---
async function startApp() {
  console.log("🚀 Starting Aha Agency Bot...");

  if (USE_PROXY) {
    const agent = await getWorkingAgent();
    if (agent) {
      bot.telegram.options.agent = agent;
    }
  }

  try {
    const me = await bot.telegram.getMe();
    console.log(`✅ Connected successfully as @${me.username}`);

    // Launch polling
    bot.launch().catch(async (err) => {
      console.error("⚠️ Polling error:", err.message);
      if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNRESET')) {
        console.log("🔄 Connection lost. Attempting proxy failover...");
        await startApp(); // Recursively restart with new proxy
      }
    });

    console.log("🚀 Aha Agency Telegram Bot is running in full Vibe Mode!");
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    if (USE_PROXY) {
      console.log("🔄 Retrying with a new proxy in 5 seconds...");
      setTimeout(startApp, 5000);
    } else {
      console.log("Check your internet connection or .env settings.");
    }
  }
}

startApp();

// --- 8. EXPRESS SERVER FOR MINI APP ---
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to skip ngrok browser warning
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Serve static files from the 'miniapp' directory
app.use(express.static(path.join(__dirname, 'miniapp')));

// Catch-all route to serve index.html for SPA behavior
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'miniapp', 'index.html'));
});

// Healthcheck for deployment platforms
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Mini App Server Details:`);
  console.log(`   - Local:   http://localhost:${PORT}`);
  if (process.env.MINI_APP_URL && process.env.MINI_APP_URL.includes('loca.lt')) {
    console.log(`   - Warning: Using Localtunnel URL (${process.env.MINI_APP_URL}). Highly unstable for production.`);
  } else {
    console.log(`   - Production URL: ${process.env.MINI_APP_URL || 'Not set'}`);
  }
});

// Graceful closing configurations
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('TERM', () => bot.stop('TERM'));