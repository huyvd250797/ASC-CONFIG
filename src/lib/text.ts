/**
 * Tiện ích xử lý chuỗi tiếng Việt + engine tìm kiếm gần đúng (fuzzy).
 */

/** Bỏ dấu 1 ký tự -> 1 ký tự (giữ nguyên độ dài để map index khi highlight). */
export function foldChar(ch: string) {
  if (ch === 'đ') return 'd';
  if (ch === 'Đ') return 'd';
  const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (base || ch).toLowerCase();
}

/** Bỏ dấu toàn chuỗi, giữ nguyên độ dài (dùng cho highlight). */
export function fold(value: string) {
  let out = '';
  for (const ch of value) out += foldChar(ch);
  return out;
}

/** Chuẩn hóa để so khớp: bỏ dấu, thường hóa, gom khoảng trắng. */
export function normalizeText(value: string) {
  return fold(value).replace(/\s+/g, ' ').trim();
}

/** Tách từ khóa thành các token có nghĩa. */
export function tokenize(query: string) {
  return normalizeText(query)
    .split(/[\s,;|]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Khoảng cách Levenshtein có ngưỡng cắt sớm. */
export function levenshtein(a: string, b: string, max: number) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowBest = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < rowBest) rowBest = current[j];
    }
    if (rowBest > max) return max + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}

/**
 * Ngưỡng sai lệch cho phép theo độ dài token.
 *
 * Từ tiếng Việt rất ngắn nên token <= 3 ký tự KHÔNG được phép sai:
 * cho phép sai 1 ký tự ở đây sẽ khiến "nho" khớp "cho", "ban" khớp "bao"...
 * và kết quả tìm kiếm đầy nhiễu.
 */
function toleranceFor(token: string) {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  if (token.length <= 9) return 2;
  return 3;
}

export type FieldMatch = { text: string; weight: number };

/**
 * Chấm điểm 1 token với 1 chuỗi.
 * Trả về 0 nếu không khớp ở bất kỳ mức nào.
 */
function scoreToken(token: string, normalized: string) {
  if (!normalized) return 0;

  const position = normalized.indexOf(token);
  if (position === 0) return 120;
  if (position > 0) {
    // Khớp đầu từ được ưu tiên hơn khớp giữa từ.
    const startsWord = normalized[position - 1] === ' ';
    return startsWord ? 100 : 78;
  }

  const tolerance = toleranceFor(token);
  if (tolerance === 0) return 0;

  const words = normalized.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];

    // Gõ sai vài ký tự trong một từ.
    if (levenshtein(token, word, tolerance) <= tolerance) return 62;

    // Gõ thiếu/thừa vài ký tự ở phần đầu của một từ dài.
    if (word.length > token.length) {
      const head = word.slice(0, token.length + tolerance);
      if (levenshtein(token, head, tolerance) <= tolerance) return 54;
    }

    // Quên khoảng trắng giữa hai từ: "cauhinh" ~ "cau hinh".
    const next = words[i + 1];
    if (next) {
      const joined = word + next;
      if (Math.abs(joined.length - token.length) <= tolerance && levenshtein(token, joined, tolerance) <= tolerance) {
        return 48;
      }
    }
  }

  return 0;
}

/**
 * Chấm điểm 1 truy vấn với nhiều trường dữ liệu có trọng số.
 * Mọi token đều phải khớp ở mức nào đó thì record mới được nhận.
 */
export function scoreRecord(tokens: string[], fields: FieldMatch[]) {
  if (!tokens.length) return 1;

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of fields) {
      const score = scoreToken(token, field.text);
      if (score > 0) best = Math.max(best, score * field.weight);
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export type HighlightPart = { text: string; hit: boolean };

/** Cắt chuỗi gốc thành các đoạn để tô sáng phần khớp từ khóa. */
export function highlightParts(value: string, tokens: string[]): HighlightPart[] {
  if (!value) return [];
  if (!tokens.length) return [{ text: value, hit: false }];

  const chars = Array.from(value);
  const folded = chars.map(foldChar).join('');
  const flags = new Array<boolean>(chars.length).fill(false);

  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const index = folded.indexOf(token, from);
      if (index === -1) break;
      for (let i = index; i < index + token.length; i += 1) flags[i] = true;
      from = index + token.length;
    }
  }

  const parts: HighlightPart[] = [];
  let buffer = '';
  let currentHit = flags[0];
  for (let i = 0; i < chars.length; i += 1) {
    if (flags[i] === currentHit) {
      buffer += chars[i];
    } else {
      parts.push({ text: buffer, hit: currentHit });
      buffer = chars[i];
      currentHit = flags[i];
    }
  }
  if (buffer) parts.push({ text: buffer, hit: currentHit });
  return parts;
}
