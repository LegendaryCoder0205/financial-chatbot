import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { DeliveryResult } from './types';

export async function deliverStructuredData(subject: string, body: string): Promise<DeliveryResult> {
  const to = process.env.DELIVER_TO_EMAIL;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (to && host && port && user && pass) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    const info = await transporter.sendMail({ from: user, to, subject, text: body });
    return { ok: true, id: info.messageId, destination: `smtp:${host}`, note: 'Email sent' };
  }

  // Fallback: write to outbox
  const outDir = path.join(process.cwd(), 'outbox');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${Date.now()}-delivery.txt`);
  fs.writeFileSync(file, `Subject: ${subject}\n\n${body}`);
  return { ok: true, destination: file, note: 'Written to outbox (no SMTP configured)' };
}

