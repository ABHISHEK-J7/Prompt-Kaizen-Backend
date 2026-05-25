const nodemailer = require('nodemailer');
const sharp = require('sharp');

const EMAIL_USER = process.env.EMAIL_USER;
// App passwords are usually copied with spaces (Google shows them as
// "xxxx xxxx xxxx xxxx"). Gmail accepts either form; we strip whitespace so
// the user can paste verbatim.
const EMAIL_PASSWORD = String(process.env.EMAIL_PASSWORD || '').replace(/\s+/g, '');
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Prompt Kaizen';

let transporter = null;

/**
 * Lazy singleton transporter — Gmail SMTP over port 465 (TLS).
 * If `EMAIL_USER` / `EMAIL_PASSWORD` are missing in env, returns null and
 * callers should treat the email as undeliverable (and log it).
 */
function getTransporter() {
  if (transporter) return transporter;
  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.warn('[mailer] EMAIL_USER or EMAIL_PASSWORD is not set — emails will not be sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
  });
  return transporter;
}

/**
 * Same rising-line graph icon as the frontend `<Logo>` component, on the
 * brand orange tile. Kept here as a string so the email template stays in
 * sync if either side ever changes. Rendered to PNG via sharp because Gmail
 * (and most webmail) strip inline <svg> from email HTML and refuse data
 * URIs in <img src>. PNG via CID attachment is the only format that renders
 * everywhere reliably.
 */
const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="18" ry="18" fill="#F15D23"/>
  <g transform="translate(14 14) scale(1.83)">
    <path d="M5 14.5L10 9.5L13 12.5L19 6.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="19" cy="6.5" r="1.8" fill="#ffffff"/>
    <path d="M5 18.5H19" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.55" fill="none"/>
  </g>
</svg>
`;

let logoPngBufferPromise = null;

/**
 * Render the brand logo SVG to a 144×144 PNG buffer once, then memoize the
 * Promise so every subsequent email reuses the same buffer (sharp is heavy
 * to spin up). 144px gives 2x density for retina-class display in mail
 * clients — the image is shown at 36×36 CSS pixels.
 */
function getLogoPngBuffer() {
  if (!logoPngBufferPromise) {
    logoPngBufferPromise = sharp(Buffer.from(LOGO_SVG))
      .resize(144, 144)
      .png()
      .toBuffer()
      .catch((err) => {
        // Reset so a later attempt can retry instead of caching the failure.
        logoPngBufferPromise = null;
        throw err;
      });
  }
  return logoPngBufferPromise;
}

/**
 * Send the 6-digit OTP to a user's inbox. Returns a Promise that resolves
 * with the Nodemailer info on success or rejects with the SMTP error.
 *
 * The email contains both an HTML body (for graphical clients) and a plain
 * text fallback. The OTP is shown as the headline number, with a short
 * expiry hint and a do-not-share notice. The brand logo is attached as a
 * CID image (`cid:pk-logo`) instead of inline SVG so Gmail renders it.
 */
async function sendOtpEmail({ to, name, otp, ttlMinutes }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('Email service is not configured.');
  }

  const safeName = (name || '').trim() || 'there';
  const safeTtl = Number(ttlMinutes) || 2;

  const subject = `Your Prompt Kaizen verification code: ${otp}`;
  const year = new Date().getFullYear();

  const text =
    `Hi ${safeName},\n\n` +
    `Your Prompt Kaizen verification code is: ${otp}\n\n` +
    `This code expires in ${safeTtl} minutes. ` +
    `If you didn't request this, you can safely ignore this email.\n\n` +
    `Never share this code with anyone — Prompt Kaizen will never ask you for it.\n\n` +
    `— Prompt Kaizen\n\n` +
    `© ${year} Torii Minds LLP. All rights reserved.`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:32px 16px;color:#212529;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #f5f5f5;display:flex;align-items:center;">
          <img
            src="cid:pk-logo"
            alt="Prompt Kaizen"
            width="36"
            height="36"
            style="width:36px;height:36px;border-radius:10px;display:block;flex-shrink:0;margin-right:24px;"
          />
          <div>
            <div style="font-weight:700;color:#F15D23;font-size:15px;line-height:1;">Prompt Kaizen</div>
            <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#212529;font-weight:600;margin-top:3px;">Verify your email</div>
          </div>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#495057;">
            Use the code below to finish creating your Prompt Kaizen account.
          </p>
          <div style="background:#fff7f3;border:1px dashed #F15D23;border-radius:14px;padding:18px;text-align:center;margin:18px 0;">
            <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#212529;font-weight:600;margin-bottom:6px;">Your code</div>
            <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#F15D23;font-family:'Menlo','Monaco',monospace;">${otp}</div>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#495057;">
            This code expires in <strong>${safeTtl} minutes</strong>.
          </p>
          <p style="margin:0;font-size:12px;color:#6c757d;">
            Didn't request this? You can ignore this email. Never share this code with anyone — Prompt Kaizen will never ask you for it.
          </p>
        </div>
        <div style="padding:16px 28px;border-top:1px solid #f5f5f5;font-size:11px;color:#6c757d;line-height:1.6;">
          <div style="color:#495057;font-weight:600;">Prompt Kaizen · Compatibility Analyzer</div>
          <div style="margin-top:2px;">
            &copy; ${year} <span style="color:#F15D23;font-weight:600;">Torii Minds LLP</span>. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  `;

  const logoPng = await getLogoPngBuffer();

  return t.sendMail({
    from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'prompt-kaizen-logo.png',
        content: logoPng,
        cid: 'pk-logo',
        // `inline` disposition is what makes this render in-body via the cid:
        // reference instead of showing up as a "1 attachment" file row.
        contentDisposition: 'inline',
      },
    ],
  });
}

module.exports = { getTransporter, sendOtpEmail };
