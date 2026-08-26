import { webhookCallback } from 'grammy';
import { adminBot } from '../../src/bot-admin/index.js';
import { env } from '../../src/config/env.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const handleUpdate = webhookCallback(adminBot, 'std/http', {
  secretToken: env.TELEGRAM_SECRET_TOKEN,
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    return await handleUpdate(req);
  } catch (err) {
    console.error('Error handling admin webhook update:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
