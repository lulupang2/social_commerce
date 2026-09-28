import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package } from 'lucide-react';
import type { Order } from '@icegear/domain';
import { BottomNav } from '@/components/layout/BottomNav';
import { orderProgressLabel } from '@/lib/go-listings/order-display';
import { formatWon } from '@/lib/display-format';
import styles from './orders.module.css';

export function OrderShell({ children, detail = false }: { children: ReactNode; detail?: boolean }) {
  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href={detail ? '/orders' : '/profile'} aria-label={detail ? '주문 목록으로 돌아가기' : '마이페이지로 돌아가기'}><ArrowLeft size={22} /></Link>
      <h1>{detail ? '주문 상세' : '내 주문 내역'}</h1>
      <Link className={styles.marketLink} href="/market">마켓</Link>
    </header>
    <main className={styles.content}>{children}</main>
    <BottomNav />
  </div>;
}

export function OrderBadge({ order }: { order: Order }) {
  const tone = order.status === 'cancelled' || order.paymentStatus === 'cancelled' ? 'neutral'
    : order.paymentStatus === 'failed' ? 'error'
    : order.paymentStatus === 'pending_cancel' || order.paymentStatus === 'pending_approval' ? 'pending'
    : order.paymentStatus === 'approved' && order.fulfillmentStatus === 'completed' ? 'complete' : 'active';
  return <span className={styles.badge} data-tone={tone}>{orderProgressLabel(order)}</span>;
}

export function OrderProduct({ order }: { order: Order }) {
  // The order contract has no image URL. Do not substitute unrelated listing photos.
  return <div className={styles.product}>
    <div className={styles.placeholder} role="img" aria-label="상품 이미지 없음"><Package size={26} aria-hidden="true" /><span>이미지 없음</span></div>
    <div className={styles.productText}>
      <h2>{order.itemName}</h2>
      <p>수량 {order.quantity}개</p>
      <strong>{formatWon(order.totalAmountKrw)}</strong>
    </div>
  </div>;
}
