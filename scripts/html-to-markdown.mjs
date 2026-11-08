// A small, dependency-free HTML-to-markdown converter for the snapshot.
// It keeps what helps a model read a page: headings, paragraphs, lists,
// bold, links (made absolute), definition lists, figures and tables. Table
// rows whose single wide cell carries a note for the row above (the sample
// register's "Cost basis" rows) become an extra column on that row, so each
// figure stays with its line. Scripts, styles, icons, forms and buttons are
// dropped.

const VOID = new Set(['br', 'hr', 'img', 'wbr', 'input', 'meta', 'link', 'source', 'col', 'area', 'base', 'embed', 'param', 'track']);
const DROP = new Set(['script', 'style', 'svg', 'noscript', 'form', 'button', 'template', 'iframe', 'canvas', 'select', 'textarea']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', copy: '©', times: '×', sup2: '²', rarr: '→', larr: '←', darr: '↓', uarr: '↑' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { stack[stack.length - 1].children.push({ text: m[4] }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !m[3].trim().endsWith('/')) stack.push(node);
  }
  return root;
}

const squash = (s) => s.replace(/\s+/g, ' ');

// dropLinks: calls to action to leave out entirely (text and link), such as
// the site's "Start your strategy" buttons: they are not content, and the
// hand-over is the connector's own job (and withheld where it must be).
export function htmlToMarkdown(html, base, { dropLinks = [] } = {}) {
  const abs = (href) => { try { return new URL(href, base).href; } catch { return href; } };

  function inline(node) {
    if (node.text !== undefined) return squash(decode(node.text));
    if (DROP.has(node.tag) || node.attrs['aria-hidden'] === 'true') return '';
    const inner = node.children.map((c, i) => (i && c.tag && node.children[i - 1].tag ? ' ' : '') + inline(c)).join('');
    switch (node.tag) {
      case 'br': return '\n';
      case 'strong': case 'b': { const t = inner.trim(); return t ? ` **${t}** ` : ''; }
      case 'em': case 'i': { const t = inner.trim(); return t ? ` *${t}* ` : ''; }
      case 'code': return inner.trim() ? `\`${inner.trim()}\`` : '';
      case 'a': {
        const t = inner.trim(); const href = node.attrs.href || '';
        if (!t || dropLinks.some((re) => re.test(abs(href)))) return '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return t;
        return `[${t}](${abs(href)})`;
      }
      default: return inner;
    }
  }
  const tidy = (s) => s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\*\* +([.,;:)])/g, '**$1').replace(/\( +/g, '(').trim();

  const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'nav', 'details', 'summary']);
  const hasBlock = (n) => n.children?.some((c) => c.tag && (BLOCK.has(c.tag) || hasBlock(c)));

  function cellText(c) { return tidy(inline(c)).replace(/\n+/g, ' ').replace(/\|/g, '\\|'); }

  function table(node) {
    const rows = [];
    (function collect(n) { for (const c of n.children || []) { if (c.tag === 'tr') rows.push(c); else if (c.tag) collect(c); } })(node);
    const grid = rows.map((r) => r.children.filter((c) => c.tag === 'td' || c.tag === 'th'));
    const header = grid.find((cells) => cells.some((c) => c.tag === 'th')) || grid[0] || [];
    const width = header.reduce((n, c) => n + (Number(c.attrs.colspan) || 1), 0);
    const out = []; let noteCol = false;
    for (const cells of grid) {
      if (cells === header) continue;
      const wide = cells.find((c) => (Number(c.attrs.colspan) || 1) >= width - 1);
      if (wide && out.length) { out[out.length - 1].note = cellText(wide).replace(/^\*\*[^*]{1,40}\.\*\*\s*/, ''); noteCol = true; continue; }
      out.push({ cells: cells.map(cellText) });
    }
    const head = header.map(cellText);
    if (noteCol) head.push('Cost basis');
    const line = (cols) => `| ${cols.join(' | ')} |`;
    const body = out.map((r) => line(noteCol ? [...r.cells, r.note ?? ''] : r.cells));
    return [line(head), line(head.map(() => '---')), ...body].join('\n');
  }

  function block(node, depth = 0) {
    if (node.text !== undefined) return squash(decode(node.text));
    if (DROP.has(node.tag) || node.attrs['aria-hidden'] === 'true') return '';
    const kids = (n) => n.children.map((c) => block(c, depth)).join('');
    const para = (s) => { const t = tidy(s); return t ? `\n\n${t}\n\n` : ''; };
    switch (node.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const t = tidy(inline(node)).replace(/\n+/g, ' ').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
        return t ? `\n\n${'#'.repeat(Number(node.tag[1]))} ${t}\n\n` : '';
      }
      case 'p': case 'figcaption': case 'summary': return para(inline(node));
      case 'blockquote': return para('> ' + tidy(inline(node)).replace(/\n/g, '\n> '));
      case 'pre': return `\n\n\`\`\`\n${decode(node.children.map((c) => c.text ?? inline(c)).join(''))}\n\`\`\`\n\n`;
      case 'ul': case 'ol': {
        let i = 0;
        const items = node.children.filter((c) => c.tag === 'li').map((li) => {
          i++; const t = tidy(hasBlock(li) ? block(li, depth + 1) : inline(li)).replace(/\n{2,}/g, '\n');
          return t ? `${'  '.repeat(depth)}${node.tag === 'ol' ? `${i}.` : '-'} ${t.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}` : '';
        }).filter(Boolean);
        return items.length ? `\n\n${items.join('\n')}\n\n` : '';
      }
      case 'dl': {
        const parts = [];
        (function walk(n) { for (const c of n.children || []) { if (c.tag === 'dt') parts.push(`**${tidy(inline(c))}**`); else if (c.tag === 'dd') parts.push(tidy(inline(c))); else if (c.tag) walk(c); } })(node);
        const pairs = []; for (let k = 0; k < parts.length; k += 2) pairs.push(`${parts[k]}: ${parts[k + 1] ?? ''}`.trim());
        return pairs.length ? `\n\n${pairs.map((p) => `- ${p}`).join('\n')}\n\n` : '';
      }
      case 'table': return `\n\n${table(node)}\n\n`;
      case 'hr': return '\n\n---\n\n';
      case 'br': return '\n';
      default:
        if (!hasBlock(node) && node.tag !== '#root' && BLOCK.has(node.tag)) return para(inline(node));
        if (!hasBlock(node) && node.tag !== '#root') return inline(node);
        return kids(node);
    }
  }

  const md = block(parse(html));
  let fenced = false;
  return md.split('\n').map((l) => { if (l.startsWith('```')) fenced = !fenced; return fenced || /^\s+[-\d]/.test(l) ? l.replace(/[ \t]+$/, '') : l.trim(); })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The content area of a page: after the site navigation, before the footer,
// so a page's opening header is kept along with its <main> content.
export function contentArea(html) {
  const start = html.indexOf('</nav>');
  const end = html.lastIndexOf('<footer');
  if (start < 0 || end < start) {
    const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (!m) throw new Error('page has no content area');
    return m[1];
  }
  return html.slice(start + 6, end);
}
