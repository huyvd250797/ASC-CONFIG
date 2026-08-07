import { useEffect, useState } from 'react';
import { Check, Copy, Eye, X } from 'lucide-react';
import { looksLikeScript, type AppRecord } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';
import { copyText } from '../lib/clipboard';
import { getUsageFor, trackCopy, trackView } from '../lib/stats';
import { useToast } from '../lib/toast';
import { KindTag } from './common';

type Props = {
  record: AppRecord;
  onClose: () => void;
};

function CopyButton({
  text,
  label = 'Chép',
  successTitle,
  onCopied,
}: {
  text: string;
  label?: string;
  successTitle: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const notify = useToast();

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
        const ok = await copyText(text);
        setCopied(ok);
        if (ok) {
          onCopied?.();
          notify({ kind: 'success', title: successTitle });
        } else {
          notify({ kind: 'error', title: 'Không sao chép được', detail: 'Trình duyệt đang chặn quyền clipboard.' });
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
        {asCode && <CopyButton text={text} label="Chép script" successTitle={`Đã sao chép ${label.toLowerCase()}`} />}
      </header>
      {asCode ? <pre className="script-block">{text}</pre> : <p className="multiline">{text}</p>}
    </section>
  );
}

export function DetailModal({ record, onClose }: Props) {
  const hue = record.kind === 'config' ? toneFor('phanHe', record.phanHe) : toneFor('module', record.module);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Mỗi lần mở chi tiết một bản ghi là một lượt xem.
  useEffect(() => {
    trackView(record);
  }, [record]);

  // Khi popup mở thì khoá cuộn của nền, chỉ cuộn được bên trong popup.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  const title = record.kind === 'config' ? record.maConfig : record.vanDe;
  const subtitle = record.kind === 'config' ? record.manHinh : record.module;
  const usage = getUsageFor(record.key);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="detail-modal"
        style={toneVars(hue)}
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
              {usage && (usage.views > 0 || usage.copies > 0) && (
                <span className="chip-plain usage-chip" title="Số lần bạn đã xem / sao chép bản ghi này">
                  <Eye size={12} /> {usage.views} · <Copy size={12} /> {usage.copies}
                </span>
              )}
            </div>
            <h2 className={record.kind === 'config' ? 'ma-config' : 'van-de'}>{title || 'Chi tiết bản ghi'}</h2>
            {subtitle && subtitle !== title && <p className="detail-sub">{subtitle}</p>}
          </div>
          <div className="detail-actions">
            {title && (
              <CopyButton
                text={title}
                label={record.kind === 'config' ? 'Chép mã' : 'Chép'}
                successTitle={record.kind === 'config' ? 'Đã sao chép mã config' : 'Đã sao chép'}
                onCopied={() => trackCopy(record)}
              />
            )}
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
                    <CopyButton text={record.value} successTitle="Đã sao chép Value" />
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
