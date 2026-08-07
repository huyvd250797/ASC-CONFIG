import type { CSSProperties } from 'react';

/**
 * Cấp phát màu cho từng Phân hệ.
 *
 * Màu được cấp theo thứ tự phân hệ xuất hiện lần đầu trong Google Sheet, nên:
 * - Hai phân hệ khác nhau chắc chắn khác màu (khi số phân hệ <= số màu trong bảng).
 * - Cùng một phân hệ luôn giữ nguyên màu trong suốt phiên làm việc.
 */

export type Tone = {
  /** Màu chữ của chip phân hệ */
  fg: string;
  /** Nền chip phân hệ */
  bg: string;
  /** Viền chip phân hệ */
  line: string;
  /** Màu đậm & nổi hơn, dùng riêng cho Mã Config */
  strong: string;
};

/** Các hue được chọn sao cho hai màu liền kề vẫn phân biệt được trên nền tối. */
const HUES = [205, 152, 33, 268, 340, 189, 58, 14, 105, 232, 312, 170, 82, 248, 358, 128];

function toneFromHue(hue: number): Tone {
  return {
    fg: `hsl(${hue} 82% 76%)`,
    bg: `hsl(${hue} 70% 55% / 0.15)`,
    line: `hsl(${hue} 72% 60% / 0.45)`,
    strong: `hsl(${hue} 95% 70%)`,
  };
}

const NEUTRAL: Tone = {
  fg: '#a9b6cb',
  bg: 'rgba(148, 163, 184, 0.12)',
  line: 'rgba(148, 163, 184, 0.3)',
  strong: '#c6d3e6',
};

const registry = new Map<string, Tone>();

function normalizeKey(key: string) {
  return (key || '').trim().toLowerCase();
}

/**
 * Đăng ký danh sách phân hệ theo đúng thứ tự trong Sheet.
 * Gọi lại sau mỗi lần dữ liệu thay đổi; phân hệ mới sẽ được cấp màu kế tiếp.
 */
export function registerTones(names: Iterable<string>) {
  for (const name of names) {
    const key = normalizeKey(name);
    if (!key || registry.has(key)) continue;
    const index = registry.size;
    // Hết bảng hue thì quay vòng nhưng lệch nửa bước để không trùng hệt màu cũ.
    const hue = index < HUES.length ? HUES[index] : (HUES[index % HUES.length] + 6) % 360;
    registry.set(key, toneFromHue(hue));
  }
}

/** Lấy tone màu của một phân hệ. */
export function toneFor(key: string): Tone {
  const normalized = normalizeKey(key);
  if (!normalized) return NEUTRAL;
  const existing = registry.get(normalized);
  if (existing) return existing;
  registerTones([key]);
  return registry.get(normalized) || NEUTRAL;
}

/** Biến tone thành CSS custom properties để gắn vào style của element. */
export function toneVars(tone: Tone) {
  return {
    '--tone-fg': tone.fg,
    '--tone-bg': tone.bg,
    '--tone-line': tone.line,
    '--tone-strong': tone.strong,
  } as CSSProperties;
}
