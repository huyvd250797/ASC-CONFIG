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
      // Gõ tắt phần đầu của cụm ghép: "tracng" ~ "trac nghiem".
      if (token.length >= 4 && joined.length > token.length) {
        const head = joined.slice(0, token.length + tolerance);
        if (levenshtein(token, head, tolerance) <= tolerance) return 44;
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

/* ------------------------------------------------------------------ *
 * Tìm nguyên cụm
 *
 * Khác với chế độ mặc định (mỗi từ khớp ở đâu cũng được), chế độ này coi cả ô nhập
 * là MỘT cụm liền: "tuyen sinh" chỉ khớp bản ghi có đúng cụm "tuyển sinh", còn bản ghi
 * chỉ có "tuyển" hoặc chỉ có "sinh" thì bị loại.
 * ------------------------------------------------------------------ */

/**
 * Ngưỡng sai lệch cho phép trên cả cụm.
 *
 * Cụm ngắn KHÔNG được phép sai: tiếng Việt có quá nhiều từ chỉ khác nhau một ký tự, chỉ cần
 * nới 1 đơn vị là "sinh tuyen" khớp nhầm "hinh tuyen". Cụm càng dài thì khả năng trùng nhầm
 * càng thấp nên mới nới dần.
 */
function phraseTolerance(phrase: string) {
  if (phrase.length <= 12) return 0;
  if (phrase.length <= 20) return 1;
  return 2;
}

/**
 * Khoảng cách nhỏ nhất giữa `pattern` và MỘT ĐOẠN BẤT KỲ của `text` (thuật toán Sellers).
 *
 * Khác Levenshtein thường ở chỗ ô đầu mỗi cột được đặt bằng 0, nghĩa là đoạn khớp được phép
 * bắt đầu ở giữa `text`. Ở đây chỉ cho phép bắt đầu tại ĐẦU MỘT TỪ, để cụm tìm kiếm không
 * khớp vào khúc giữa của một từ khác. Chi phí O(n×m) với hai hàng bộ nhớ.
 */
function bestSubstringDistance(pattern: string, text: string, max: number) {
  const m = pattern.length;
  if (!m) return 0;
  if (!text) return m;

  const BLOCKED = m + max + 5;
  let previous = new Array<number>(m + 1);
  let current = new Array<number>(m + 1);
  for (let i = 0; i <= m; i += 1) previous[i] = i;

  let best = m;
  for (let j = 1; j <= text.length; j += 1) {
    // Chỉ mở điểm bắt đầu mới khi vị trí j là đầu một từ.
    current[0] = text[j - 1] === ' ' ? 0 : BLOCKED;
    const char = text[j - 1];
    for (let i = 1; i <= m; i += 1) {
      const cost = pattern[i - 1] === char ? 0 : 1;
      current[i] = Math.min(current[i - 1] + 1, previous[i] + 1, previous[i - 1] + cost);
    }
    if (current[m] < best) best = current[m];
    if (best === 0) return 0;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return Math.min(best, max + 1);
}

/** Chuẩn hóa ô nhập thành một cụm để so khớp. */
export function toPhrase(query: string) {
  return normalizeText(query);
}

/**
 * Chấm điểm một cụm với nhiều trường có trọng số.
 * Trả về 0 nếu không trường nào chứa cụm đó (kể cả ở mức gần đúng).
 */
export function scorePhrase(phrase: string, fields: FieldMatch[]) {
  if (!phrase) return 1;

  const tolerance = phraseTolerance(phrase);
  const tight = phrase.replace(/\s+/g, '');
  let best = 0;

  for (const field of fields) {
    const text = field.text;
    if (!text) continue;

    let score = 0;
    const position = text.indexOf(phrase);
    if (position === 0) score = 160;
    else if (position > 0) score = text[position - 1] === ' ' ? 140 : 120;
    else {
      // Bỏ khoảng trắng hai bên để "tuyensinh" khớp "tuyển sinh" và ngược lại,
      // đồng thời bỏ qua khác biệt về số khoảng trắng giữa các từ.
      const tightText = text.replace(/\s+/g, '');
      if (tightText.includes(tight)) score = 100;
      else if (tolerance > 0) {
        if (bestSubstringDistance(phrase, text, tolerance) <= tolerance) score = 70;
        else if (bestSubstringDistance(tight, tightText, tolerance) <= tolerance) score = 60;
      }
    }

    if (score > 0) best = Math.max(best, score * field.weight);
  }
  return best;
}
