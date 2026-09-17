/**
 * RAG — Retrieval-Augmented Generation (lightweight, honest implementation).
 *
 * Retrieval: TF-IDF cosine similarity over an evidence corpus stored in SQLite
 * (seeded from public health guidance: WHO, ICMR-NIN, ADA, KDIGO, AHA, USDA).
 * This is intentionally NOT claimed to be FAISS/BGE hybrid retrieval — it is a
 * dependency-free, auditable lexical retrieval layer with source attribution,
 * designed so a vector backend can replace it behind the same interface later.
 */
import { db } from "@/lib/db";
import { safeParseArray } from "@/lib/nutrition/targets";

export interface EvidenceChunk {
  evidence_id: string;
  source: string;
  document: string;
  section: string;
  text: string;
  score: number;
}

export interface RetrievedEvidence {
  chunks: EvidenceChunk[];
  latencyMs: number;
  method: "tfidf_cosine";
}

interface IndexedDoc {
  id: string;
  source: string;
  document: string;
  section: string;
  text: string;
  tags: string[];
  tf: Map<string, number>;
  norm: number;
}

let indexCache: { docs: IndexedDoc[]; idf: Map<string, number>; at: number } | null = null;
const CACHE_TTL = 120_000;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !["the", "and", "for", "with", "should", "are", "not", "from", "that", "this", "per", "can", "may", "have", "has", "was", "were", "their", "than", "less", "more", "into", "such", "when", "which", "about", "based", "also", "intake", "diet"].includes(t));
}

async function buildIndex() {
  if (indexCache && Date.now() - indexCache.at < CACHE_TTL) return indexCache;
  const rows = await db.evidence.findMany({ where: { isActive: true } });
  const docs: IndexedDoc[] = [];
  const df = new Map<string, number>();

  for (const r of rows) {
    const tagTerms = safeParseArray(r.tags).flatMap((t) => tokenize(t.replace(/_/g, " ")));
    const sourceTerms = tokenize(r.source);
    const tokens = [...tokenize(`${r.text} ${r.document} ${r.section ?? ""}`), ...tagTerms.map((t) => t).map((t) => t), ...sourceTerms];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let norm = 0;
    for (const v of tf.values()) norm += v * v;
    norm = Math.sqrt(norm);
    docs.push({
      id: r.id, source: r.source, document: r.document, section: r.section ?? "", text: r.text,
      tags: safeParseArray(r.tags), tf, norm,
    });
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log((docs.length + 1) / (count + 0.5)));
  }
  indexCache = { docs, idf, at: Date.now() };
  return indexCache;
}

export function invalidateEvidenceCache(): void {
  indexCache = null;
}

/**
 * Retrieve evidence chunks relevant to a query string.
 * Tag matches act as a retrieval boost (deterministic, auditable).
 */
export async function retrieveEvidence(query: string, topK = 3, tagBoost: string[] = []): Promise<RetrievedEvidence> {
  const t0 = Date.now();
  const { docs, idf } = await buildIndex();

  const qTokens = tokenize(query);
  const qTags = tagBoost.map((t) => t.toLowerCase());
  if (qTokens.length === 0) {
    return { chunks: [], latencyMs: Date.now() - t0, method: "tfidf_cosine" };
  }

  const qTf = new Map<string, number>();
  for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
  let qNorm = 0;
  for (const v of qTf.values()) qNorm += v * v;
  qNorm = Math.sqrt(qNorm);

  const scored: EvidenceChunk[] = [];
  for (const doc of docs) {
    let dot = 0;
    for (const [term, qCount] of qTf) {
      const dCount = doc.tf.get(term);
      if (!dCount) continue;
      const w = idf.get(term) ?? 1;
      dot += qCount * w * dCount * w;
    }
    let score = doc.norm > 0 && qNorm > 0 ? dot / (qNorm * doc.norm) : 0;

    // deterministic tag boost
    for (const tag of qTags) {
      if (doc.tags.includes(tag)) score += 0.08;
      if (doc.source.toLowerCase() === tag) score += 0.05;
    }

    if (score > 0.01) {
      scored.push({
        evidence_id: doc.id, source: doc.source, document: doc.document,
        section: doc.section, text: doc.text, score: Math.round(score * 1000) / 1000,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return { chunks: scored.slice(0, topK), latencyMs: Date.now() - t0, method: "tfidf_cosine" };
}
