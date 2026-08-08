import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { normalizeText, scoreRecord, tokenize } from '../lib/text';

/**
 * Ô chọn có kèm tìm kiếm: gõ vài ký tự là lọc ngay danh sách, không phải cuộn tìm bằng mắt.
 *
 * Bảng gợi ý dùng `position: fixed` và tự tính tọa độ, vì `.app-shell` đặt `overflow: hidden`
 * để cố định bố cục — nếu định vị absolute theo cha thì bảng sẽ bị cắt mất.
 */

export const ALL_VALUE = '__all__';

type Props = {
  label: string;
  /** Nhãn của mục "tất cả" */
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
};

type Position = { top: number; left: number; width: number; maxHeight: number; drop: 'down' | 'up' };

const PANEL_GAP = 6;
const PANEL_MAX = 300;

export function SearchableSelect({ label, allLabel, value, options, onChange, disabled, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => [ALL_VALUE, ...options], [options]);

  // Chuẩn hóa sẵn (bỏ dấu, gom khoảng trắng) để so khớp; scoreRecord yêu cầu chuỗi đã bỏ dấu.
  const searchable = useMemo(
    () => options.map((item) => ({ item, text: normalizeText(item) })),
    [options],
  );

  const filtered = useMemo(() => {
    const tokens = tokenize(query);
    if (!tokens.length) return items;
    const scored: Array<{ item: string; score: number }> = [];
    for (const entry of searchable) {
      const score = scoreRecord(tokens, [{ text: entry.text, weight: 1 }]);
      if (score > 0) scored.push({ item: entry.item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  }, [items, searchable, query]);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - PANEL_GAP - 8;
    const above = rect.top - PANEL_GAP - 8;
    const drop: Position['drop'] = below < 180 && above > below ? 'up' : 'down';
    const maxHeight = Math.min(PANEL_MAX, drop === 'down' ? below : above);
    setPosition({
      top: drop === 'down' ? rect.bottom + PANEL_GAP : rect.top - PANEL_GAP - maxHeight,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.max(rect.width, 220),
      maxHeight,
      drop,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    inputRef.current?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.closest('.combo-panel')?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, place]);

  // Giữ mục đang chọn luôn nằm trong tầm nhìn khi di chuyển bằng bàn phím.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (item: string) => {
    onChange(item);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + filtered.length) % Math.max(filtered.length, 1);
      });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) commit(filtered[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const display = value === ALL_VALUE ? allLabel : value;

  return (
    <div className={`field combo ${disabled ? 'disabled' : ''}`} ref={rootRef}>
      <span>{label}</span>

      <div className="combo-box">
        <button
          ref={triggerRef}
          type="button"
          className={`combo-trigger ${open ? 'open' : ''} ${value !== ALL_VALUE ? 'chosen' : ''}`}
          disabled={disabled}
          onClick={() => {
            setOpen((current) => !current);
            setQuery('');
            setActive(0);
          }}
          title={hint || display}
        >
          <span className="combo-value">{display}</span>
          {value !== ALL_VALUE ? (
            <span
              className="combo-clear"
              role="button"
              tabIndex={-1}
              aria-label={`Bỏ lọc ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(ALL_VALUE);
              }}
            >
              <X size={13} />
            </span>
          ) : (
            <ChevronDown size={14} className="combo-caret" />
          )}
        </button>

        {open && position && (
          <div
            className={`combo-panel ${position.drop}`}
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            <div className="combo-search">
              <Search size={14} />
              <input
                ref={inputRef}
                value={query}
                placeholder={`Gõ để tìm ${label.toLowerCase()}...`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>

            <ul className="combo-list" ref={listRef} style={{ maxHeight: position.maxHeight - 46 }} role="listbox">
              {filtered.length === 0 && <li className="combo-empty">Không có kết quả phù hợp</li>}
              {filtered.map((item, index) => (
                <li
                  key={item}
                  role="option"
                  aria-selected={item === value}
                  className={`${index === active ? 'active' : ''} ${item === value ? 'selected' : ''} ${
                    item === ALL_VALUE ? 'all' : ''
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(item)}
                >
                  <span>{item === ALL_VALUE ? allLabel : item}</span>
                  {item === value && <Check size={14} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
