import { webhookCallback } from 'grammy';
import type { IncomingMessage, ServerResponse } from 'http';
import { adminBot } from '../../src/bot-admin/index.js';
import { env } from '../../src/config/env.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const handleUpdate = webhookCallback(adminBot, 'http', {
  secretToken: env.TELEGRAM_SECRET_TOKEN,
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    await handleUpdate(req, res);
  } catch (err) {
    console.error('Error handling admin webhook update:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}
