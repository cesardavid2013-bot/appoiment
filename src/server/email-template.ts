import "server-only";
import { env } from "./env";

export type EmailContent = {
  subject: string;
  preheader?: string;
  heading: string;
  paragraphs?: string[];
  details?: [string, string][];
  cta?: { label: string; url: string };
  footnote?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

/** One restrained, accessible layout for all transactional email. */
export function renderEmail(c: EmailContent): { subject: string; html: string; text: string } {
  const cta = c.cta ? { ...c.cta, url: c.cta.url.startsWith("http") ? c.cta.url : absoluteUrl(c.cta.url) } : undefined;
  const details = c.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-top:1px solid #e7e3dc">${c.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid #e7e3dc;color:#6b665e;font-size:14px;width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #e7e3dc;color:#1c1a17;font-size:14px">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(c.preheader ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3dc;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:#1c1a17">Kept</td></tr>
<tr><td style="padding:8px 32px 28px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1c1a17;font-weight:600">${esc(c.heading)}</h1>
${(c.paragraphs ?? []).map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3d3a34">${esc(p)}</p>`).join("")}
${details}
${cta ? `<a href="${esc(cta.url)}" style="display:inline-block;margin-top:8px;background:#1c1a17;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:8px">${esc(cta.label)}</a>` : ""}
${c.footnote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b665e">${esc(c.footnote)}</p>` : ""}
</td></tr></table>
<p style="font-size:12px;color:#8a857c;margin:16px 0 0">You're receiving this because of activity on your Kept account. Manage notifications in Account → Notifications.</p>
</td></tr></table></body></html>`;
  const text = [
    c.heading,
    "",
    ...(c.paragraphs ?? []),
    ...(c.details?.length ? ["", ...c.details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    ...(c.footnote ? ["", c.footnote] : []),
  ].join("\n");
  return { subject: c.subject, html, text };
}
