import { ChevronRight, Copy } from 'lucide-react';
import { looksLikeScript, type AppRecord, type ConfigRecord } from '../lib/sheets';
import { copyText } from '../lib/clipboard';
import { trackCopy } from '../lib/stats';
import { useToast } from '../lib/toast';
import { toneFor, toneVars } from '../lib/colors';
import { Highlight } from './Highlight';

type Props = {
  records: AppRecord[];
  tokens: string[];
  onSelect: (record: AppRecord) => void;
};

export function CardList({ records, tokens, onSelect }: Props) {
  const notify = useToast();

  const copyCode = async (event: React.MouseEvent, record: ConfigRecord) => {
    event.stopPropagation();
    if (!record.maConfig) return;
    const ok = await copyText(record.maConfig);
    if (ok) {
      trackCopy(record);
      notify({ kind: 'success', title: 'Đã sao chép mã config', detail: record.maConfig });
    } else {
      notify({ kind: 'error', title: 'Không sao chép được', detail: 'Trình duyệt đang chặn quyền clipboard.' });
    }
  };

  return (
    <div className="card-list">
      {records.map((record) => {
        const tone =
          record.kind === 'config' ? toneFor('phanHe', record.phanHe) : toneFor('module', record.module);

        return (
          <article key={record.id} className="record-card" style={toneVars(tone)} onClick={() => onSelect(record)}>
            <header>
              <span className="card-stt">#{record.stt}</span>
              <span className="chip-tone">
                {record.kind === 'config' ? record.phanHe || '—' : record.module || '—'}
              </span>
            </header>

            {record.kind === 'config' ? (
              <>
                <h3>
                  <button
                    type="button"
                    className="ma-config copyable"
                    onClick={(event) => void copyCode(event, record)}
                    title={`Bấm để sao chép: ${record.maConfig}`}
                  >
                    <Highlight text={record.maConfig} tokens={tokens} />
                    <Copy size={12} className="copy-hint" />
                  </button>
                </h3>
                <dl>
                  <div>
                    <dt>Module</dt>
                    <dd>
                      <Highlight text={record.module} tokens={tokens} />
                    </dd>
                  </div>
                  <div>
                    <dt>Màn hình / Chức năng</dt>
                    <dd>
                      <Highlight text={record.manHinh} tokens={tokens} />
                    </dd>
                  </div>
                </dl>
                {record.moTa && (
                  <p className="multiline">
                    <Highlight text={record.moTa} tokens={tokens} clamp={260} />
                  </p>
                )}
                {record.value && (
                  <code className="value-cell">
                    <Highlight text={record.value} tokens={tokens} clamp={160} />
                  </code>
                )}
              </>
            ) : (
              <>
                <h3 className="van-de">
                  <Highlight text={record.vanDe} tokens={tokens} />
                </h3>
                {record.chiTiet && (
                  <p className="multiline">
                    <Highlight text={record.chiTiet} tokens={tokens} clamp={220} />
                  </p>
                )}
                {record.huongXuLy && (
                  <div className="card-xuly">
                    <span>Hướng xử lý</span>
                    {looksLikeScript(record.huongXuLy) ? (
                      <pre className="script-cell">
                        <Highlight text={record.huongXuLy} tokens={tokens} clamp={280} />
                      </pre>
                    ) : (
                      <p className="multiline">
                        <Highlight text={record.huongXuLy} tokens={tokens} clamp={280} />
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <button type="button">
              Xem chi tiết <ChevronRight size={15} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
