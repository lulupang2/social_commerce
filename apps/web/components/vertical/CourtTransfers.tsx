'use client';

import { useLocale } from 'next-intl';
import { formatWon } from '@/lib/display-format';
import { useTranslate } from '@/lib/i18n/use-translate';

import { CalendarDays, Clock3, MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

import { COURT_TRANSFERS } from '@/lib/data/vertical-data';
import { triggerNativeHaptic } from '@/lib/native-bridge';

const REGION_FILTERS = ['전체', '서울', '경기'] as const;

export function CourtTransfers() {
  const translate = useTranslate();
  const locale = useLocale();
  const [region, setRegion] = useState<(typeof REGION_FILTERS)[number]>('전체');
  const transfers = COURT_TRANSFERS.filter(
    (transfer) => region === '전체' || transfer.region.startsWith(region),
  );

  return (
    <section className="vertical-panel court-panel">
      <div className="vertical-intro">
        <div>
          <span className="vertical-eyebrow">COURT PASS · THIS WEEK</span>
          <h2>{translate("빈 코트, 필요한 크루에게")}</h2>
        </div>
        <span className="demo-data-chip">{translate("데모 슬롯")}</span>
      </div>
      <p className="vertical-description">
        {translate("사용하지 못하게 된 예약 시간을 확인하고 채팅으로 양도 조건을 맞춰요.")}</p>

      <div className="court-filter" role="group" aria-label={translate("코트 지역")}>
        {REGION_FILTERS.map((item) => (
          <button
            aria-pressed={region === item}
            className={region === item ? 'active' : ''}
            key={translate(item)}
            onClick={() => setRegion(item)}
            type="button"
          >
            {translate(item)}
          </button>
        ))}
      </div>

      <div className="court-transfer-list">
        {transfers.map((transfer) => (
          <article className="court-transfer-card" key={transfer.id}>
            <div className="court-date-tile">
              <strong>{translate(transfer.dateLabel.split(' · ')[0])}</strong>
              <span>{translate(transfer.dateLabel.split(' · ')[1])}</span>
            </div>
            <div className="court-transfer-copy">
              <div className="court-card-tags">
                <span>{translate(transfer.courtType)}</span>
                <span>{translate(transfer.surface)}</span>
              </div>
              <h3>{translate(transfer.venue)}</h3>
              <p>
                <MapPin size={13} />
                {translate(transfer.region)}
                <Clock3 size={13} />
                {transfer.time} · {transfer.durationMinutes}{translate("분")}</p>
              <small>{translate(transfer.note)}</small>
              <div className="court-card-footer">
                <div>
                  <span>{translate("양도 금액")}</span>
                  <strong>{formatWon(transfer.price, locale)}</strong>
                </div>
                <Link
                  href={`/chat/${transfer.chatId}`}
                  onClick={() => triggerNativeHaptic('selection')}
                >
                  <MessageCircle size={16} />
                  {translate("채팅 문의")}</Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="court-safety-note">
        <CalendarDays size={18} />
        <p>
          <strong>{translate("예약 명의 변경을 먼저 확인하세요.")}</strong>
          <br />
          {translate("양도자에게 공식 예약 내역을 확인한 뒤 결제하세요.")}</p>
      </div>
    </section>
  );
}
