import type { CSSProperties } from 'react';

/**
 * Cấp phát màu theo tên (Phân hệ ở sheet CONFIG, Module ở sheet Lưu ý).
 *
 * Màu cấp theo thứ tự xuất hiện lần đầu trong Sheet nên:
 * - Hai giá trị khác nhau chắc chắn khác màu (tới 16 giá trị mỗi nhóm).
 * - Một giá trị luôn giữ nguyên màu trong suốt phiên làm việc.
 */

export type Tone = {
  /** Màu chữ của chip */
  fg: string;
  /** Nền chip */
  bg: string;
  /** Viền chip / viền trái của dòng */
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

/** Nhóm màu độc lập: phân hệ và module không dùng chung dải màu. */
export type ToneScope = 'phanHe' | 'module';

const registry = new Map<string, Tone>();
const counters: Record<ToneScope, number> = { phanHe: 0, module: 0 };

function makeKey(scope: ToneScope, name: string) {
  const clean = (name || '').trim().toLowerCase();
  return clean ? `${scope}:${clean}` : '';
}

/** Đăng ký danh sách giá trị theo đúng thứ tự trong Sheet. */
export function registerTones(scope: ToneScope, names: Iterable<string>) {
  for (const name of names) {
    const key = makeKey(scope, name);
    if (!key || registry.has(key)) continue;
    const index = counters[scope];
    counters[scope] = index + 1;
    // Hết bảng hue thì quay vòng nhưng lệch nửa bước để không trùng hệt màu cũ.
    const hue = index < HUES.length ? HUES[index] : (HUES[index % HUES.length] + 6) % 360;
    registry.set(key, toneFromHue(hue));
  }
}

export function toneFor(scope: ToneScope, name: string): Tone {
  const key = makeKey(scope, name);
  if (!key) return NEUTRAL;
  const existing = registry.get(key);
  if (existing) return existing;
  registerTones(scope, [name]);
  return registry.get(key) || NEUTRAL;
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
