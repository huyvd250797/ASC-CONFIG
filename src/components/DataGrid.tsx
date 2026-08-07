import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { DataRow } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';
import { Highlight } from './Highlight';

export type SortKey = 'stt' | 'sheetLabel' | 'phanHe' | 'maConfig' | 'module' | 'manHinh';
export type SortDirection = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey | null; label: string; className: string }> = [
  { key: 'stt', label: 'STT', className: 'col-stt' },
  { key: 'sheetLabel', label: 'Nhãn', className: 'col-nhan' },
  { key: 'phanHe', label: 'Phân hệ', className: 'col-phanhe' },
  { key: 'maConfig', label: 'Mã Config', className: 'col-ma' },
  { key: 'module', label: 'Module', className: 'col-module' },
  { key: 'manHinh', label: 'Màn hình/Chức năng', className: 'col-manhinh' },
  { key: null, label: 'Mô tả chức năng', className: 'col-mota' },
  { key: null, label: 'Value', className: 'col-value' },
];

type Props = {
  rows: DataRow[];
  tokens: string[];
  startIndex: number;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  onSelect: (row: DataRow) => void;
};

export function DataGrid({ rows, tokens, startIndex, sortKey, sortDirection, onSort, onSelect }: Props) {
  return (
    <div className="grid-wrap">
      <table className="data-grid">
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const sortable = column.key !== null;
              const active = sortable && sortKey === column.key;
              return (
                <th
                  key={column.label}
                  className={`${column.className}${sortable ? ' sortable' : ''}${active ? ' active' : ''}`}
                  onClick={sortable ? () => onSort(column.key as SortKey) : undefined}
                  aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span>
                    {column.label}
                    {sortable &&
                      (active ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ChevronsUpDown size={13} className="sort-idle" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tone = toneFor(row.phanHe);
            return (
              <tr
                key={row.id}
                style={toneVars(tone)}
                onClick={() => onSelect(row)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
              >
                <td className="col-stt">{startIndex + index + 1}</td>
                <td className="col-nhan">
                  <span className={`tag-nhan ${row.sheetId}`}>{row.sheetLabel}</span>
                </td>
                <td className="col-phanhe">
                  <span className="chip-phanhe">
                    <Highlight text={row.phanHe} tokens={tokens} />
                  </span>
                </td>
                <td className="col-ma">
                  <span className="ma-config">
                    <Highlight text={row.maConfig} tokens={tokens} />
                  </span>
                </td>
                <td className="col-module">
                  <Highlight text={row.module} tokens={tokens} />
                </td>
                <td className="col-manhinh">
                  <Highlight text={row.manHinh} tokens={tokens} />
                </td>
                <td className="col-mota">
                  <Highlight text={row.moTa} tokens={tokens} clamp={180} />
                </td>
                <td className="col-value">
                  {row.value ? (
                    <code className="value-cell">
                      <Highlight text={row.value} tokens={tokens} clamp={120} />
                    </code>
                  ) : (
                    <span className="muted-cell">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
