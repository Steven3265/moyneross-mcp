# Deployment

## First release

1. **GitHub.** Create the repository `Steven3265/moyneross-mcp` and push this code to `main`. In Settings → Actions → General, tick "Allow GitHub Actions to create and approve pull requests" (for the daily snapshot refresh).
2. **Vercel.** New Project → import `moyneross-mcp`. Framework preset: Other. No environment variables are required. Deploy.
3. **Domain.** In the Vercel project, Settings → Domains → add `mcp.moyneross.com`. At the moyneross.com DNS provider, add the CNAME record Vercel shows (`mcp` → `cname.vercel-dns.com`).
4. **Check it.** `https://mcp.moyneross.com/health` should report 49 papers, 103 Technical Library pages and a content hash. Add `https://mcp.moyneross.com/mcp` as a custom connector in Claude and ask it something about deferred maintenance.
5. **Registry.** GitHub → Actions → "Publish to MCP Registry" → Run workflow. It runs the full check, publishes `server.json` with GitHub sign-in (no keys) and verifies the listing.
6. **Directories.** Submit to Claude's Connectors Directory and, using `/mcp/openai`, the OpenAI app directory. Glama, Smithery and others index the registry and the repository on their own.

## 1.1.0: the Technical Library

Order matters: the connector's snapshot reads `moyneross.com/technical/export.json`, so the website goes live first.

1. **Website.** Deploy the moyneross.com release that adds `/technical`. Check `https://moyneross.com/technical/export.json` returns 103 pages and `https://moyneross.com/technical/elements/foundations.json` returns 404.
2. **Snapshot.** `npm run snapshot:check` should report that `data/corpus.json` matches the live corpus. (This release's snapshot was built from the same website build; if the website changed afterwards, run `npm run snapshot` and `npm run check`.)
3. **Connector.** Push to `main`; Vercel redeploys. `https://mcp.moyneross.com/health` should report 49 papers, 103 Technical Library pages and version 1.1.0.
4. **Registry.** Run "Publish to MCP Registry" again so the listing shows 1.1.0 and the new description.

## Ongoing

- Content: nothing to do. When moyneross.com changes, the daily refresh opens a pull request with the new snapshot, already checked; merge it to redeploy.
- A new release: bump the version in `package.json`, `package-lock.json`, `server.json`, `src/identity.ts`, both plugin files, the marketplace file and `gemini-extension.json`, add a CHANGELOG entry (`npm run validate:metadata` checks all of these), then publish to the registry again.
