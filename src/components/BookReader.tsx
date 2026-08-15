import { Fragment } from "react";
import { Info } from "lucide-react";

import type { Block, Book, Chapter } from "@/lib/book-types";

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\[\^\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\^(\d+)\]$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        return (
          <sup key={i} className="ml-0.5 text-[0.65em] font-bold text-accent">
            {m[1]}
          </sup>
        );
      })}
    </>
  );
}

function BlockView({ block, showSpeaker }: { block: Block; showSpeaker: boolean }) {
  if (block.kind === "note") {
    return (
      <aside className="my-6 rounded-r-xl border-l-4 border-accent bg-accent/5 px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-accent">
          <Info className="h-3.5 w-3.5" />
          {block.title || "Note de l'éditeur"}
        </p>
        <p className="mt-2 text-[0.95em] italic leading-relaxed text-muted-foreground">
          <InlineText text={block.text} />
        </p>
      </aside>
    );
  }
  return (
    <p className="mt-4 leading-[1.8]">
      {showSpeaker && block.speaker && (
        <span className="mr-1 text-sm font-bold uppercase tracking-wide text-accent">
          {block.speaker} :
        </span>
      )}
      <InlineText text={block.text} />
    </p>
  );
}

export function ChapterView({ chapter, index }: { chapter: Chapter; index: number }) {
  let last = "";
  return (
    <section className="mt-10 border-t border-border pt-8">
      <h3 className="font-display text-xl font-semibold">
        {index + 1}. {chapter.title}
      </h3>
      {chapter.blocks.map((b, j) => {
        const show = b.kind === "speech" && !!b.speaker && b.speaker !== last;
        if (b.kind === "speech" && b.speaker) last = b.speaker;
        return <BlockView key={j} block={b} showSpeaker={show} />;
      })}
      {chapter.footnotes.length > 0 && (
        <div className="mt-8 border-t border-dashed border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</p>
          <ol className="mt-2 space-y-1.5">
            {chapter.footnotes.map((f) => (
              <li key={f.n} className="text-sm leading-relaxed text-muted-foreground">
                <span className="mr-1 font-bold text-accent">{f.n}.</span>
                {f.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function BookReader({ book }: { book: Book }) {
  return (
    <article className="card-soft max-h-[720px] overflow-y-auto p-6 font-book sm:p-9">
      <h2 className="font-display text-3xl font-bold">{book.title}</h2>
      <p className="mt-2 italic text-muted-foreground">{book.subtitle}</p>
      {book.intro
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="mt-4 leading-[1.75] text-muted-foreground">
            {p}
          </p>
        ))}
      {book.chapters.map((ch, i) => (
        <ChapterView key={i} chapter={ch} index={i} />
      ))}
      {book.glossary.length > 0 && (
        <section className="mt-10 border-t border-border pt-8">
          <h3 className="font-display text-xl font-semibold">Glossaire</h3>
          <dl className="mt-4 space-y-3">
            {book.glossary.map((g) => (
              <div key={g.term}>
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-muted-foreground">{g.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}
