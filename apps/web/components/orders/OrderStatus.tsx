'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import type { Order } from '@icegear/domain';
import { orderFulfillmentLabel, orderStatusColor, orderStatusLabel } from '@/lib/go-listings/order-display';

export function OrderPaymentBadge({ order }: { order: Order }) {
  const translate = useTranslate();
  const color = orderStatusColor(order);
  return <span style={{ display: 'inline-block', color: `color-mix(in srgb, ${color} 35%, var(--text-main))`, fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 16, background: `color-mix(in srgb, ${color} 12%, var(--surface))` }}>{translate(orderStatusLabel(order))}</span>;
}

export function OrderFulfillmentStatus({ order, audience = 'buyer' }: { order: Order; audience?: 'buyer' | 'seller' }) {
  const translate = useTranslate();
  return <p>{translate("전달 상태:")}{' '}{translate(orderFulfillmentLabel(order, audience))}</p>;
}
