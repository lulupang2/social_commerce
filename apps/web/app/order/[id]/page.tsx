'use client';

import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { OrderShell, OrderBadge, OrderProduct } from '@/components/orders/OrderPresentation';
import styles from '@/components/orders/orders.module.css';
import { cancelOrder, getOrder, receiveOrder, type Order } from '@/lib/go-listings/orders';
import { formatWon } from '@/lib/display-format';
import { getGoSession } from '@/lib/go-auth/client';
import {
  formatOrderDate,
  orderActions,
  orderDeliveryLabel,
  orderStatusLabel,
} from '@/lib/go-listings/order-display';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrderDetail key={id} id={id} />;
}

function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<'cancel' | 'receive' | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const actionsAnchorHandled = useRef(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [session, result] = await Promise.all([getGoSession(), getOrder(id)]);
      if (!active) return;
      if (!session.ok) {
        setError(session.status === 401 ? '로그인 후 주문 정보를 확인할 수 있어요.' : session.message);
        setLoginRequired(session.status === 401);
      } else if (!result.ok) {
        setError(result.status === 401 ? '로그인 후 주문 정보를 확인할 수 있어요.' : result.status === 404 ? '주문을 찾을 수 없어요.' : result.message);
        setLoginRequired(result.status === 401);
      } else {
        setViewerId(session.session.member.id);
        setOrder(result.data);
        setNeedsRefresh(false);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (actionsAnchorHandled.current || loading || error || !order || window.location.hash !== '#order-actions') return;
    const target = document.getElementById('order-actions');
    if (!target) return;
    actionsAnchorHandled.current = true;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }, [loading, error, order]);

  const retry = () => {
    setLoading(true);
    setError('');
    setActionError('');
    setLoginRequired(false);
    setConfirmation(null);
    setAttempt((value) => value + 1);
  };
  const actions = order ? orderActions(order, viewerId) : null;
  const submit = async () => {
    if (!order || !confirmation || mutationLock.current || needsRefresh) return;
    if (confirmation === 'cancel' ? !actions?.pay : !actions?.receive) return;
    mutationLock.current = true;
    setBusy(true);
    setActionError('');
    const result = await (confirmation === 'cancel'
      ? cancelOrder(order.id)
      : receiveOrder(order.id));
    if (result.ok) {
      setOrder(result.data);
      setNotice(confirmation === 'cancel' ? '주문이 취소되었어요.' : '수령 확인이 완료되었어요.');
    } else {
      setActionError(`${result.message} 최신 주문 상태를 확인한 뒤 다시 진행해 주세요.`);
      setNeedsRefresh(true);
    }
    setConfirmation(null);
    setBusy(false);
    mutationLock.current = false;
  };

  return (
    <OrderShell detail>
      {loading ? (
        <StatePanel role="status" description="주문 정보를 불러오고 있어요." />
      ) : error || !order ? (
        <StatePanel
          role="alert"
          icon={<CircleAlert size={28} />}
          title={loginRequired ? '로그인이 필요해요' : '주문을 확인하지 못했어요'}
          description={error || '주문을 찾을 수 없어요.'}
          actions={
            <>
              {loginRequired ? (
                <Link href="/auth" className="btn-primary">
                  로그인하기
                </Link>
              ) : (
                <button type="button" className="btn-primary" onClick={retry}>
                  다시 시도
                </button>
              )}
              <Link href="/orders" className="btn-outline">
                주문 목록으로
              </Link>
            </>
          }
        />
      ) : (
        <div className={styles.stack}>
          <section className={styles.card} aria-label="주문 상품과 상태">
            <div className={styles.cardTop}>
              <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)} 주문</time>
              <OrderBadge order={order} />
            </div>
            <OrderProduct order={order} />
            <p className={styles.delivery}>
              <strong>전달 상태</strong>
              {orderDeliveryLabel(order)}
            </p>
          </section>
          <section className={styles.card} aria-labelledby="payment-heading">
            <h2 id="payment-heading" className={styles.sectionTitle}>
              결제 정보
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>상품 금액</dt>
                <dd>{formatWon(order.unitPriceKrw * order.quantity)}</dd>
              </div>
              <div>
                <dt>배송비</dt>
                <dd>{formatWon(order.shippingFeeKrw)}</dd>
              </div>
              <div>
                <dt>수수료</dt>
                <dd>{formatWon(order.serviceFeeKrw)}</dd>
              </div>
              <div className={styles.total}>
                <dt>총 주문 금액</dt>
                <dd>{formatWon(order.totalAmountKrw)}</dd>
              </div>
              <div>
                <dt>결제 상태</dt>
                <dd>{orderStatusLabel(order)}</dd>
              </div>
            </dl>
          </section>
          <section id="order-actions" className={`${styles.card} ${styles.actionAnchor}`} aria-labelledby="action-heading" tabIndex={-1}>
            <h2 id="action-heading" className={styles.sectionTitle}>
              주문 확인
            </h2>
            <p className={styles.muted}>
              현재 테스트 결제만 지원해요. 실제 결제·배송은 진행되지 않아요.
            </p>
            {notice ? (
              <p role="status" className={styles.delivery}>
                {notice}
              </p>
            ) : null}
            {actionError ? (
              <p role="alert" className={styles.error}>
                {actionError}
              </p>
            ) : null}
            {needsRefresh ? (
              <div className={styles.actions}>
                <button className="btn-primary" onClick={retry}>
                  최신 상태 확인
                </button>
              </div>
            ) : confirmation ? (
              <div className={styles.confirmation} role="group" aria-labelledby="confirm-heading">
                <h3 id="confirm-heading">
                  {confirmation === 'cancel' ? '이 주문을 취소할까요?' : '물품을 받으셨나요?'}
                </h3>
                <p>
                  {confirmation === 'cancel'
                    ? '주문을 취소하면 예약한 재고가 해제돼요.'
                    : '물품의 상태를 확인한 뒤 진행해 주세요. 수령을 확인하면 거래가 완료돼요.'}
                </p>
                <div className={styles.actions}>
                  <button
                    autoFocus
                    className="btn-outline"
                    disabled={busy}
                    onClick={() => setConfirmation(null)}
                  >
                    돌아가기
                  </button>
                  <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
                    {busy
                      ? '처리 중…'
                      : confirmation === 'cancel'
                        ? '주문 취소 확정'
                        : '수령 확인 확정'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                {actions?.pay ? (
                  <>
                    <Link className="btn-primary" href={`/order/confirm/${order.id}`}>
                      결제 계속하기
                    </Link>
                    <button className="btn-outline" onClick={() => setConfirmation('cancel')}>
                      주문 취소하기
                    </button>
                  </>
                ) : null}
                {actions?.payment ? (
                  <Link className="btn-outline" href={`/order/confirm/${order.id}`}>
                    결제 상태·취소 확인
                  </Link>
                ) : null}
                {actions?.receive ? (
                  <button className="btn-primary" onClick={() => setConfirmation('receive')}>
                    수령 확인하기
                  </button>
                ) : null}
                <button className="btn-outline" onClick={retry}>
                  최신 상태 확인
                </button>
              </div>
            )}
          </section>
          <section className={styles.card} aria-labelledby="order-heading">
            <h2 id="order-heading" className={styles.sectionTitle}>
              주문 정보
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>주문 번호</dt>
                <dd>{order.id}</dd>
              </div>
              <div>
                <dt>주문일</dt>
                <dd>{formatOrderDate(order.createdAt)} (한국시간)</dd>
              </div>
              {order.receivedAt ? (
                <div>
                  <dt>수령 확인일</dt>
                  <dd>{formatOrderDate(order.receivedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {viewerId !== order.buyerId ? (
              <div className={styles.actions}>
                <Link className="btn-outline" href="/seller/orders">
                  판매 주문 목록
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </OrderShell>
  );
}
