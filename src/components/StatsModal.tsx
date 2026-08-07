import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Download, Eye, RotateCcw, X } from 'lucide-react';
import { resetUsage, useUsage, type UsageEntry } from '../lib/stats';
import { useToast } from '../lib/toast';

type SortKey = 'copies' | 'views' | 'lastAt' | 'label';

const COLUMNS: Array<{ key: SortKey; label: string; className: string }> = [
  { key: 'label', label: 'Mã Config / Vấn đề', className: 'stat-label' },
  { key: 'views', label: 'Lượt xem', className: 'stat-num' },
  { key: 'copies', label: 'Lượt chép', className: 'stat-num' },
  { key: 'lastAt', label: 'Gần nhất', className: 'stat-time' },
];

function formatTime(value: number) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function StatsModal({ onClose }: { onClose: () => void }) {
  const entries = useUsage();
  const notify = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('copies');
  const [descending, setDescending] = useState(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Khi popup mở thì khoá cuộn của nền, chỉ cuộn được bên trong popup.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  const totals = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => ({ views: sum.views + entry.views, copies: sum.copies + entry.copies }),
        { views: 0, copies: 0 },
      ),
    [entries],
  );

  const sorted = useMemo(() => {
    const direction = descending ? -1 : 1;
    return [...entries].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label, 'vi') * direction;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * direction || b.copies - a.copies;
    });
  }, [entries, sortKey, descending]);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key !== 'label');
    }
  };

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Loại', 'Mã Config / Vấn đề', 'Lượt xem', 'Lượt chép', 'Gần nhất'];
    const rows = sorted.map((entry: UsageEntry) => [
      entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý',
      entry.label,
      String(entry.views),
      String(entry.copies),
      formatTime(entry.lastAt),
    ]);
    const content = `\uFEFF${[header, ...rows].map((row) => row.map(escape).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ASC-THONGKE-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify({ kind: 'success', title: 'Đã xuất file thống kê' });
  };

  const clearAll = () => {
    resetUsage();
    notify({ kind: 'info', title: 'Đã xóa toàn bộ số liệu thống kê' });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal stats-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div className="detail-title">
            <h2>Thống kê sử dụng</h2>
            <p className="detail-sub">
              {entries.length} bản ghi đã tra cứu · {totals.views} lượt xem · {totals.copies} lượt chép
            </p>
          </div>
          <div className="detail-actions">
            <button type="button" className="copy-button" onClick={exportCsv} disabled={!entries.length}>
              <Download size={14} />
              Xuất CSV
            </button>
            <button type="button" className="copy-button danger" onClick={clearAll} disabled={!entries.length}>
              <RotateCcw size={14} />
              Xóa
            </button>
            <button className="close-button" onClick={onClose} aria-label="Đóng thống kê">
              <X size={19} />
            </button>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="empty-state">
            <Eye size={28} />
            <h3>Chưa có số liệu</h3>
            <p>Mở chi tiết một bản ghi hoặc bấm vào Mã Config để sao chép, số liệu sẽ được ghi nhận tại đây.</p>
          </div>
        ) : (
          <div className="grid-wrap stats-wrap">
            <table className="data-grid stats-grid">
              <thead>
                <tr>
                  <th className="stat-rank">#</th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`${column.className} sortable${sortKey === column.key ? ' active' : ''}`}
                      onClick={() => changeSort(column.key)}
                    >
                      <span>
                        {column.label}
                        {sortKey === column.key && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, index) => (
                  <tr key={entry.key}>
                    <td className="stat-rank">{index + 1}</td>
                    <td className="stat-label">
                      <span className={`tag-loai ${entry.kind}`}>{entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý'}</span>
                      <span className={entry.kind === 'config' ? 'stat-code' : ''}>{entry.label}</span>
                    </td>
                    <td className="stat-num">
                      <Eye size={13} /> {entry.views}
                    </td>
                    <td className="stat-num accent">
                      <Copy size={13} /> {entry.copies}
                    </td>
                    <td className="stat-time">{formatTime(entry.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="stats-foot">Số liệu lưu trên trình duyệt của máy này, không đồng bộ giữa các người dùng.</footer>
      </section>
    </div>
  );
}
