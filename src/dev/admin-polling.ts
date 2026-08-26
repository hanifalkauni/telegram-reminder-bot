import { adminBot } from '../bot-admin/index.js';

console.log('👑 Starting TempoGuard Admin Bot in Long-Polling Dev Mode...');

adminBot.start({
  onStart: (botInfo) => {
    console.log(`✅ Admin Bot @${botInfo.username} is running and listening for messages!`);
  },
});
