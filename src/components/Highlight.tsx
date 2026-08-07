import { Fragment, useMemo } from 'react';
import { highlightParts } from '../lib/text';

type Props = {
  text: string;
  tokens: string[];
  /** Rút gọn nội dung quá dài trong lưới */
  clamp?: number;
};

export function Highlight({ text, tokens, clamp }: Props) {
  const value = useMemo(() => {
    if (!clamp || text.length <= clamp) return text;
    return `${text.slice(0, clamp).trimEnd()}…`;
  }, [text, clamp]);

  const parts = useMemo(() => highlightParts(value, tokens), [value, tokens]);

  if (!value) return <span className="muted-cell">—</span>;

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
