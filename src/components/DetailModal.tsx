import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { DataRow } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';

type Props = {
  row: DataRow;
  onClose: () => void;
};

export function DetailModal({ row, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const tone = toneFor(row.phanHe);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(row.value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const entries = Object.entries(row.raw).filter(([, value]) => value);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="detail-modal"
        style={toneVars(tone)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <div className="detail-tags">
              <span className={`tag-nhan ${row.sheetId}`}>{row.sheetLabel}</span>
              <span className="chip-phanhe">{row.phanHe}</span>
              {row.module && <span className="chip-plain">{row.module}</span>}
            </div>
            <h2 className="ma-config">{row.maConfig || row.manHinh || 'Chi tiết bản ghi'}</h2>
            {row.maConfig && row.manHinh && <p className="detail-sub">{row.manHinh}</p>}
          </div>
          <button onClick={onClose} aria-label="Đóng chi tiết">
            <X size={20} />
          </button>
        </header>

        {row.value && (
          <div className="detail-value">
            <span>Value</span>
            <code>{row.value}</code>
            <button type="button" onClick={copyValue}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Đã chép' : 'Chép'}
            </button>
          </div>
        )}

        <div className="detail-body">
          {entries.map(([key, value]) => (
            <div className="detail-row" key={key}>
              <span>{key}</span>
              <p>{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
