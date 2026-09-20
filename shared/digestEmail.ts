import { DEFAULT_CLASSIFICATION_PROMPT, digestCategories } from './classificationPrompt';

type EmailPost = {
  author: string;
  body: string;
  service: 'instagram' | 'x' | 'linkedin';
  category?: string;
  imageUrl: string | null;
};

type EmailDigest = {
  date: string;
  url: string;
  classificationPrompt?: string;
  classificationFallbackCount: number;
  failedServices: EmailPost['service'][];
  posts: EmailPost[];
};

const serviceNames = { instagram: 'Instagram', x: 'X (Twitter)', linkedin: 'LinkedIn' };
const sans = "'Alegreya Sans', 'Trebuchet MS', sans-serif";
const replyInstructions = 'Want different categories or rules? Reply to this email with what you would like to change. Your next Digest will use your updated preferences.';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function renderDigestEmail(digest: EmailDigest) {
  const sections = digestCategories(digest.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT, digest.posts.map(({ category }) => category));
  const warnings = [
    ...(digest.failedServices.length > 0 ? [`Could not read ${digest.failedServices.map((service) => serviceNames[service]).join(', ')}. Available services are still included.`] : []),
    ...(digest.classificationFallbackCount > 0 ? [`${digest.classificationFallbackCount} posts were omitted because they could not be categorized.`] : []),
  ];
  const textSections: string[] = [];
  const htmlSections = sections.map(({ id, name }) => {
    const posts = digest.posts.filter(({ category }) => category === id);
    const count = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;
    textSections.push(`${name} — ${count}\n\n${posts.length === 0 ? 'Nothing in this section this time.' : posts.map((post) => `${post.author} · ${serviceNames[post.service]}\n${post.body || `An image post from ${post.author}.`}${post.imageUrl ? `\nImage: ${post.imageUrl}` : ''}`).join('\n\n')}`);
    const htmlPosts = posts.map((post) => `<tr><td style="padding:16px 0;border-bottom:1px solid #d7ded4;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;"><tr>
        <td valign="top" style="overflow-wrap:anywhere;word-break:break-word;">
          <h3 style="margin:0 0 9px;font-family:${sans};font-size:24px;font-weight:600;line-height:1.15;">${escapeHtml(post.author)}</h3>
          <p style="margin:0 0 9px;color:#456159;font-family:${sans};font-size:14px;">${serviceNames[post.service]}</p>
          <p style="margin:0;font-family:${sans};font-size:21px;line-height:1.34;${post.body ? '' : 'color:#456159;font-style:italic;'}">${escapeHtml(post.body || `An image post from ${post.author}.`).replace(/\r\n|\r|\n/g, '<br>')}</p>
        </td>
        ${post.imageUrl ? `<td class="post-image-gap" width="24" style="width:24px;"></td><td class="post-image" width="122" align="right" valign="top" style="width:122px;text-align:right;"><img src="${escapeHtml(post.imageUrl)}" alt="Image from ${escapeHtml(post.author)}'s ${serviceNames[post.service]} post" width="122" align="right" style="display:block;width:122px;max-width:100%;height:auto;margin-left:auto;background:#f0f0e8;"></td>` : ''}
      </tr></table>
    </td></tr>`).join('');
    return `<tr><td style="padding-top:32px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-bottom:1px solid #18332e;"><tr>
        <td style="padding-bottom:17px;"><h2 style="margin:0;font-family:${sans};font-size:39px;font-weight:500;line-height:1.06;overflow-wrap:anywhere;">${escapeHtml(name)}</h2></td>
        <td width="70" align="right" valign="bottom" style="padding:0 0 17px 16px;color:#456159;font-family:${sans};font-size:16px;white-space:nowrap;">${count}</td>
      </tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;">${posts.length === 0 ? '<tr><td style="padding:16px 0;color:#456159;font-style:italic;">Nothing in this section this time.</td></tr>' : htmlPosts}</table>
    </td></tr>`;
  }).join('');

  const text = [`Your Digest for ${digest.date}`, `View this Digest online: ${digest.url}`, ...warnings, ...textSections, 'All caught up!', replyInstructions].join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Digest — ${escapeHtml(digest.date)}</title>
<style>@media only screen and (max-width:600px){.email-surround{padding:16px 8px!important}.email-paper{padding:20px 16px!important}.post-image-gap{width:15px!important}.post-image{width:88px!important}.post-image img{width:88px!important}}</style>
</head><body style="margin:0;padding:0;background:#e1e9e4;color:#18332e;font-family:${sans};font-size:17px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#e1e9e4" style="width:100%;table-layout:fixed;"><tr><td class="email-surround" align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#faf8f1" style="width:100%;table-layout:fixed;background:#faf8f1;color:#18332e;"><tr><td class="email-paper" style="padding:24px 32px 32px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;"><tr><td style="padding-bottom:16px;border-bottom:1px solid #d7ded4;">
        <h1 style="margin:0 0 8px;font-family:${sans};font-size:40px;font-weight:500;line-height:1.06;">Your Digest</h1>
        <p style="margin:0;color:#456159;font-size:16px;">${escapeHtml(digest.date)}</p>
        <p style="margin:16px 0 0;font-size:16px;line-height:1.5;"><a href="${escapeHtml(digest.url)}" style="color:#18332e;text-decoration:underline;">View this Digest online</a></p>
      </td></tr>
      ${warnings.map((warning) => `<tr><td style="padding-top:16px;"><p style="margin:0;padding:12px;border:1px solid #a34935;color:#843a29;">${escapeHtml(warning)}</p></td></tr>`).join('')}
      ${htmlSections}
      <tr><td style="padding-top:32px;"><p style="margin:0;padding-top:16px;border-top:1px solid #d7ded4;color:#456159;font-family:${sans};font-size:22px;font-style:italic;">All caught up!</p></td></tr>
      <tr><td style="padding-top:24px;color:#456159;font-family:${sans};font-size:16px;line-height:1.5;">
        <p style="margin:0;">${replyInstructions}</p>
      </td></tr></table>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  return { text, html };
}
