"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/frontend/components/ui/sheet";
import { Button } from "@/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { renderMarkdownToHtml } from "@/shared/markdown";

/**
 * Right-side slide-over that renders a full CMO document (Brand Voice or
 * Marketing Strategy) from Markdown, with Copy + Download (HTML / Word /
 * PDF) actions. The doc body is plain Markdown so it round-trips cleanly
 * to every export format.
 */
export function DocumentDrawer({
  open,
  onOpenChange,
  title,
  markdown,
  fileBase,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  markdown: string;
  /** Base filename (no extension) for downloads. */
  fileBase: string;
}) {
  const [copied, setCopied] = useState(false);
  const html = renderMarkdownToHtml(markdown);

  function copy() {
    navigator.clipboard.writeText(markdown).then(
      () => {
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Couldn't copy")
    );
  }

  function downloadBlob(content: string, mime: string, ext: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function fullHtmlDoc(): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeAttr(
      title
    )}</title><style>
      body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.6}
      h1{font-size:26px;margin:0 0 8px}h2{font-size:20px;margin:28px 0 8px}h3{font-size:16px;margin:20px 0 6px}
      table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:14px}
      th{background:#f5f5f5}code{background:#f0f0f0;padding:1px 4px;border-radius:3px}blockquote{border-left:3px solid #ccc;margin:12px 0;padding-left:12px;color:#555}
      hr{border:none;border-top:1px solid #e5e5e5;margin:24px 0}a{color:#d97706}
    </style></head><body><h1>${escapeAttr(title)}</h1>${stripTwClasses(html)}</body></html>`;
  }

  function downloadHtml() {
    downloadBlob(fullHtmlDoc(), "text/html;charset=utf-8", "html");
    toast.success("Downloaded HTML");
  }

  function downloadWord() {
    // The classic Word trick: an HTML document served as application/msword
    // opens natively in Word with formatting + tables intact.
    const wordDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${fullHtmlDoc()}</body></html>`;
    downloadBlob(wordDoc, "application/msword", "doc");
    toast.success("Downloaded Word doc");
  }

  function downloadPdf() {
    // No PDF lib bundled — open a print window with just the document and
    // let the OS "Save as PDF". Reliable and dependency-free.
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) {
      toast.error("Allow pop-ups to export PDF");
      return;
    }
    w.document.write(fullHtmlDoc());
    w.document.close();
    w.focus();
    // Give the new window a tick to lay out before invoking print.
    setTimeout(() => w.print(), 350);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" aria-hidden />
            {title}
          </SheetTitle>
          <div className="flex items-center gap-1.5 pr-8">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={copy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadPdf}>PDF (print)</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadWord}>Word (.doc)</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadHtml}>HTML (.html)</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    downloadBlob(markdown, "text/markdown;charset=utf-8", "md");
                    toast.success("Downloaded Markdown");
                  }}
                >
                  Markdown (.md)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div
            className="text-sm text-foreground [&_table]:my-4 [&_td]:align-top"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Strip Tailwind class="" attributes for the standalone export documents. */
function stripTwClasses(html: string): string {
  return html.replace(/\sclass="[^"]*"/g, "");
}
