import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config';
import { AppError } from '../lib/errors';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  mode: 'smtp' | 'fake' | 'off';
  send(message: MailMessage): Promise<{ messageId: string }>;
  verify(): Promise<void>;
  outbox: (MailMessage & { at: string })[];
}

type TransportFactory = (options: Record<string, unknown>) => Transporter;

const FALLBACK_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'EDNS']);

export function createMailer(
  config: Config,
  createTransport: TransportFactory = nodemailer.createTransport as unknown as TransportFactory,
): Mailer {
  const mode: Mailer['mode'] = config.mailFake ? 'fake' : config.smtp ? 'smtp' : 'off';
  const outbox: Mailer['outbox'] = [];
  let transport: Transporter | null = null;
  let usingFallback = false;

  function build(port: number, secure: boolean, requireTLS = false): Transporter {
    if (!config.smtp) throw new Error('SMTP is not configured');
    return createTransport({
      host: config.smtp.host,
      port,
      secure,
      requireTLS,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
    });
  }

  function current(): Transporter {
    if (transport) return transport;
    if (mode === 'fake') {
      transport = createTransport({ jsonTransport: true });
      return transport;
    }
    if (mode === 'smtp' && config.smtp) {
      transport = build(config.smtp.port, config.smtp.secure);
      return transport;
    }
    throw new AppError(503, 'mail_unavailable', 'Email is not configured');
  }

  return {
    mode,
    outbox,
    async send(message) {
      if (mode === 'off') throw new AppError(503, 'mail_unavailable', 'Email is not configured');
      if (mode === 'fake') {
        outbox.push({ ...message, at: new Date().toISOString() });
        if (outbox.length > 200) outbox.shift();
        return { messageId: `fake-${Date.now()}-${outbox.length}` };
      }
      const mail = {
        from: config.mailFrom || undefined,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      };
      try {
        const result = await current().sendMail(mail);
        return { messageId: result.messageId ?? '' };
      } catch (error) {
        const code = (error as { code?: string }).code ?? '';
        if (
          !usingFallback &&
          config.smtp &&
          config.smtp.fallbackPort > 0 &&
          FALLBACK_CODES.has(code)
        ) {
          usingFallback = true;
          transport = build(config.smtp.fallbackPort, false, true);
          console.warn(`SMTP: using fallback port ${config.smtp.fallbackPort}`);
          const result = await transport.sendMail(mail);
          return { messageId: result.messageId ?? '' };
        }
        throw error;
      }
    },
    async verify() {
      await current().verify();
    },
  };
}
