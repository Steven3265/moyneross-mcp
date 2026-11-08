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
export type TechnicalSection = { id: string; heading: string; url: string; markdown: string };
export type TechnicalSource = { title: string; publisher: string; url: string };
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
  sections: TechnicalSection[];
};
export type SeveritySituation = { id: string; timingBasis: string | null; meaning: string };
export type TechnicalLibrary = {
  name: string;
  url: string;
  framework: { name: string; sections: string[]; pageTypes: Record<string, string>; severityScale: { note?: string; situations?: SeveritySituation[] } };
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
};

export type PaperSummary = Omit<PaperRecord, 'contentMarkdown'>;
