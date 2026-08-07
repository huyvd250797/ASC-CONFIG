import { ChevronRight } from 'lucide-react';
import type { DataRow } from '../lib/sheets';
import { toneFor, toneVars } from '../lib/colors';
import { Highlight } from './Highlight';

type Props = {
  rows: DataRow[];
  tokens: string[];
  startIndex: number;
  onSelect: (row: DataRow) => void;
};

export function CardList({ rows, tokens, startIndex, onSelect }: Props) {
  return (
    <div className="card-list">
      {rows.map((row, index) => {
        const tone = toneFor(row.phanHe);
        return (
          <article key={row.id} className="record-card" style={toneVars(tone)} onClick={() => onSelect(row)}>
            <header>
              <span className="card-stt">#{startIndex + index + 1}</span>
              <span className={`tag-nhan ${row.sheetId}`}>{row.sheetLabel}</span>
              <span className="chip-phanhe">
                <Highlight text={row.phanHe} tokens={tokens} />
              </span>
            </header>
            <h3 className="ma-config">
              <Highlight text={row.maConfig || row.manHinh} tokens={tokens} />
            </h3>
            <dl>
              <div>
                <dt>Module</dt>
                <dd>
                  <Highlight text={row.module} tokens={tokens} />
                </dd>
              </div>
              <div>
                <dt>Màn hình/Chức năng</dt>
                <dd>
                  <Highlight text={row.manHinh} tokens={tokens} />
                </dd>
              </div>
            </dl>
            {row.moTa && (
              <p>
                <Highlight text={row.moTa} tokens={tokens} clamp={240} />
              </p>
            )}
            {row.value && (
              <code className="value-cell">
                <Highlight text={row.value} tokens={tokens} clamp={160} />
              </code>
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
