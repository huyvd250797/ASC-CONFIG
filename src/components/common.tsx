import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { RecordKind } from '../lib/sheets';

export type SortDirection = 'asc' | 'desc';
export type SortState = { key: string; direction: SortDirection };

export type GridColumn = {
  /** null = cột không cho sắp xếp */
  key: string | null;
  label: string;
  className: string;
};

/** Badge cột "Loại": phân biệt bản ghi CONFIG và LƯU Ý. */
export function KindTag({ kind, label }: { kind: RecordKind; label: string }) {
  return <span className={`tag-loai ${kind}`}>{label}</span>;
}

export function GridHead({
  columns,
  sort,
  onSort,
}: {
  columns: GridColumn[];
  sort: SortState;
  onSort: (key: string) => void;
}) {
  return (
    <thead>
      <tr>
        {columns.map((column) => {
          const sortable = column.key !== null;
          const active = sortable && sort.key === column.key;
          return (
            <th
              key={column.label}
              className={`${column.className}${sortable ? ' sortable' : ''}${active ? ' active' : ''}`}
              onClick={sortable ? () => onSort(column.key as string) : undefined}
              aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              <span>
                {column.label}
                {sortable &&
                  (active ? (
                    sort.direction === 'asc' ? (
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
  );
}

export function EmptyCell() {
  return <span className="muted-cell">—</span>;
}
