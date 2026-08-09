import { createServerFn } from "@tanstack/react-start";
import nodemailer from "nodemailer";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

function welcomeEmailHtml(name: string) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fcfbf6; padding:32px 16px; font-family:'Bricolage Grotesque', Arial, sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border:2px solid #111111; border-radius:24px; box-shadow:6px 6px 0 #111111;">
        <tr>
          <td align="center" style="padding:40px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" style="padding-right:10px;">
                  <img src="https://hssgafvhephfkmdwdvjq.supabase.co/storage/v1/object/public/email-assets/logo.svg" width="48" height="48" alt="" style="display:block; border:0; border-radius:50%; border:2px solid #111111;" />
                </td>
                <td valign="middle">
                  <span style="font-family:'Bricolage Grotesque', Arial, sans-serif; font-size:28px; font-weight:800; color:#111111; letter-spacing:-0.02em;">Aura</span><span style="font-family:'Bricolage Grotesque', Arial, sans-serif; font-size:28px; font-weight:800; color:#ff65a5; letter-spacing:-0.02em;">.</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 0 32px;">
            <h1 style="margin:0; font-family:'Bricolage Grotesque', Arial, sans-serif; font-size:28px; font-weight:800; color:#111111; letter-spacing:-0.02em;">
              You're all set, ${name}!
            </h1>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 32px 32px 32px;">
            <p style="margin:0; font-family:Arial, sans-serif; font-size:15px; line-height:1.6; color:#4b4b4b;">
              Your email is confirmed and your Aura Exam account is ready to use.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 0 32px;">
            <hr style="border:none; border-top:2px solid #111111; margin:0;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 32px 32px;">
            <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; line-height:1.6; color:#8a8a8a;">
              Aura Exam — UTeM FICT<br />
              This is an automated email — please don't reply directly to it.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}

// Best-effort, never throws — a failed courtesy email must not block login/redirect.
async function sendConfirmedNotice(email: string, name: string) {
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_SMTP_USER,
        pass: process.env.GMAIL_SMTP_APP_PASSWORD,
      },
    });
    await transport.sendMail({
      from: `Aura Exam <${process.env.GMAIL_SMTP_USER}>`,
      to: email,
      subject: "Your Aura Exam account is confirmed",
      html: welcomeEmailHtml(name),
    });
  } catch (err) {
    console.error("sendConfirmedNotice failed:", err);
  }
}

// Sends the "email confirmed" courtesy notice exactly once per account.
// Idempotency is tracked via user_metadata.welcome_email_sent — low-stakes
// (worst case a user clears/sets it themselves and gets/skips one extra
// email), unlike profiles.role which must never be attacker-controlled.
export const sendEmailConfirmedNotice = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { sent: false };
    if (!user.email_confirmed_at) return { sent: false };
    if (user.user_metadata?.welcome_email_sent) return { sent: false };

    const name = (user.user_metadata?.name as string | undefined) ?? user.email ?? "there";
    await sendConfirmedNotice(user.email!, name);

    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, welcome_email_sent: true },
    });

    return { sent: true };
  },
);
