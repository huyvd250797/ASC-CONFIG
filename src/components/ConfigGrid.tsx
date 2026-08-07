import { Copy } from 'lucide-react';
import type { ConfigRecord } from '../lib/sheets';
import { copyText } from '../lib/clipboard';
import { trackCopy } from '../lib/stats';
import { useToast } from '../lib/toast';
import { toneFor, toneVars } from '../lib/colors';
import { Highlight } from './Highlight';
import { EmptyCell, GridHead, type GridColumn, type SortState } from './common';

const COLUMNS: GridColumn[] = [
  { key: 'stt', label: 'STT', className: 'col-stt' },
  { key: 'phanHe', label: 'Phân hệ', className: 'col-phanhe' },
  { key: 'maConfig', label: 'Mã Config', className: 'col-ma' },
  { key: 'module', label: 'Module', className: 'col-module' },
  { key: 'manHinh', label: 'Màn hình / Chức năng', className: 'col-manhinh' },
  { key: null, label: 'Mô tả chức năng', className: 'col-mota' },
  { key: null, label: 'Value', className: 'col-value' },
];

type Props = {
  records: ConfigRecord[];
  tokens: string[];
  sort: SortState;
  onSort: (key: string) => void;
  onSelect: (record: ConfigRecord) => void;
};

export function ConfigGrid({ records, tokens, sort, onSort, onSelect }: Props) {
  const notify = useToast();

  // Bấm thẳng vào Mã Config là sao chép ngay, không cần mở chi tiết.
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
    <div className="grid-wrap">
      <table className="data-grid config-grid">
        <GridHead columns={COLUMNS} sort={sort} onSort={onSort} />
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              style={toneVars(toneFor('phanHe', record.phanHe))}
              tabIndex={0}
              onClick={() => onSelect(record)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(record);
                }
              }}
            >
              <td className="col-stt">{record.stt}</td>
              <td className="col-phanhe">
                {record.phanHe ? (
                  <span className="chip-tone">
                    <Highlight text={record.phanHe} tokens={tokens} />
                  </span>
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td className="col-ma">
                {record.maConfig ? (
                  <button
                    type="button"
                    className="ma-config copyable"
                    onClick={(event) => void copyCode(event, record)}
                    title={`Bấm để sao chép: ${record.maConfig}`}
                  >
                    <Highlight text={record.maConfig} tokens={tokens} />
                    <Copy size={12} className="copy-hint" />
                  </button>
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td className="col-module">
                <Highlight text={record.module} tokens={tokens} />
              </td>
              <td className="col-manhinh">
                <Highlight text={record.manHinh} tokens={tokens} />
              </td>
              <td className="col-mota multiline">
                <Highlight text={record.moTa} tokens={tokens} clamp={260} />
              </td>
              <td className="col-value">
                {record.value ? (
                  <code className="value-cell">
                    <Highlight text={record.value} tokens={tokens} clamp={140} />
                  </code>
                ) : (
                  <EmptyCell />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
