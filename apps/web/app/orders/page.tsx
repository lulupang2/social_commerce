'use client';

import { useLocale } from 'next-intl';
import { useTranslate } from '@/lib/i18n/use-translate';

import Link from 'next/link';
import { ShoppingBag, CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { OrderShell, OrderBadge, OrderProduct } from '@/components/orders/OrderPresentation';
import styles from '@/components/orders/orders.module.css';
import { listOrders, type Order } from '@/lib/go-listings/orders';
import { getGoSession } from '@/lib/go-auth/client';
import { formatOrderDate, orderActions, orderDeliveryLabel } from '@/lib/go-listings/order-display';

export default function OrdersPage() {
  const locale = useLocale();
  const translate = useTranslate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await getGoSession();
      if (!active) return;
      if (!session.ok) {
        setLoginRequired(session.status === 401);
        setError(
          session.status === 401 ? translate('로그인 후 내 주문 내역을 확인할 수 있어요.') : session.message,
        );
        setLoading(false);
        return;
      }
      setViewerId(session.session.member.id);
      const result = await listOrders();
      if (!active) return;
      if (result.ok) setOrders(result.data.orders);
      else {
        setError(result.message);
        setLoginRequired(result.status === 401);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [attempt, translate]);

  const retry = () => {
    setLoading(true);
    setError('');
    setLoginRequired(false);
    setAttempt((value) => value + 1);
  };

  return (
    <OrderShell>
      {loading ? (
        <StatePanel role="status" description={translate("주문 내역을 불러오고 있어요.")} />
      ) : error ? (
        <StatePanel
          role="alert"
          icon={<CircleAlert size={28} />}
          title={loginRequired ? translate('로그인이 필요해요') : translate('주문 내역을 불러오지 못했어요')}
          description={translate(error)}
          actions={
            loginRequired ? (
              <Link href="/auth" className="btn-primary">{translate("로그인하기")}</Link>
            ) : (
              <button type="button" className="btn-primary" onClick={retry}>{translate("다시 시도")}</button>
            )
          }
        />
      ) : orders.length === 0 ? (
        <StatePanel
          icon={<ShoppingBag size={28} />}
          title={translate("아직 주문 내역이 없어요")}
          description={translate("마켓에서 나에게 맞는 장비를 찾아보세요.")}
          actions={
            <Link href="/market" className="btn-primary">{translate("마켓 둘러보기")}</Link>
          }
        />
      ) : (
        <>
          <div className={styles.intro}>
            <h2>{translate("최근 주문")}</h2>
            <p>{translate("최근 주문 최대 50건을 최신순으로 보여드려요.")}</p>
          </div>
          <ul className={styles.list}>
            {orders.map((order) => {
              const actions = orderActions(order, viewerId);
              return (
                <li key={order.id}>
                  <article className={styles.card} aria-label={(order.itemName + translate(" 주문"))}>
                    <div className={styles.cardTop}>
                      <time dateTime={order.createdAt}>
                        {translate(`${formatOrderDate(order.createdAt, locale)} 주문`)}</time>
                      <OrderBadge order={order} />
                    </div>
                    <OrderProduct order={order} />
                    <p className={styles.delivery}>
                      {translate(orderDeliveryLabel(order))}
                    </p>
                    <div className={styles.actions}>
                      <Link className="btn-outline" href={`/order/${order.id}`}>{translate("주문 상세")}</Link>
                      {actions.pay ? (
                        <Link className="btn-primary" href={`/order/confirm/${order.id}`}>{translate("결제 계속하기")}</Link>
                      ) : actions.receive ? (
                        <Link className="btn-primary" href={`/order/${order.id}#order-actions`}>{translate("수령 확인하기")}</Link>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </OrderShell>
  );
}
