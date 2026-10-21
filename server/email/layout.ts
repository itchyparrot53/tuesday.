export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const C = {
  page: '#F3F3F3',
  card: '#FFFFFF',
  ink: '#111111',
  body: '#1A1A1A',
  muted: '#5F5F5F',
  faint: '#8A8A8A',
  line: '#E5E5E5',
  footer: '#FAFAFA',
  accent: '#C9356C',
  highlight: '#EDB9CC',
};

/**
 * The one email shell. Table based and inline styled on purpose: email clients
 * ignore most modern CSS. Keep every colour in C so the templates cannot drift.
 */
export function layout(input: {
  title: string;
  body: string;
  appUrl: string;
  preheader?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
}): string {
  const host = (() => {
    try {
      return new URL(input.appUrl).host;
    } catch {
      return input.appUrl;
    }
  })();
  const appUrl = escapeHtml(input.appUrl.replace(/\/$/, ''));
  const preheader = escapeHtml(input.preheader ?? input.title);
  const footer = input.footerNote
    ? `<p style="margin:0 0 10px;color:${C.muted};font-size:12px;line-height:18px;">${escapeHtml(input.footerNote)}</p>`
    : '';
  const accountLinks = input.unsubscribeUrl
    ? `<p style="margin:0 0 10px;font-size:12px;line-height:18px;">
          <a href="${appUrl}/profile?tab=notifications" style="color:${C.accent};text-decoration:none;font-weight:600;">Manage notifications</a>
          <span style="color:${C.faint};">&nbsp;&middot;&nbsp;</span>
          <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${C.accent};text-decoration:none;font-weight:600;">Unsubscribe</a>
        </p>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${C.page};">
    <div style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="height:4px;background:${C.highlight};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 28px 0;">
                <img src="${appUrl}/email-logo.png" width="200" height="47" alt="Tuesday" style="display:block;width:200px;height:47px;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 0;">
                <h1 style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:30px;font-weight:700;color:${C.ink};letter-spacing:-0.02em;">${escapeHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:${C.body};">
                ${input.body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px;background:${C.footer};border-top:1px solid ${C.line};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${C.muted};">
                ${footer}
                <p style="margin:0 0 10px;color:${C.muted};font-size:12px;line-height:18px;">
                  Sent by Tuesday. Account: ${escapeHtml(host)}.
                </p>
                ${accountLinks}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:22px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.accent};color:#FFFFFF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;font-weight:600;text-decoration:none;border-radius:8px;padding:11px 18px;">${escapeHtml(label)}</a></p>`;
}

export function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${C.accent};text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>`;
}
