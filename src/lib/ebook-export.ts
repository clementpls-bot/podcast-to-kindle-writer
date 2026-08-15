import { zipSync, strToU8 } from "fflate";
import type { Block, Book, Chapter } from "./book-types";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "ebook"
  );
}

/** Remplace les appels de note [^1] par du texte lisible (PDF, aperçus). */
export function plainFootnotes(text: string) {
  return text.replace(/\[\^(\d+)\]/g, "[$1]");
}

const CSS = `body{font-family:serif;line-height:1.55;margin:1em;}
h1{font-size:1.6em;margin:0 0 .2em;line-height:1.25;}
h2{font-size:1.05em;font-weight:normal;font-style:italic;color:#444;margin:0 0 1.5em;}
p{margin:0 0 .85em;text-align:justify;}
.speaker{font-weight:bold;font-variant:small-caps;}
.meta{color:#555;font-size:.9em;}
.note{border-left:3px solid #d97706;background:#faf7f2;padding:.6em .9em;margin:1.1em 0;font-size:.94em;}
.note .note-title{display:block;font-weight:bold;font-variant:small-caps;letter-spacing:.04em;margin-bottom:.3em;color:#8a5a08;}
.note p{margin:0 0 .5em;text-align:left;font-style:italic;}
.footnotes{margin-top:2em;border-top:1px solid #ccc;padding-top:.8em;font-size:.85em;color:#444;}
.footnotes h3{font-size:.9em;font-variant:small-caps;letter-spacing:.06em;margin:0 0 .5em;}
.footnotes p{text-align:left;margin:0 0 .4em;}
sup a{text-decoration:none;color:#8a5a08;}
dl.glossary dt{font-weight:bold;margin-top:.8em;}
dl.glossary dd{margin:.15em 0 0 1em;color:#333;}
nav ol{list-style:none;padding-left:0;}
nav li{margin:.4em 0;}`;

function chapterHtml(title: string, body: string, lang: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;
}

function inline(text: string, chapterIndex: number) {
  return esc(text).replace(
    /\[\^(\d+)\]/g,
    (_, n) => `<sup id="fnref${chapterIndex}-${n}"><a href="#fn${chapterIndex}-${n}">${n}</a></sup>`,
  );
}

function blockHtml(block: Block, chapterIndex: number, showSpeaker: boolean) {
  if (block.kind === "note") {
    return `<div class="note">${
      block.title ? `<span class="note-title">${esc(block.title)}</span>` : ""
    }${block.text
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((p) => `<p>${inline(p, chapterIndex)}</p>`)
      .join("")}</div>`;
  }
  return `<p>${
    showSpeaker && block.speaker ? `<span class="speaker">${esc(block.speaker)} :</span> ` : ""
  }${inline(block.text, chapterIndex)}</p>`;
}

function chapterBody(ch: Chapter, i: number) {
  let last = "";
  const body = ch.blocks
    .map((b) => {
      if (b.kind === "note") return blockHtml(b, i, false);
      const show = !!b.speaker && b.speaker !== last;
      last = b.speaker ?? last;
      return blockHtml(b, i, show);
    })
    .join("");

  const notes = ch.footnotes.length
    ? `<div class="footnotes"><h3>Notes</h3>${ch.footnotes
        .map(
          (f) =>
            `<p id="fn${i}-${f.n}"><a href="#fnref${i}-${f.n}">${f.n}.</a> ${esc(f.text)}</p>`,
        )
        .join("")}</div>`
    : "";

  return `<h1>${esc(ch.title)}</h1>${body}${notes}`;
}

export function buildEpub(book: Book): Blob {
  const lang = book.language || "fr";
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  const files: Record<string, Uint8Array> = {};
  const hasGlossary = book.glossary.length > 0;

  files["mimetype"] = strToU8("application/epub+zip");
  files["META-INF/container.xml"] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  files["OEBPS/style.css"] = strToU8(CSS);

  const titleBody = `<h1>${esc(book.title)}</h1><h2>${esc(book.subtitle)}</h2>
<p class="meta">${esc(book.author)}</p>
${book.intro
  .split(/\n{2,}/)
  .filter(Boolean)
  .map((p) => `<p>${esc(p)}</p>`)
  .join("")}
<p class="meta">D'après l'épisode « ${esc(book.sourceTitle)} » — ${esc(book.sourceUrl)}</p>`;
  files["OEBPS/title.xhtml"] = strToU8(chapterHtml(book.title, titleBody, lang));

  book.chapters.forEach((ch, i) => {
    files[`OEBPS/chap${i + 1}.xhtml`] = strToU8(chapterHtml(ch.title, chapterBody(ch, i + 1), lang));
  });

  if (hasGlossary) {
    const body = `<h1>Glossaire</h1><dl class="glossary">${book.glossary
      .map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`)
      .join("")}</dl>`;
    files["OEBPS/glossary.xhtml"] = strToU8(chapterHtml("Glossaire", body, lang));
  }

  const navBody = `<h1>Sommaire</h1><nav epub:type="toc" id="toc"><ol>${book.chapters
    .map((ch, i) => `<li><a href="chap${i + 1}.xhtml">${esc(ch.title)}</a></li>`)
    .join("")}${hasGlossary ? `<li><a href="glossary.xhtml">Glossaire</a></li>` : ""}</ol></nav>`;
  files["OEBPS/nav.xhtml"] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>Sommaire</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${navBody}</body></html>`,
  );

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
    ...book.chapters.map(
      (_, i) => `<item id="c${i + 1}" href="chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
    ...(hasGlossary
      ? [`<item id="glossary" href="glossary.xhtml" media-type="application/xhtml+xml"/>`]
      : []),
  ].join("");

  const spine = [
    `<itemref idref="title"/>`,
    `<itemref idref="nav"/>`,
    ...book.chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`),
    ...(hasGlossary ? [`<itemref idref="glossary"/>`] : []),
  ].join("");

  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${uid}</dc:identifier>
<dc:title>${esc(book.title)}</dc:title>
<dc:creator>${esc(book.author)}</dc:creator>
<dc:language>${lang}</dc:language>
<dc:description>${esc(book.subtitle)}</dc:description>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>${manifest}</manifest>
<spine>${spine}</spine>
</package>`);

  const zipped = zipSync(files, { level: 6 });
  const buf = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(buf).set(zipped);
  return new Blob([buf], { type: "application/epub+zip" });
}

export async function buildPdf(book: Book): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 46;
  const maxW = W - M * 2;
  let y = 0;

  const newPage = () => {
    doc.addPage();
    y = M;
  };
  const ensure = (h: number) => {
    if (y + h > H - M) newPage();
  };

  // Couverture
  y = H / 3;
  doc.setFont("times", "bold").setFontSize(24);
  doc.splitTextToSize(book.title, maxW).forEach((l: string) => {
    doc.text(l, W / 2, y, { align: "center" });
    y += 30;
  });
  doc.setFont("times", "italic").setFontSize(13);
  doc.splitTextToSize(book.subtitle, maxW).forEach((l: string) => {
    doc.text(l, W / 2, y + 8, { align: "center" });
    y += 20;
  });
  doc.setFont("times", "normal").setFontSize(12);
  doc.text(book.author, W / 2, y + 30, { align: "center" });

  // Sommaire
  newPage();
  doc.setFont("times", "bold").setFontSize(18);
  doc.text("Sommaire", M, y);
  y += 28;
  doc.setFont("times", "normal").setFontSize(11);
  book.chapters.forEach((ch, i) => {
    doc.splitTextToSize(`${i + 1}. ${ch.title}`, maxW).forEach((l: string) => {
      ensure(16);
      doc.text(l, M, y);
      y += 16;
    });
  });
  if (book.glossary.length) {
    ensure(16);
    doc.text("Glossaire", M, y);
    y += 16;
  }

  if (book.intro) {
    newPage();
    doc.setFont("times", "italic").setFontSize(11);
    book.intro.split(/\n{2,}/).forEach((p) => {
      doc.splitTextToSize(p, maxW).forEach((l: string) => {
        ensure(15);
        doc.text(l, M, y);
        y += 15;
      });
      y += 8;
    });
  }

  book.chapters.forEach((ch) => {
    newPage();
    doc.setFont("times", "bold").setFontSize(16);
    doc.splitTextToSize(ch.title, maxW).forEach((l: string) => {
      ensure(22);
      doc.text(l, M, y);
      y += 22;
    });
    y += 6;
    let last = "";

    ch.blocks.forEach((b) => {
      if (b.kind === "note") {
        const inset = 12;
        const lines = doc
          .setFont("times", "italic")
          .setFontSize(10)
          .splitTextToSize(plainFootnotes(b.text), maxW - inset * 2) as string[];
        const boxH = lines.length * 13 + (b.title ? 16 : 0) + 16;
        ensure(boxH + 8);
        const top = y - 4;
        doc.setDrawColor(217, 119, 6).setLineWidth(2);
        doc.line(M, top, M, top + boxH);
        doc.setLineWidth(0.2);
        y += 10;
        if (b.title) {
          doc.setFont("times", "bold").setFontSize(9);
          doc.text(b.title.toUpperCase(), M + inset, y);
          y += 14;
        }
        doc.setFont("times", "italic").setFontSize(10);
        lines.forEach((l) => {
          doc.text(l, M + inset, y);
          y += 13;
        });
        y += 10;
        doc.setDrawColor(0);
        return;
      }

      if (b.speaker && b.speaker !== last) {
        last = b.speaker;
        ensure(18);
        doc.setFont("times", "bold").setFontSize(10);
        doc.text(b.speaker.toUpperCase(), M, y);
        y += 14;
      }
      doc.setFont("times", "normal").setFontSize(11);
      doc.splitTextToSize(plainFootnotes(b.text), maxW).forEach((l: string) => {
        ensure(15);
        doc.text(l, M, y);
        y += 15;
      });
      y += 7;
    });

    if (ch.footnotes.length) {
      ensure(30);
      y += 8;
      doc.setDrawColor(180);
      doc.line(M, y, M + 120, y);
      doc.setDrawColor(0);
      y += 14;
      doc.setFont("times", "bold").setFontSize(9);
      doc.text("NOTES", M, y);
      y += 13;
      doc.setFont("times", "normal").setFontSize(9);
      ch.footnotes.forEach((f) => {
        doc.splitTextToSize(`${f.n}. ${f.text}`, maxW).forEach((l: string) => {
          ensure(12);
          doc.text(l, M, y);
          y += 12;
        });
      });
    }
  });

  if (book.glossary.length) {
    newPage();
    doc.setFont("times", "bold").setFontSize(16);
    doc.text("Glossaire", M, y);
    y += 26;
    book.glossary.forEach((g) => {
      ensure(28);
      doc.setFont("times", "bold").setFontSize(11);
      doc.text(g.term, M, y);
      y += 14;
      doc.setFont("times", "normal").setFontSize(10);
      doc.splitTextToSize(g.definition, maxW - 12).forEach((l: string) => {
        ensure(13);
        doc.text(l, M + 12, y);
        y += 13;
      });
      y += 8;
    });
  }

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
