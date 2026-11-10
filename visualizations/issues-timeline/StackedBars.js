import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import { PRIORITIES, PRIORITY_COLORS } from './timeline';

const M = { top: 6, right: 8, bottom: 22, left: 34 };
const STACK_ORDER = [...PRIORITIES].reverse(); // LOW at the bottom, CRITICAL on top

const total = (b) => PRIORITIES.reduce((n, p) => n + b.counts[p], 0);

// 1/2/5 x 10^k step giving about `target` ticks.
function niceStep(max, target = 4) {
  const raw = Math.max(max, 1) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function fmtTime(ms, spanMs) {
  const d = new Date(ms);
  return spanMs > 36 * 3600 * 1000
    ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StackedBars({ buckets }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(size.w - M.left - M.right, 0);
  const innerH = Math.max(size.h - M.top - M.bottom, 0);
  const step = niceStep(Math.max(...buckets.map(total), 0));
  const yMax = Math.max(Math.ceil(Math.max(...buckets.map(total), 1) / step) * step, step);
  const y = (v) => M.top + innerH - (v / yMax) * innerH;
  const slot = buckets.length ? innerW / buckets.length : 0;
  const span = buckets.length ? buckets[buckets.length - 1].x1 - buckets[0].x0 : 0;
  const labelEvery = Math.max(Math.ceil(buckets.length / Math.max(Math.floor(innerW / 80), 1)), 1);
  const ticks = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);

  return (
    <div className="tl-wrap">
      <div className="tl-header">
        <div className="tl-legend">
          {PRIORITIES.map((p) => (
            <span key={p} className="tl-key">
              <i style={{ background: PRIORITY_COLORS[p] }} />
              {p[0] + p.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="tl-chart" ref={box}>
      {size.w > 0 && (
        <svg width={size.w} height={size.h}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.15" />
              <text x={M.left - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.7">{v}</text>
            </g>
          ))}
          {buckets.map((b, n) => {
            let acc = 0;
            const x = M.left + n * slot;
            return (
              <g key={b.x0}>
                {STACK_ORDER.map((p) => {
                  const h = (b.counts[p] / yMax) * innerH;
                  const top = y(acc + b.counts[p]);
                  acc += b.counts[p];
                  return h > 0 ? (
                    <rect
                      key={p}
                      x={x + slot * 0.1}
                      y={top}
                      width={Math.max(slot * 0.8, 1)}
                      height={h}
                      style={{ fill: PRIORITY_COLORS[p], fillOpacity: 1, opacity: 1 }}
                    />
                  ) : null;
                })}
                {n % labelEvery === 0 && (
                  <text x={x + slot / 2} y={size.h - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.7">
                    {fmtTime(b.x0, span)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      </div>
    </div>
  );
}

StackedBars.propTypes = {
  buckets: PropTypes.arrayOf(
    PropTypes.shape({ x0: PropTypes.number, x1: PropTypes.number, counts: PropTypes.object })
  ).isRequired,
};
