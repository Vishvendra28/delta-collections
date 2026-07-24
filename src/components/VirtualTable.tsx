import React, { useRef, useState, useCallback, useLayoutEffect } from 'react';

const ROW_H = 44;   // px per row — must match actual rendered row height
const OVERSCAN = 8; // extra rows to render above and below viewport

interface Props<T> {
  rows: T[];
  headers: React.ReactNode;
  renderRow: (row: T, index: number) => React.ReactNode;
  style?: React.CSSProperties;
  emptyMessage?: string;
}

export function VirtualTable<T>({ rows, headers, renderRow, style, emptyMessage }: Props<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [clientH, setClientH] = useState(500);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setClientH(el.clientHeight);
    const ro = new ResizeObserver(() => setClientH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx   = Math.min(rows.length, startIdx + Math.ceil(clientH / ROW_H) + OVERSCAN * 2);
  const padTop   = startIdx * ROW_H;
  const padBot   = Math.max(0, (rows.length - endIdx) * ROW_H);

  return (
    <div ref={ref} style={{ overflowY: 'auto', overflowX: 'auto', ...style }} onScroll={onScroll}>
      <table>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)' }}>
          {headers}
        </thead>
        <tbody>
          {padTop > 0 && <tr style={{ height: padTop }} aria-hidden><td /></tr>}
          {rows.length === 0
            ? <tr><td colSpan={99} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>{emptyMessage ?? 'No results'}</td></tr>
            : rows.slice(startIdx, endIdx).map((row, i) => renderRow(row, startIdx + i))
          }
          {padBot > 0 && <tr style={{ height: padBot }} aria-hidden><td /></tr>}
        </tbody>
      </table>
    </div>
  );
}
