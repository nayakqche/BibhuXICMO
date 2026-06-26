"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  FileText,
  Loader2,
  Paperclip,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { savePersonaAction } from "@/app/(app)/agents/persona-actions";

/** File types the picker accepts (the "upload your persona" formats). */
const ACCEPT =
  ".txt,.md,.markdown,.csv,.tsv,.json,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.mp4";

/** Extensions whose text we can read directly in the browser. */
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json)$/i;

/**
 * Persona / brand-voice input for the social agents (LinkedIn, X,
 * Instagram). Two equally-valid, both-optional paths:
 *
 *   1. Paste persona text straight into the box.
 *   2. Upload files — text files (.txt/.csv/.md/…) are read and merged
 *      into the box automatically; richer formats (PDF, slides, images,
 *      video) are attached by name so you can paste their key points.
 *
 * Whatever ends up in the box is saved to the workspace and injected
 * into every post-generation prompt for these agents.
 */
export function PersonaCard({ initialPersona }: { initialPersona: string | null }) {
  const [text, setText] = useState(initialPersona ?? "");
  const [savedText, setSavedText] = useState(initialPersona ?? "");
  const [isSaving, startSaving] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dirty = text.trim() !== savedText.trim();

  async function ingestFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    let appended = "";
    const noted: string[] = [];

    for (const file of list) {
      if (TEXT_EXT.test(file.name)) {
        try {
          const content = await file.text();
          if (content.trim()) {
            appended += `\n\n--- ${file.name} ---\n${content.trim()}`;
          }
        } catch {
          noted.push(file.name);
        }
      } else {
        // PDF / docx / xlsx / image / video — we can't parse binary
        // content in the browser, so record a reference the user can
        // flesh out, and keep the upload from silently doing nothing.
        noted.push(file.name);
        appended += `\n\n[Attached: ${file.name} — paste its key points here so the agent can use them.]`;
      }
    }

    setText((prev) => (prev + appended).trim());

    if (noted.length > 0) {
      toast.message("Some files were attached by name", {
        description: `Text files were read automatically. For ${noted.join(
          ", "
        )}, paste the key points into the box.`,
      });
    } else {
      toast.success("Added file content to your persona");
    }
  }

  function save() {
    startSaving(async () => {
      const res = await savePersonaAction(text);
      if (res.ok) {
        setSavedText(text.trim());
        toast.success(text.trim() ? "Persona saved" : "Persona cleared");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Your persona
            <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Optional
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Paste your brand voice / past posts, or upload them. The agent
            uses this to write in your style.
          </p>
        </div>
        {savedText.trim() ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500">
            <Check className="h-3 w-3" aria-hidden />
            Active
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Upload zone — click or drag-and-drop */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors " +
            (dragOver
              ? "border-primary bg-primary/5"
              : "border-border/70 hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <UploadCloud className="h-5 w-5 text-muted-foreground" aria-hidden />
          <div className="text-xs font-medium text-foreground">
            Drop files or click to upload
          </div>
          <div className="text-[10px] text-muted-foreground">
            PDF, DOC, CSV, XLSX, PNG, JPG, MP4 · text files are read
            automatically
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void ingestFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or paste
          <span className="h-px flex-1 bg-border" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste your brand voice, tone, audience, and a few example posts you love. The more you give, the more the drafts sound like you."
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3" aria-hidden />
            {text.trim().length.toLocaleString()} chars
          </span>
          <div className="flex items-center gap-2">
            {text.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                disabled={isSaving}
                onClick={() => setText("")}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              disabled={isSaving || !dirty}
              onClick={save}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden />
              )}
              {dirty ? "Save persona" : "Saved"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
