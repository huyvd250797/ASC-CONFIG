import type { CSSProperties } from 'react';

/**
 * Cấp phát màu theo tên (Phân hệ ở sheet CONFIG, Module ở sheet Lưu ý).
 *
 * Chỉ cấp phát HUE, còn độ bão hòa và độ sáng do CSS quyết định theo theme đang dùng.
 * Nhờ vậy cùng một phân hệ giữ đúng sắc màu khi chuyển giữa nền tối và nền sáng,
 * mà vẫn luôn đủ tương phản với nền.
 *
 * Hue cấp theo thứ tự xuất hiện lần đầu trong Sheet nên:
 * - Hai giá trị khác nhau chắc chắn khác màu (tới 16 giá trị mỗi nhóm).
 * - Một giá trị luôn giữ nguyên màu trong suốt phiên làm việc.
 */

/** Các hue được chọn sao cho hai màu liền kề vẫn phân biệt được. */
const HUES = [205, 152, 33, 268, 340, 189, 58, 14, 105, 232, 312, 170, 82, 248, 358, 128];

/** Hue trung tính cho giá trị rỗng. */
const NEUTRAL_HUE = 215;

/* ------------------------------------------------------------------ *
 * Chọn độ sáng theo từng hue
 *
 * Cùng một độ sáng HSL nhưng mắt người thấy vàng sáng hơn xanh dương rất nhiều,
 * nên nếu để chung một con số thì chip màu vàng/xanh lá sẽ chìm trên nền trắng.
 * Vì vậy mỗi hue được dò riêng độ sáng nhỏ nhất/lớn nhất còn đạt ngưỡng tương phản
 * WCAG AA, tính sẵn cho cả hai theme.
 * ------------------------------------------------------------------ */

/** Nền tham chiếu để tính tương phản: panel của từng theme. */
const BACKDROP = { dark: [15, 26, 44], light: [255, 255, 255] } as const;
const TARGET_RATIO = 4.8;

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]: number[]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number[], b: number[]) {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * Dò độ sáng đạt ngưỡng tương phản.
 * Nền tối: tăng dần cho sáng hơn. Nền sáng: giảm dần cho tối hơn.
 */
function pickLightness(hue: number, saturation: number, theme: 'dark' | 'light', from: number) {
  const backdrop = [...BACKDROP[theme]];
  const step = theme === 'dark' ? 2 : -2;
  const limit = theme === 'dark' ? 92 : 12;

  let lightness = from;
  for (let i = 0; i < 60; i += 1) {
    if (contrast(hslToRgb(hue, saturation, lightness), backdrop) >= TARGET_RATIO) break;
    const next = lightness + step;
    if (theme === 'dark' ? next > limit : next < limit) break;
    lightness = next;
  }
  return Math.round(lightness);
}

type ToneLightness = { fgDark: number; strongDark: number; fgLight: number; strongLight: number };

const lightnessCache = new Map<number, ToneLightness>();

function lightnessFor(hue: number): ToneLightness {
  const cached = lightnessCache.get(hue);
  if (cached) return cached;
  const value: ToneLightness = {
    fgDark: pickLightness(hue, 82, 'dark', 76),
    strongDark: pickLightness(hue, 95, 'dark', 70),
    fgLight: pickLightness(hue, 68, 'light', 42),
    strongLight: pickLightness(hue, 82, 'light', 42),
  };
  lightnessCache.set(hue, value);
  return value;
}

/** Nhóm màu độc lập: phân hệ và module không dùng chung dải màu. */
export type ToneScope = 'phanHe' | 'module';

const registry = new Map<string, number>();
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
    registry.set(key, hue);
  }
}

/** Lấy hue của một giá trị. */
export function toneFor(scope: ToneScope, name: string): number {
  const key = makeKey(scope, name);
  if (!key) return NEUTRAL_HUE;
  const existing = registry.get(key);
  if (existing !== undefined) return existing;
  registerTones(scope, [name]);
  return registry.get(key) ?? NEUTRAL_HUE;
}

/**
 * Gắn hue và độ sáng đã tính sẵn cho cả hai theme vào element.
 * Stylesheet chọn cặp phù hợp theo `data-theme`, nên đổi theme không cần render lại JS.
 */
export function toneVars(hue: number) {
  const l = lightnessFor(hue);
  return {
    '--tone-hue': String(hue),
    '--tone-lfd': `${l.fgDark}%`,
    '--tone-lsd': `${l.strongDark}%`,
    '--tone-lfl': `${l.fgLight}%`,
    '--tone-lsl': `${l.strongLight}%`,
  } as CSSProperties;
}
