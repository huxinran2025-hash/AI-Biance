import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface VirtualListProps<T> {
  rows: T[];
  rowHeight: number;
  overscan?: number;
  renderRow: (row: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
}

export function VirtualList<T>({ rows, rowHeight, overscan = 4, renderRow, empty }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const updateViewport = useCallback(() => {
    const height = containerRef.current?.clientHeight ?? 0;
    setViewportHeight(height);
  }, []);

  useEffect(() => {
    updateViewport();
  }, [updateViewport, rows.length]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateViewport]);

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);
  const offsetY = startIndex * rowHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  if (rows.length === 0 && empty) {
    return <div className="virtual-list" style={{ height: '100%' }}>{empty}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="virtual-list"
      style={{ position: 'relative', overflowY: 'auto', height: '100%' }}
      onScroll={handleScroll}
    >
      <div style={{ position: 'relative', height: totalHeight }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${offsetY}px)` }}>
          {visibleRows.map((row, index) => renderRow(row, startIndex + index))}
        </div>
      </div>
    </div>
  );
}

export default VirtualList;

