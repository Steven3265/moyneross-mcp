export type Part = { number: string; title: string; position: number | null };
export type Section = { heading: string; anchor: string; url: string };

export type PaperRecord = {
  id: string;
  slug: string;
  title: string;
  question: string;
  answer: string;
  summary: string;
  limitations: string;
  part: Part | null;
  publicationType: string;
  evidenceType: string;
  jurisdiction: string[];
  topics: string[];
  datePublished: string;
  dateModified: string;
  reviewedAt: string | null;
  reviewDue: string | null;
  wordCount: number | null;
  canonicalUrl: string;
  resourceUri: string;
  sections: Section[];
  contentMarkdown: string;
};

export type MethodRecord = { id: 'capital-register' | 'mr-index'; title: string; url: string; summary: string; text: string };
export type SampleRecord = { title: string; url: string; interactiveUrl: string; text: string };
export type SearchDoc = { url: string; id: string; title: string; kind: string; blurb: string; text: string };

// A Technical Library page: one element or functional space of the Moyne Ross
// Building Check Framework. Section ids are the anchors on moyneross.com.
// anchors: the other addresses inside a section (its headings, table rows,
// and earlier addresses kept alive, such as #diagnosis on a converted page).
export type TechnicalSection = { id: string; heading: string; url: string; markdown: string; anchors?: string[] };
export type TechnicalQuestion = { question: string; answer: string; url: string };
export type TechnicalSource = { title: string; publisher: string; url: string };
// A measured value that applies in one market only (moyneross.com keeps every
// market's numbers out of the text the markets share). Read an asset against
// its own market's values; another market's value is a comparison at most.
export type Market = 'AU' | 'UK' | 'US';
export type TechnicalThreshold = {
  id: string; market: Market; measure: string; rule: string; clause?: string;
  basis: 'primary' | 'secondary' | string; appliesTo: string[]; source: TechnicalSource;
};
export type TechnicalPage = {
  slug: string;
  pageType: 'element' | 'space' | string;
  title: string;
  question: string;
  answer: string;
  limitations: string;
  frameworkElement: string;
  frameworkDescription: string;
  section: string;
  subsection: string;
  useClasses: string[];
  jurisdiction: string[];
  typologies: string[];
  spaces: string[];
  spaceElements: string[];
  subSpaces: string[];
  related: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  reviewDue: string | null;
  wordCount: number | null;
  sources: TechnicalSource[];
  canonicalUrl: string;
  resourceUri: string;
  // "topic": the topic layout; "eleven": the earlier eleven fixed sections.
  layout?: string;
  // Retrieval aids published by moyneross.com: the search title, the names
  // people use for the element, and authored questions answered on the page.
  searchTitle?: string;
  alsoKnownAs?: string[];
  questions?: TechnicalQuestion[];
  sections: TechnicalSection[];
  // Values by market. Absent on a snapshot taken before moyneross.com
  // published them; then the page simply carries none.
  thresholds?: TechnicalThreshold[];
  marketsWithoutThresholds?: string[];
};
export type SeveritySituation = { id: string; timingBasis: string | null; meaning: string };
export type TechnicalLibrary = {
  name: string;
  url: string;
  framework: {
    name: string; sections: string[]; pageTypes: Record<string, string>; severityScale: { note?: string; situations?: SeveritySituation[] };
    // The sections every topic-layout page has, as moyneross.com publishes them.
    topicLayout?: { fixed: { id: string; heading: string; place?: string; headingStartsWith?: boolean }[] };
    // How thresholds may be used, as moyneross.com publishes it.
    thresholdPolicy?: { markets: Record<string, string>; rule: string };
  };
  pages: TechnicalPage[];
};

export type CorpusSnapshot = {
  schemaVersion: number;
  corpusVersion: string;
  generatedAt: string | null;
  source: string;
  publication: { name: string; url: string; thesis: string };
  papers: PaperRecord[];
  methods: MethodRecord[];
  sample: SampleRecord;
  engagement: { url: string; text: string };
  technical: TechnicalLibrary;
  search: { note: string; docs: SearchDoc[] };
};

export type SearchScope = 'all' | 'research' | 'technical' | 'methodology' | 'sample';
export type MatchStrength = 'none' | 'weak' | 'strong';

export type SearchResult = {
  title: string;
  url: string;
  kind: string;
  id: string | null;
  slug: string | null;
  answer: string;
  score: number;
  // For a Technical Library page: the section that best answers the query.
  section?: { heading: string; url: string };
};

export type PaperSummary = Omit<PaperRecord, 'contentMarkdown'>;
