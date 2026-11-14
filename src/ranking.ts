// Ranking settings, fitted to the benchmarks by scripts/calibrate.mjs.
//
// Do not edit by hand. Run `npm run calibrate` after the corpus changes and
// commit what it writes. The snapshot refresh workflow does this already, so
// enriching the library cannot leave the ranking mis-tuned.
//
// libraryWeight puts library scores on the same scale as the website's: the
// two are scored on separate collections so that adding library pages can
// never reorder the research results, which leaves their raw scores
// incomparable.
//
// headlineBoost rewards a document whose name and question match the query,
// over one that merely mentions it in the body.
export const RANKING = {
  libraryWeight: 0.55,
  headlineBoost: 0.9,
};
