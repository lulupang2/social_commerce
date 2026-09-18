'use client';

import { Compass, Droplets, Wind } from 'lucide-react';
import React, { useState } from 'react';

import { SURF_BREAK_BRIEFINGS } from '@/lib/data/vertical-data';

const QUALITY_COLOR: Record<'좋음' | '보통' | '주의', string> = {
  좋음: '#0284c7',
  보통: '#f97316',
  주의: '#94a3b8',
};

export function WaveBriefing() {
  const [selectedId, setSelectedId] = useState(SURF_BREAK_BRIEFINGS[0].id);
  const briefing =
    SURF_BREAK_BRIEFINGS.find((item) => item.id === selectedId) ?? SURF_BREAK_BRIEFINGS[0];
  const maxHeight = Math.max(...briefing.forecast.map((point) => point.heightM), 1);
  const points = briefing.forecast.map((point, index) => ({
    ...point,
    x: 18 + index * (284 / (briefing.forecast.length - 1)),
    y: 92 - (point.heightM / maxHeight) * 66,
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? 302} 100 L ${points[0]?.x ?? 18} 100 Z`;

  return (
    <section className="vertical-panel wave-panel">
      <div className="vertical-intro">
        <div>
          <span className="vertical-eyebrow">SURF WINDOW · 8/24</span>
          <h2>오늘 어느 피크가 열릴까?</h2>
        </div>
        <span className="demo-data-chip">데모 예보</span>
      </div>
      <p className="vertical-description">
        장비를 챙기기 전에 파고, 주기, 바람을 한 화면에서 비교해요.
      </p>

      <div className="break-selector" role="tablist" aria-label="서핑 스팟">
        {SURF_BREAK_BRIEFINGS.map((item) => (
          <button
            aria-selected={item.id === briefing.id}
            className={item.id === briefing.id ? 'active' : ''}
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            role="tab"
            type="button"
          >
            <strong>{item.name}</strong>
            <span>{item.region}</span>
          </button>
        ))}
      </div>

      <article className="wave-card">
        <div className="wave-card-heading">
          <div>
            <span>지금 파고</span>
            <strong>
              {briefing.nowHeightM.toFixed(1)}
              <small>m</small>
            </strong>
          </div>
          <p>
            <b>{briefing.bestWindow}</b> 추천
            <br />
            {briefing.periodSeconds}초 주기 · {briefing.tide}
          </p>
        </div>

        <div className="wave-chart">
          <svg aria-label={`${briefing.name} 시간대별 파고 차트`} role="img" viewBox="0 0 320 120">
            <defs>
              <linearGradient id="wave-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#38bdf8" stopOpacity="0.38" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#wave-area)" />
            <path
              d={linePath}
              fill="none"
              stroke="#0284c7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {points.map((point) => (
              <g key={point.time}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill={QUALITY_COLOR[point.quality]}
                  r="4"
                  stroke="#fff"
                  strokeWidth="2"
                />
                <text className="wave-value" textAnchor="middle" x={point.x} y={point.y - 9}>
                  {point.heightM.toFixed(1)}
                </text>
                <text className="wave-time" textAnchor="middle" x={point.x} y="116">
                  {point.time}시
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="condition-strip">
          <span>
            <Wind size={16} />
            <b>바람</b>
            {briefing.wind}
          </span>
          <span>
            <Droplets size={16} />
            <b>수온</b>
            {briefing.waterTemperatureC}℃
          </span>
          <span>
            <Compass size={16} />
            <b>추천</b>
            {briefing.bestWindow}
          </span>
        </div>
        <p className="wave-note">{briefing.note}</p>
      </article>

      <p className="data-disclaimer">
        입수 전 기상청·해양 관측과 현장 안전요원의 안내를 다시 확인하세요.
      </p>
    </section>
  );
}
