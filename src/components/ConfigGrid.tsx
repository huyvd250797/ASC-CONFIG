import type { ConfigRecord } from '../lib/sheets';
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
                <span className="ma-config">
                  <Highlight text={record.maConfig} tokens={tokens} />
                </span>
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
