'use strict';

// Outgoing mail through a provider's HTTP API. Keys come from the server environment only.
// Resend is implemented; another provider is a new adapter with isConfigured() and send().

const env = process.env;
const TIMEOUT_MS = 20_000;

// RESEND_API_URL exists for tests; anything but https is only accepted for localhost.
function resendUrl() {
  const url = env.RESEND_API_URL || 'https://api.resend.com/emails';
  return /^https:\/\//.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url) ? url : null;
}

const adapters = {
  resend: {
    isConfigured: () => Boolean(env.RESEND_API_KEY && env.MAIL_FROM && resendUrl()),

    async send(message) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const body = {
        from: env.MAIL_FROM, // the provider's verified sender, never the visitor's address
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      };
      if (message.replyTo) body.reply_to = message.replyTo;
      if (message.attachments && message.attachments.length) {
        body.attachments = message.attachments.map((a) => ({
          filename: a.filename,
          content: a.data.toString('base64'),
        }));
      }
      try {
        const res = await fetch(resendUrl(), {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(0, 300);
          throw new Error(`mail_http_${res.status}: ${detail}`);
        }
        return true;
      } finally {
        clearTimeout(timer);
      }
    },
  },
};

function provider() {
  const name = String(env.MAIL_PROVIDER || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(adapters, name) ? adapters[name] : null;
}

module.exports = {
  isConfigured() {
    const p = provider();
    return Boolean(p && p.isConfigured());
  },
  async send(message) {
    const p = provider();
    if (!p || !p.isConfigured()) throw new Error('not_configured');
    return p.send(message);
  },
};
