import { looksLikeScript, type NoteRecord } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';
import { Highlight } from './Highlight';
import { EmptyCell, GridHead, type GridColumn, type SortState } from './common';

const COLUMNS: GridColumn[] = [
  { key: 'stt', label: 'STT', className: 'col-stt' },
  { key: 'module', label: 'Module', className: 'col-module' },
  { key: 'vanDe', label: 'Vấn đề / Màn hình', className: 'col-vande' },
  { key: null, label: 'Chi tiết', className: 'col-chitiet' },
  { key: null, label: 'Hướng xử lý', className: 'col-xuly' },
];

type Props = {
  records: NoteRecord[];
  tokens: string[];
  sort: SortState;
  onSort: (key: string) => void;
  onSelect: (record: NoteRecord) => void;
};

export function NoteGrid({ records, tokens, sort, onSort, onSelect }: Props) {
  return (
    <div className="grid-wrap">
      <table className="data-grid note-grid">
        <GridHead columns={COLUMNS} sort={sort} onSort={onSort} />
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              style={toneVars(toneFor('module', record.module))}
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
              <td className="col-module">
                {record.module ? (
                  <span className="chip-tone">
                    <Highlight text={record.module} tokens={tokens} />
                  </span>
                ) : (
                  <EmptyCell />
                )}
              </td>
              <td className="col-vande">
                <span className="van-de">
                  <Highlight text={record.vanDe} tokens={tokens} />
                </span>
              </td>
              <td className="col-chitiet multiline">
                <Highlight text={record.chiTiet} tokens={tokens} clamp={240} />
              </td>
              <td className="col-xuly">
                {record.huongXuLy ? (
                  looksLikeScript(record.huongXuLy) ? (
                    <pre className="script-cell">
                      <Highlight text={record.huongXuLy} tokens={tokens} clamp={320} />
                    </pre>
                  ) : (
                    <span className="multiline">
                      <Highlight text={record.huongXuLy} tokens={tokens} clamp={320} />
                    </span>
                  )
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
