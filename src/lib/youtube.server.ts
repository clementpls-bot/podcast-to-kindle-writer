/**
 * Récupération des sous-titres YouTube via l'API interne "player" (client Android).
 * Aucun binaire natif requis : compatible avec le runtime Worker.
 */

export type Segment = { t: number; text: string };

export type TranscriptChunk = {
  index: number;
  startSec: number;
  text: string;
};

export type TranscriptResult = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  durationSec: number;
  lang: string;
  availableLangs: { code: string; label: string; auto: boolean }[];
  chunks: TranscriptChunk[];
  totalChars: number;
};

export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const m = url.pathname.match(/\/(embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m?.[2]) return m[2];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

async function callPlayer(videoId: string) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.10.38",
          androidSdkVersion: 30,
          hl: "fr",
          gl: "FR",
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`YouTube a répondu ${res.status}`);
  return (await res.json()) as any;
}

function timecode(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const CHUNK_CHARS = 4500;

function buildChunks(segments: Segment[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let buf: string[] = [];
  let len = 0;
  let start = segments[0]?.t ?? 0;
  let lastMark = -1e9;

  for (const seg of segments) {
    let piece = seg.text;
    if (seg.t - lastMark >= 60) {
      piece = `[${timecode(seg.t)}] ${piece}`;
      lastMark = seg.t;
    }
    buf.push(piece);
    len += piece.length + 1;
    if (len >= CHUNK_CHARS) {
      chunks.push({ index: chunks.length, startSec: start, text: buf.join(" ") });
      buf = [];
      len = 0;
      start = seg.t;
      lastMark = -1e9;
    }
  }
  if (buf.length) {
    const text = buf.join(" ");
    const last = chunks[chunks.length - 1];
    if (text.trim().length < 400 && last) {
      last.text += " " + text;
    } else {
      chunks.push({ index: chunks.length, startSec: start, text });
    }
  }
  return chunks;
}

export async function fetchTranscript(
  input: string,
  preferredLang?: string,
): Promise<TranscriptResult> {
  const videoId = parseVideoId(input);
  if (!videoId) {
    throw new Error("Lien YouTube invalide. Colle une URL du type https://youtube.com/watch?v=...");
  }

  const data = await callPlayer(videoId);
  const status = data?.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(
      data?.playabilityStatus?.reason ||
        "Cette vidéo n'est pas accessible (privée, protégée par âge ou supprimée).",
    );
  }

  const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    throw new Error(
      "Aucun sous-titre disponible sur cette vidéo. Choisis une vidéo avec sous-titres (même automatiques).",
    );
  }

  const availableLangs = tracks.map((t) => ({
    code: t.languageCode as string,
    label: (t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode) as string,
    auto: t.kind === "asr",
  }));

  const pick =
    (preferredLang && tracks.find((t) => t.languageCode === preferredLang && t.kind !== "asr")) ||
    (preferredLang && tracks.find((t) => t.languageCode === preferredLang)) ||
    tracks.find((t) => t.kind !== "asr") ||
    tracks[0];

  const capRes = await fetch(pick.baseUrl);
  if (!capRes.ok) throw new Error("Impossible de télécharger les sous-titres de cette vidéo.");
  const xml = await capRes.text();

  const segments: Segment[] = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? "";
    const tMatch = attrs.match(/\bt="(\d+)"/);
    const text = decodeEntities(stripTags(m[2] ?? "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    segments.push({ t: Number(tMatch?.[1] ?? 0) / 1000, text });
  }

  if (!segments.length) {
    throw new Error("Les sous-titres de cette vidéo sont vides.");
  }

  const details = data?.videoDetails ?? {};
  const thumbs: any[] = details?.thumbnail?.thumbnails ?? [];

  return {
    videoId,
    title: details.title || "Épisode sans titre",
    author: details.author || "Auteur inconnu",
    thumbnail: thumbs.length
      ? thumbs[thumbs.length - 1].url
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSec: Number(details.lengthSeconds || 0),
    lang: pick.languageCode,
    availableLangs,
    chunks: buildChunks(segments),
    totalChars: segments.reduce((a, s) => a + s.text.length, 0),
  };
}
