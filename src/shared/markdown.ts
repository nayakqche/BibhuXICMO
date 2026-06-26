/**
 * Tiny, dependency-free Markdown → HTML renderer that is safe to import in
 * client components (no `fs`/`path`, unlike the marketing MarkdownRenderer).
 *
 * Supports the subset a CMO document needs: ATX headings, bold/italic,
 * inline code, links, unordered + ordered lists, blockquotes, horizontal
 * rules, GitHub-flavoured tables, and paragraphs. All text is HTML-escaped
 * before inline formatting is applied, so it is safe to inject the output
 * via dangerouslySetInnerHTML.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline formatting: bold, italic, code, links. Input is already escaped. */
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener" class="text-primary underline underline-offset-2">$1</a>'
    );
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim());
}

export function renderMarkdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="my-3 leading-relaxed">${inline(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table: a header row followed by a separator row.
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      flushPara();
      const header = splitRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const thead = header
        .map(
          (h) =>
            `<th class="border border-border px-3 py-2 text-left text-xs font-semibold">${inline(escapeHtml(h))}</th>`
        )
        .join("");
      const tbody = rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c) =>
                  `<td class="border border-border px-3 py-2 align-top text-xs">${inline(escapeHtml(c))}</td>`
              )
              .join("")}</tr>`
        )
        .join("");
      out.push(
        `<div class="my-4 overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const sizes: Record<number, string> = {
        1: "mt-2 mb-3 text-2xl font-bold tracking-tight",
        2: "mt-6 mb-2 text-lg font-semibold tracking-tight",
        3: "mt-5 mb-1.5 text-base font-semibold",
        4: "mt-4 mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground",
        5: "mt-3 mb-1 text-sm font-semibold",
        6: "mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
      };
      out.push(
        `<h${level} class="${sizes[level] ?? sizes[6]}">${inline(escapeHtml(h[2]))}</h${level}>`
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushPara();
      out.push('<hr class="my-5 border-border" />');
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="my-3 border-l-2 border-primary/50 pl-3 italic text-muted-foreground">${inline(escapeHtml(quote.join(" ")))}</blockquote>`
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(
          `<li class="ml-1">${inline(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, "")))}</li>`
        );
        i++;
      }
      out.push(`<ol class="my-3 list-decimal space-y-1 pl-6">${items.join("")}</ol>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          `<li class="ml-1">${inline(escapeHtml(lines[i].replace(/^\s*[-*]\s+/, "")))}</li>`
        );
        i++;
      }
      out.push(`<ul class="my-3 list-disc space-y-1 pl-6">${items.join("")}</ul>`);
      continue;
    }

    // Blank line ends a paragraph
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return out.join("\n");
}
