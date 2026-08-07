import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { looksLikeScript, type AppRecord } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';
import { KindTag } from './common';

type Props = {
  record: AppRecord;
  onClose: () => void;
};

function CopyButton({ text, label = 'Chép' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className="copy-button"
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Đã chép' : label}
    </button>
  );
}

/** Một khối nội dung trong popup; tự chuyển sang kiểu code khi phát hiện script. */
function Block({ label, text, code }: { label: string; text: string; code?: boolean }) {
  if (!text) return null;
  const asCode = code ?? looksLikeScript(text);
  return (
    <section className="detail-block">
      <header>
        <span>{label}</span>
        {asCode && <CopyButton text={text} label="Chép script" />}
      </header>
      {asCode ? <pre className="script-block">{text}</pre> : <p className="multiline">{text}</p>}
    </section>
  );
}

export function DetailModal({ record, onClose }: Props) {
  const tone = record.kind === 'config' ? toneFor('phanHe', record.phanHe) : toneFor('module', record.module);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const title = record.kind === 'config' ? record.maConfig : record.vanDe;
  const subtitle = record.kind === 'config' ? record.manHinh : record.module;

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
          <div className="detail-title">
            <div className="detail-tags">
              <KindTag kind={record.kind} label={record.kindLabel} />
              {record.kind === 'config' ? (
                <>
                  {record.phanHe && <span className="chip-tone">{record.phanHe}</span>}
                  {record.module && <span className="chip-plain">{record.module}</span>}
                </>
              ) : (
                record.module && <span className="chip-tone">{record.module}</span>
              )}
              <span className="chip-plain">STT {record.stt}</span>
            </div>
            <h2 className={record.kind === 'config' ? 'ma-config' : 'van-de'}>{title || 'Chi tiết bản ghi'}</h2>
            {subtitle && subtitle !== title && <p className="detail-sub">{subtitle}</p>}
          </div>
          <div className="detail-actions">
            {title && <CopyButton text={title} label={record.kind === 'config' ? 'Chép mã' : 'Chép'} />}
            <button className="close-button" onClick={onClose} aria-label="Đóng chi tiết">
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="detail-body">
          {record.kind === 'config' ? (
            <>
              {record.value && (
                <section className="detail-block value-block">
                  <header>
                    <span>Value</span>
                    <CopyButton text={record.value} />
                  </header>
                  <pre className="value-block-content">{record.value}</pre>
                </section>
              )}
              <Block label="Mô tả chức năng" text={record.moTa} code={false} />
              <Block label="Màn hình / Chức năng" text={record.manHinh} code={false} />
            </>
          ) : (
            <>
              <Block label="Chi tiết" text={record.chiTiet} code={false} />
              <Block label="Hướng xử lý" text={record.huongXuLy} />
            </>
          )}

          <details className="raw-panel">
            <summary>Toàn bộ cột từ Google Sheet</summary>
            {Object.entries(record.raw)
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div className="detail-row" key={key}>
                  <span>{key}</span>
                  <p className="multiline">{value}</p>
                </div>
              ))}
          </details>
        </div>
      </section>
    </div>
  );
}
