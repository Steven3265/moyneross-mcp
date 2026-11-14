import { readFileSync } from 'node:fs';

// Structural and safety checks on data/corpus.json before it ships.
const text = readFileSync(new URL('../data/corpus.json', import.meta.url), 'utf8');
const snap = JSON.parse(text);
const errors = [];

const SECRET = /(SUPABASE_(?:SERVICE_ROLE|ANON)_KEY|STRIPE_(?:SECRET|RESTRICTED)_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) PRIVATE KEY-----|\bghp_[A-Za-z0-9]{20,}|\bsk-(?:proj-|ant-)?[A-Za-z0-9_]{20,})/i; // keys start at a word boundary, so 'risk-is-in-the-...' anchors do not match
// The sample strategy is a real building with identifying details changed.
// Its title plan, unit and street address must never appear anywhere; its
// suburb must never appear in the sample itself (papers may name places).
const SAMPLE_IDENTIFIERS = /PS630577|\b428 M(oun)?t\.? Dandenong|\bUnit 10\b/i;
const SAMPLE_PLACES = /Kilsyth|Dandenong|Mt\.? Dandenong|Bayswater|Croydon/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

if (snap.schemaVersion !== 3) errors.push('Unexpected snapshot schema version.');
if (!/^\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}$/.test(snap.corpusVersion ?? '')) errors.push('corpusVersion must be the content date and an 8-character fingerprint.');
if (!DATE.test(snap.generatedAt ?? '')) errors.push('generatedAt must be a date taken from the content.');
if (snap.source !== 'https://moyneross.com') errors.push(`Unexpected source: ${snap.source}`);
if (SECRET.test(text)) errors.push('Potential secret marker found in the snapshot.');
if (SAMPLE_IDENTIFIERS.test(text)) errors.push(`The sample's real identifiers appear in the snapshot: ${text.match(SAMPLE_IDENTIFIERS)[0]}`);
if (SAMPLE_PLACES.test(snap.sample.text)) errors.push(`The sample names its real locality: ${snap.sample.text.match(SAMPLE_PLACES)[0]}`);

const slugs = new Set(), ids = new Set();
for (const p of snap.papers) {
  if (slugs.has(p.slug)) errors.push(`Duplicate slug ${p.slug}`); slugs.add(p.slug);
  if (ids.has(p.id)) errors.push(`Duplicate id ${p.id}`); ids.add(p.id);
  if (!/^CMP \d{3}$/.test(p.id)) errors.push(`Unexpected paper id ${p.id}`);
  if (p.canonicalUrl !== `https://moyneross.com/insights/${p.slug}`) errors.push(`Non-canonical URL ${p.canonicalUrl}`);
  if (p.resourceUri !== `moyneross://papers/${p.slug}`) errors.push(`Bad resource URI ${p.resourceUri}`);
  if (!p.title || p.title.trim().length < 3) errors.push(`${p.slug}: title missing`);
  for (const f of ['question', 'answer', 'summary', 'contentMarkdown']) if (!p[f] || String(p[f]).length < 20) errors.push(`${p.slug}: ${f} missing or too short`);
  for (const f of ['datePublished', 'dateModified']) if (!DATE.test(p[f] ?? '')) errors.push(`${p.slug}: ${f} is not a date`);
  if (p.part && !['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].includes(p.part.number)) errors.push(`${p.slug}: unexpected part ${p.part.number}`);
  if (!Array.isArray(p.sections) || !p.sections.length) errors.push(`${p.slug}: no sections`);
  const anchors = new Set();
  for (const sec of p.sections ?? []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sec.anchor) || sec.url !== `${p.canonicalUrl}#${sec.anchor}`) errors.push(`${p.slug}: bad section anchor ${sec.anchor}`);
    if (anchors.has(sec.anchor)) errors.push(`${p.slug}: duplicate anchor ${sec.anchor}`);
    anchors.add(sec.anchor);
  }
}
// The paper–library graph: every page a paper rests on must exist, and every
// section it lands on must be one of that page's sections.
{
  const bySlug = new Map(snap.technical.pages.map((t) => [t.slug, t]));
  for (const p of snap.papers) for (const g of p.technicalPages ?? []) {
    const t = bySlug.get(g.slug);
    if (!t) { errors.push(`${p.slug} rests on missing library page ${g.slug}`); continue; }
    if (g.section && !t.sections.some((x) => x.id === g.section) && !(g.section === 'thresholds' && t.thresholds?.length)) errors.push(`${p.slug} lands on missing section ${g.slug}#${g.section}`);
  }
}
if (snap.papers.length < 40) errors.push(`Only ${snap.papers.length} papers; expected the full corpus.`);

const docUrls = new Set(snap.search.docs.map((d) => d.url));
for (const p of snap.papers) if (!docUrls.has(p.canonicalUrl)) errors.push(`${p.slug} is missing from the search index`);
for (const u of ['https://moyneross.com/methodology/mr-index', 'https://moyneross.com/methodology/capital-register', 'https://moyneross.com/samples/capital-strategy']) if (!docUrls.has(u)) errors.push(`Search index is missing ${u}`);
for (const d of snap.search.docs) if (!d.url.startsWith('https://moyneross.com/') || !d.title || !d.text) errors.push(`Bad search document ${d.url}`);

// The Technical Library: one page per framework element or space, anchored by
// section id, and never a price. A page is on one of two layouts: the earlier
// eleven fixed sections, or the topic layout, whose fixed sections are read
// from the website's own export (framework.topicLayout) rather than listed
// here, so converting more pages, or rewording a heading, needs no change to
// this check. Sections are matched by id, never by heading.
const TECH_SECTIONS = 'what-it-is,service-life,mechanisms,signs,diagnosis,severity,investigation,remedies,cost-shape,jurisdiction-notes,what-to-ask-for';
const ANCHOR = /^[a-z0-9-]+$/;
// A price is a currency amount; "priced per square metre" describes cost shape and is fine.
const MONEY = /(?:A\$|US\$|£|\$|€)\s?\d|\b\d[\d,.]*\s?(?:dollars|pounds|AUD|GBP|USD|EUR)\b/i;
const tech = snap.technical;
if (!tech || !Array.isArray(tech.pages)) errors.push('The Technical Library is missing from the snapshot.');
else {
  if (tech.url !== 'https://moyneross.com/technical') errors.push(`Unexpected Technical Library URL ${tech.url}`);
  if ((tech.framework?.sections ?? []).length !== 13) errors.push('The Technical Library should carry the 13 framework sections.');
  const situations = (tech.framework?.severityScale?.situations ?? []).map((x) => x.id).join();
  if (situations !== 'safety,failure,condition,lifecycle,deadline,check,nil') errors.push(`Unexpected severity scale: ${situations}`);
  if (tech.pages.length < 100) errors.push(`Only ${tech.pages.length} Technical Library pages; expected the full library.`);
  const tslugs = new Set(), elements = new Set();
  // Thresholds by market: once moyneross.com publishes them, every value names
  // one market (in the page's jurisdiction) and its source, and the rule for
  // using them travels with the snapshot.
  const MARKETS = ['AU', 'UK', 'US'];
  const withThresholds = tech.pages.filter((t) => Array.isArray(t.thresholds) && t.thresholds.length);
  if (withThresholds.length && !tech.framework?.thresholdPolicy?.rule) errors.push('Pages carry thresholds but the snapshot has no threshold policy.');
  for (const t of tech.pages) {
    for (const x of t.thresholds ?? []) {
      const where = `${t.slug}: threshold ${x.id}`;
      if (!MARKETS.includes(x.market)) errors.push(`${where}: market ${x.market} is not AU, UK or US`);
      else if (!(t.jurisdiction ?? []).includes(x.market)) errors.push(`${where}: market ${x.market} is outside the page's jurisdiction`);
      if (!String(x.id).startsWith(`${String(x.market).toLowerCase()}-`)) errors.push(`${where}: id does not start with its market`);
      if (!x.measure || !x.rule) errors.push(`${where}: measure or rule missing`);
      if (!x.source?.title || !String(x.source?.url ?? '').startsWith('https://')) errors.push(`${where}: source missing or not https`);
      if (MONEY.test(x.rule)) errors.push(`${where}: a threshold carries a price`);
    }
  }
  for (const t of tech.pages) {
    if (tslugs.has(t.slug) || slugs.has(t.slug)) errors.push(`Duplicate slug ${t.slug}`); tslugs.add(t.slug);
    if (elements.has(t.frameworkElement)) errors.push(`Two pages share the element ${t.frameworkElement}`); elements.add(t.frameworkElement);
    if (t.canonicalUrl !== `https://moyneross.com/technical/${t.slug}`) errors.push(`Non-canonical URL ${t.canonicalUrl}`);
    if (t.resourceUri !== `moyneross://technical/${t.slug}`) errors.push(`Bad resource URI ${t.resourceUri}`);
    if (!['element', 'space'].includes(t.pageType)) errors.push(`${t.slug}: unexpected page type ${t.pageType}`);
    if (!tech.framework.sections.includes(t.section)) errors.push(`${t.slug}: unknown framework section ${t.section}`);
    if (!t.title || t.title.trim().length < 3) errors.push(`${t.slug}: title missing`);
    for (const f of ['question', 'answer', 'limitations']) if (!t[f] || String(t[f]).length < 20) errors.push(`${t.slug}: ${f} missing or too short`);
    if (t.answer.length >= 600) errors.push(`${t.slug}: answer is ${t.answer.length} characters; the library keeps it under 600`);
    if (!DATE.test(t.publishedAt ?? '')) errors.push(`${t.slug}: publishedAt is not a date`);
    const ids = (t.sections ?? []).map((x) => x.id);
    if (t.layout === 'topic') {
      const fixed = tech.framework?.topicLayout?.fixed ?? [];
      if (!fixed.length) errors.push(`${t.slug}: on the topic layout, but the export carries no topicLayout`);
      if (new Set(ids).size !== ids.length) errors.push(`${t.slug}: two sections share an id`);
      for (const f of fixed) {
        if (!ids.includes(f.id)) errors.push(`${t.slug}: missing the fixed section ${f.id}`);
        if (f.place === 'first' && ids[0] !== f.id) errors.push(`${t.slug}: ${f.id} must be the first section`);
        if (f.place === 'last' && ids[ids.length - 1] !== f.id) errors.push(`${t.slug}: ${f.id} must be the last section`);
      }
      const seen = new Set(ids);
      for (const x of t.sections ?? []) for (const a of x.anchors ?? []) {
        if (!ANCHOR.test(a)) errors.push(`${t.slug}: bad anchor ${a} in ${x.id}`);
        if (seen.has(a)) errors.push(`${t.slug}: the address ${a} is used twice`);
        seen.add(a);
      }
    } else if (ids.join() !== TECH_SECTIONS) errors.push(`${t.slug}: sections are not the eleven fixed sections`);
    for (const x of t.sections ?? []) {
      if (x.url !== `${t.canonicalUrl}#${x.id}`) errors.push(`${t.slug}: bad section URL ${x.url}`);
      if (!x.markdown || x.markdown.length < 100) errors.push(`${t.slug}: section ${x.id} is empty or too short`);
      const money = String(x.markdown).match(MONEY);
      if (money) errors.push(`${t.slug}: section ${x.id} carries a money figure or rate (${money[0]}); the library carries cost shape only`);
    }
  }
}

// The glossary: enough terms to be the published page, every term with all
// three markets, and every page it points to a page the snapshot holds.
{
  const g = snap.glossary;
  const slugs = new Set((snap.technical?.pages ?? []).map((t) => t.slug));
  if (!g || !Array.isArray(g.terms) || g.terms.length < 50) errors.push('Glossary is missing or has fewer than 50 terms.');
  else {
    if (new Set(g.terms.map((t) => t.id)).size !== g.terms.length) errors.push('Glossary: two terms share an id.');
    for (const t of g.terms) {
      for (const f of ['concept', 'au', 'uk', 'us', 'group']) if (!t[f] || String(t[f]).length < 2) errors.push(`glossary ${t.id}: ${f} missing`);
      if (t.url !== `https://moyneross.com/technical/glossary#${t.id}`) errors.push(`glossary ${t.id}: bad URL ${t.url}`);
      for (const s of t.pages ?? []) if (!slugs.has(s)) errors.push(`glossary ${t.id}: points to /technical/${s}, which is not in the snapshot`);
    }
  }
}

if (snap.methods.map((m) => m.id).sort().join() !== 'capital-register,mr-index') errors.push('Methods must be the Capital Register and the MR Index.');
for (const m of snap.methods) if (m.text.length < 2000) errors.push(`${m.id}: method text looks truncated`);
if (!/\$331,225/.test(snap.sample.text) || !/Cost basis/.test(snap.sample.text)) errors.push('Sample text is missing its figures or register.');
if (!snap.engagement.text.startsWith('## Working with Moyne Ross') || !/950/.test(snap.engagement.text)) errors.push('Engagement text is missing or incomplete.');

if (errors.length) {
  console.error(`Snapshot validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Snapshot valid: ${snap.papers.length} papers with ${snap.papers.reduce((n, p) => n + p.sections.length, 0)} anchored sections, ${snap.technical.pages.length} Technical Library pages with ${snap.technical.pages.reduce((n, p) => n + p.sections.length, 0)}, ${snap.search.docs.length} search documents, ${snap.methods.length} methods, sample and engagement; corpus ${snap.corpusVersion}.`);
