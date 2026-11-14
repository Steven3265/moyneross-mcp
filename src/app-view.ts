// The interactive view for the graph tools (MCP Apps, io.modelcontextprotocol/ui).
//
// One self-contained page, no dependencies and no network: the host passes the
// tool result in over postMessage, and the page renders whichever of the three
// results it was given. A host without MCP Apps never loads it and shows the
// tool's text instead, so nothing depends on it.
//
//   building_brief              elements by framework section, threshold counts
//                               by market, filter, and "more" a page at a time
//   compare_technical_sections  the sections side by side
//   trace_connections           the graph around one paper or page; clicking a
//                               node walks to it, Back returns
//
// The page asks the host to call tools (building_brief for the next page,
// trace_connections to walk) and to open canonical moyneross.com links. It is
// written without template literals so it can live in a TypeScript string.

export const APP_VIEW_URI = 'ui://moyneross/graph-view.html';
export const APP_VIEW_MIME = 'text/html;profile=mcp-app';
export const APPS_PROTOCOL_VERSION = '2026-01-26';

export const APP_VIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moyne Ross</title>
<style>
:root {
  --bg: var(--color-background-primary, #ffffff);
  --bg2: var(--color-background-secondary, #f6f5f2);
  --fg: var(--color-text-primary, #1d1c1a);
  --fg2: var(--color-text-secondary, #5f5d58);
  --fg3: var(--color-text-tertiary, #8f8c85);
  --line: var(--color-border-primary, #e4e1da);
  --line2: var(--color-border-secondary, #d3cfc6);
  --accent: var(--color-text-info, #2f5d50);
  --radius: var(--border-radius-md, 8px);
  --sans: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 var(--sans); }
body { padding: 14px 16px 16px; }
h1 { font-size: 15px; font-weight: 600; margin: 0 0 2px; letter-spacing: -0.005em; }
.sub { color: var(--fg2); font-size: 12.5px; margin-bottom: 12px; }
.sub b { color: var(--fg); font-weight: 600; }
a, .link { color: var(--accent); text-decoration: none; cursor: pointer; }
a:hover, .link:hover { text-decoration: underline; }
.bar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
input[type=search] { flex: 1; min-width: 160px; font: inherit; color: var(--fg); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 10px; }
button { font: inherit; font-size: 12.5px; color: var(--fg); background: var(--bg2); border: 1px solid var(--line2); border-radius: var(--radius); padding: 5px 11px; cursor: pointer; }
button:hover { border-color: var(--fg3); }
button:disabled { opacity: .5; cursor: default; }
.group { margin-top: 14px; }
.group > h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg3); margin: 0 0 4px; }
.row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 7px 0; border-top: 1px solid var(--line); align-items: baseline; }
.row .t { font-weight: 500; }
.row .meta { color: var(--fg2); font-size: 12px; grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; }
.chips { display: flex; gap: 4px; }
.chip { font-size: 11px; font-variant-numeric: tabular-nums; border: 1px solid var(--line2); border-radius: 999px; padding: 0 7px; color: var(--fg2); white-space: nowrap; }
.chip.on { color: var(--fg); border-color: var(--fg3); }
.chip.off { color: var(--fg3); border-style: dashed; }
.papers { display: none; grid-column: 1 / -1; font-size: 12.5px; padding: 2px 0 0 10px; border-left: 2px solid var(--line); }
.row.open .papers { display: block; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.col { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; background: var(--bg); min-width: 0; }
.col h3 { font-size: 13.5px; margin: 0; }
.col .h { color: var(--fg3); font-size: 11.5px; margin-bottom: 6px; }
.md { font-size: 13px; color: var(--fg); overflow-wrap: anywhere; }
.md h4 { font-size: 12.5px; margin: 10px 0 2px; }
.md p { margin: 0 0 8px; }
.md ul { margin: 0 0 8px; padding-left: 18px; }
.cut { color: var(--fg3); font-size: 12px; }
.tw { overflow-x: auto; margin: 0 0 10px; }
.md table { border-collapse: collapse; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; }
.md th { text-align: left; font-weight: 600; color: var(--fg2); border-bottom: 1px solid var(--line2); padding: 4px 8px 4px 0; }
.md td { border-bottom: 1px solid var(--line); padding: 4px 8px 4px 0; vertical-align: top; }
.node { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; background: var(--bg2); margin-bottom: 12px; }
.node .k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--fg3); }
.node .t { font-size: 15px; font-weight: 600; }
.edges { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 14px; }
.edge h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg3); margin: 0 0 4px; }
.edge .item { padding: 4px 0; border-top: 1px solid var(--line); }
.edge .why { color: var(--fg2); font-size: 12px; }
.walk { cursor: pointer; font-weight: 500; }
.walk:hover { color: var(--accent); }
.empty, .status { color: var(--fg3); font-size: 12.5px; }
.status { margin-top: 10px; }
.foot { margin-top: 14px; color: var(--fg3); font-size: 11.5px; }
</style>
</head>
<body>
<div id="app"><div class="status">Loading…</div></div>
<script>
(function () {
  "use strict";
  var nextId = 1, pending = {}, input = null, view = null, history = [];
  var app = document.getElementById("app");

  function post(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params || {} }); }
  function callTool(name, args) {
    return request("tools/call", { name: name, arguments: args }).then(function (r) {
      if (r && r.isError) throw new Error(text(r) || "The tool returned an error.");
      return r && r.structuredContent;
    });
  }
  function openLink(url) { request("ui/open-link", { url: url }).catch(function () { window.open(url, "_blank", "noopener"); }); }
  function text(r) { var c = (r && r.content) || []; for (var i = 0; i < c.length; i++) if (c[i].type === "text") return c[i].text; return ""; }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id] && (m.result !== undefined || m.error)) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || "Request failed")); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-input") input = (m.params && m.params.arguments) || {};
    else if (m.method === "ui/notifications/tool-result") render(m.params && m.params.structuredContent, true);
    else if (m.method === "ui/notifications/tool-cancelled") status("Cancelled.");
    else if (m.method === "ui/notifications/host-context-changed") applyContext(m.params || {});
    else if (m.id != null && m.method) post({ jsonrpc: "2.0", id: m.id, result: {} });
  });

  function applyContext(ctx) {
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var k in vars) if (vars[k]) document.documentElement.style.setProperty(k, vars[k]);
    if (ctx.theme) document.documentElement.style.colorScheme = ctx.theme;
  }

  // ── Small, safe rendering helpers ──
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function href(u) { return /^https:\\/\\/(www\\.)?moyneross\\.com\\//.test(u) ? u : null; }
  function a(url, label) { var h = href(url); return h ? '<span class="link" data-href="' + esc(h) + '">' + esc(label) + "</span>" : esc(label); }
  function inline(s) {
    return esc(s)
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>")
      .replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function (_, label, url) {
        var abs = url.charAt(0) === "/" ? "https://moyneross.com" + url : url;
        var h = href(abs.replace(/&amp;/g, "&"));
        return h ? '<span class="link" data-href="' + esc(h) + '">' + label + "</span>" : label;
      });
  }
  function md(src) {
    var out = [], list = false, para = [], table = null;
    function flush() { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    function cells(t) { return t.replace(/^\\|/, "").replace(/\\|$/, "").split("|").map(function (c) { return c.trim(); }); }
    function endTable() {
      if (!table) return;
      var head = table[0], rows = table.slice(1).filter(function (r) { return !r.every(function (c) { return /^:?-{2,}:?$/.test(c); }); });
      out.push('<div class="tw"><table><thead><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>"
        + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
      table = null;
    }
    String(src || "").split(/\\n/).forEach(function (line) {
      var t = line.trim();
      if (/^\\|.*\\|$/.test(t)) { flush(); if (list) { out.push("</ul>"); list = false; } (table = table || []).push(cells(t)); return; }
      endTable();
      if (/^#{1,6}\\s/.test(t)) { flush(); if (list) { out.push("</ul>"); list = false; } out.push("<h4>" + inline(t.replace(/^#+\\s*/, "")) + "</h4>"); }
      else if (/^[-*]\\s+/.test(t)) { flush(); if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(t.replace(/^[-*]\\s+/, "")) + "</li>"); }
      else if (!t) { flush(); if (list) { out.push("</ul>"); list = false; } }
      else { if (list) { out.push("</ul>"); list = false; } para.push(t); }
    });
    flush(); endTable(); if (list) out.push("</ul>");
    return out.join("");
  }
  function status(msg) { var s = document.querySelector(".status"); if (!s) { s = document.createElement("div"); s.className = "status"; app.appendChild(s); } s.textContent = msg; }

  app.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-href],[data-walk],[data-toggle],[data-back],[data-more]") : null;
    if (!t) return;
    if (t.hasAttribute("data-href")) openLink(t.getAttribute("data-href"));
    else if (t.hasAttribute("data-walk")) walk(t.getAttribute("data-walk"));
    else if (t.hasAttribute("data-toggle")) t.closest(".row").classList.toggle("open");
    else if (t.hasAttribute("data-back")) back();
    else if (t.hasAttribute("data-more")) more(t);
  });

  function render(sc, fromHost) {
    if (!sc) { app.innerHTML = '<div class="empty">No result to show.</div>'; return; }
    if (fromHost) history = [];
    if (sc.useClass && sc.elements) { view = { kind: "brief", data: sc }; renderBrief(sc); }
    else if (sc.pages && sc.section !== undefined) { view = { kind: "compare", data: sc }; renderCompare(sc); }
    else if (sc.from) { view = { kind: "trace", data: sc }; renderTrace(sc); }
    else app.innerHTML = '<div class="empty">This result has no view.</div>';
  }

  // ── building_brief ──
  var USE = { "commercial": "Commercial", "industrial": "Industrial", "institutional": "Institutional", "residential-multi": "Residential, multi-unit" };
  function briefRows(elements) {
    var html = "", sec = null;
    elements.forEach(function (e) {
      if (e.section !== sec) { if (sec !== null) html += "</div>"; sec = e.section; html += '<div class="group" data-group><h2>' + esc(sec) + "</h2>"; }
      var chips = Object.keys(e.thresholds || {}).map(function (m) { var n = e.thresholds[m]; return '<span class="chip ' + (n ? "on" : "off") + '" title="' + n + " measured threshold" + (n === 1 ? "" : "s") + " in " + m + '">' + m + " " + n + "</span>"; }).join("");
      var papers = (e.papers || []).length;
      html += '<div class="row" data-filter="' + esc((e.title + " " + e.section + " " + (e.answer || "")).toLowerCase()) + '">'
        + '<div class="t">' + a(e.url, e.title) + "</div><div class=\\"chips\\">" + chips + "</div>"
        + '<div class="meta">' + (e.serviceLife ? a(e.serviceLife, "Service life") : "") + a(e.url + "#severity", "Severity")
        + (papers ? '<span class="link" data-toggle>' + papers + " paper" + (papers === 1 ? "" : "s") + "</span>" : "")
        + '<span class="link" data-walk="' + esc(e.slug) + '">Connections</span></div>'
        + (e.answer ? '<div class="meta">' + esc(e.answer) + "</div>" : "")
        + (papers ? '<div class="papers">' + e.papers.map(function (s) { return '<div><span class="link" data-walk="' + esc(s) + '">' + esc(s.replace(/-/g, " ")) + "</span></div>"; }).join("") + "</div>" : "")
        + "</div>";
    });
    if (sec !== null) html += "</div>";
    return html;
  }
  function renderBrief(b) {
    var spaces = (b.spaces || []).map(function (s) { return s.title; });
    app.innerHTML = "<h1>" + esc(USE[b.useClass] || b.useClass) + " building" + (b.market ? " · " + esc(b.market) : "") + "</h1>"
      + '<div class="sub"><b id="shown">' + b.count + "</b> of <b>" + b.total + "</b> elements · " + spaces.length + " spaces" + (b.unknownSpaces && b.unknownSpaces.length ? " · not recognised: " + esc(b.unknownSpaces.join(", ")) : "") + "</div>"
      + '<div class="bar"><input type="search" placeholder="Filter elements" aria-label="Filter elements"></div>'
      + '<div id="rows">' + briefRows(b.elements) + "</div>"
      + (b.nextCursor ? '<div class="bar" style="margin-top:12px"><button data-more="' + esc(b.nextCursor) + '">Show more</button></div>' : "")
      + '<div class="foot">' + esc(b.boundary) + "</div>";
    app.querySelector("input").addEventListener("input", function (e) {
      var q = e.target.value.trim().toLowerCase();
      app.querySelectorAll(".row").forEach(function (r) { r.style.display = !q || r.getAttribute("data-filter").indexOf(q) >= 0 ? "" : "none"; });
      app.querySelectorAll("[data-group]").forEach(function (g) { var any = false; g.querySelectorAll(".row").forEach(function (r) { if (r.style.display !== "none") any = true; }); g.style.display = any ? "" : "none"; });
    });
  }
  function more(btn) {
    var b = view && view.data; if (!b) return;
    btn.disabled = true; btn.textContent = "Loading…";
    var args = Object.assign({}, input || {}, { use_class: b.useClass, cursor: btn.getAttribute("data-more") });
    if (b.market) args.market = b.market;
    callTool("building_brief", args).then(function (next) {
      b.elements = b.elements.concat(next.elements); b.count = b.elements.length; b.nextCursor = next.nextCursor;
      var q = app.querySelector("input").value; renderBrief(b);
      if (q) { var i = app.querySelector("input"); i.value = q; i.dispatchEvent(new Event("input")); }
    }).catch(function (err) { btn.disabled = false; btn.textContent = "Show more"; status(err.message); });
  }

  // ── compare_technical_sections ──
  function renderCompare(c) {
    var name = c.section === "thresholds" ? "Thresholds" + (c.market ? " · " + c.market : " by market") : String(c.section).replace(/-/g, " ").replace(/^./, function (x) { return x.toUpperCase(); });
    app.innerHTML = "<h1>" + esc(name) + "</h1><div class=\\"sub\\">" + c.pages.length + " pages side by side" + (c.unknown && c.unknown.length ? " · not found: " + esc(c.unknown.join(", ")) : "") + "</div>"
      + '<div class="cols">' + c.pages.map(function (p) {
        return '<div class="col"><h3>' + a(p.url, p.title) + "</h3>" + (p.heading ? '<div class="h">' + esc(p.heading) + "</div>" : "")
          + '<div class="md">' + md(p.text) + "</div>" + (p.truncated ? '<div class="cut">Shortened · ' + a(p.url, "read the whole section") + "</div>" : "") + "</div>";
      }).join("") + "</div>"
      + (c.policy ? '<div class="foot">' + esc(c.policy) + "</div>" : "");
  }

  // ── trace_connections ──
  function edge(title, items, line) {
    if (!items || !items.length) return "";
    return '<div class="edge"><h2>' + esc(title) + " · " + items.length + "</h2>" + items.map(function (x) { return '<div class="item">' + line(x) + "</div>"; }).join("") + "</div>";
  }
  function walkable(slug, label) { return '<span class="walk" data-walk="' + esc(slug) + '">' + esc(label) + "</span>"; }
  function renderTrace(c) {
    var f = c.from;
    var body = edge("Rests on", c.restsOn, function (g) { return walkable(g.slug, g.title) + (g.why ? '<div class="why">' + esc(g.why) + "</div>" : ""); })
      + edge("Papers on the same ground", c.sharesGroundWith, function (p) { return walkable(p.slug, p.title) + '<div class="why">shares ' + esc(p.sharedPages.join(", ").replace(/-/g, " ")) + "</div>"; })
      + edge("Papers grounded here", c.groundedPapers, function (p) { return walkable(p.slug, p.title) + (p.why ? '<div class="why">' + esc(p.why) + "</div>" : ""); })
      + edge("Related", c.related, function (p) { return walkable(p.slug, p.title); })
      + edge("Spaces", c.spaces, function (p) { return walkable(p.slug, p.title); })
      + edge("Elements here", c.elements, function (p) { return walkable(p.slug, p.title); });
    app.innerHTML = (history.length ? '<div class="bar"><button data-back>← Back</button></div>' : "")
      + '<div class="node"><div class="k">' + (f.kind === "paper" ? "Paper" + (f.id ? " · " + esc(f.id) : "") : "Technical Library") + '</div><div class="t">' + esc(f.title) + "</div>" + a(f.url, "Open on moyneross.com") + "</div>"
      + (body ? '<div class="edges">' + body + "</div>" : '<div class="empty">No recorded connections.</div>');
  }
  function walk(slug) {
    status("Loading…");
    callTool("trace_connections", { ref: slug }).then(function (next) {
      if (view) history.push(view);
      view = { kind: "trace", data: next }; renderTrace(next);
    }).catch(function (err) { status(err.message); });
  }
  function back() {
    var prev = history.pop(); if (!prev) return;
    view = prev;
    if (prev.kind === "brief") renderBrief(prev.data); else if (prev.kind === "compare") renderCompare(prev.data); else renderTrace(prev.data);
  }

  // ── Size and handshake ──
  // Size reports start only once the handshake is done.
  var last = 0;
  function watchSize() {
    new ResizeObserver(function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(h - last) > 2) { last = h; notify("ui/notifications/size-changed", { width: Math.ceil(document.documentElement.scrollWidth), height: h }); }
    }).observe(document.body);
  }

  request("ui/initialize", {
    protocolVersion: "${'2026-01-26'}",
    appInfo: { name: "moyneross-graph-view", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] }
  }).then(function (r) {
    if (r && r.hostContext) applyContext(r.hostContext);
    notify("ui/notifications/initialized", {}); watchSize();
  }).catch(function () { notify("ui/notifications/initialized", {}); watchSize(); });
})();
</script>
</body>
</html>`;
