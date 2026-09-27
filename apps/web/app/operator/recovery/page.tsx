'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecoveryDashboard } from '@icegear/domain';
import { MobileShell } from '@/components/layout/MobileShell';
import { getRecoveryDashboard, recheckPaymentAttempt } from '@/lib/go-auth/recovery';
import { getSellerStatus } from '@/lib/go-listings/seller';
import styles from './recovery.module.css';

export default function RecoveryPage() {
  const [dashboard, setDashboard] = useState<RecoveryDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const refresh = useCallback(async () => {
    const role = await getSellerStatus();
    if (!role.ok || !role.data.reviewer) {
      setError(role.ok ? '운영자 권한이 필요합니다.' : role.message); setDashboard(null); setLoading(false); return;
    }
    const response = await getRecoveryDashboard();
    if (response.ok) { setDashboard(response.data); setError(''); }
    else setError(response.message);
    setLoading(false);
  }, []);
  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);
  const recheck = async (id: string) => {
    setBusy(id);
    const result = await recheckPaymentAttempt(id, reason.trim());
    if (result.ok) { setReason(''); await refresh(); }
    else setError(result.message);
    setBusy(null);
  };
  return <MobileShell title="운영 복구 현황">
    <main className={styles.page}>
      <p className={styles.intro}>재대조는 결제사 상태만 다시 확인합니다. 성공을 수동 지정하거나 전달한 재고를 복원하지 않습니다.</p>
      {loading ? <p role="status">복구 현황을 확인하고 있어요.</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {dashboard ? <>
        <button className="btn-outline" type="button" onClick={() => void refresh()}>현황 새로고침</button>
        <section className={styles.section} aria-labelledby="recovery-attempts">
          <h2 className={styles.heading} id="recovery-attempts">미확정·실패 결제 <span className={styles.count}>{dashboard.attempts.length}</span></h2>
          <label className={styles.reason}>재대조 사유
            <input className="form-input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="확인 근거와 요청 사유" />
          </label>
          {dashboard.attempts.length === 0 ? <p className={styles.empty}>확인할 결제 시도가 없습니다.</p> : null}
          {dashboard.attempts.map((attempt) => <article className={`checkout-card ${styles.card}`} key={attempt.id}>
            <p className={styles.cardTitle}>주문 <span className={styles.identifier}>{attempt.orderId}</span></p>
            <p className={styles.meta}>결제 {attempt.paymentStatus} · 시도 {attempt.status}</p>
            <p className={styles.meta}>시도 ID <span className={styles.identifier}>{attempt.id}</span></p>
            <time className={styles.meta}>{new Date(attempt.updatedAt).toLocaleString('ko-KR')}</time>
            {attempt.recheckable ? <button className="btn-primary" type="button" disabled={busy !== null || !reason.trim()} onClick={() => void recheck(attempt.id)}>결제사 상태 재대조 요청</button>
              : <p className={styles.meta}>종결된 결제는 자동 재대조로 변경할 수 없습니다. 수동 조사가 필요합니다.</p>}
          </article>)}
        </section>
        <section className={styles.section} aria-labelledby="recovery-audit">
          <h2 className={styles.heading} id="recovery-audit">재대조 감사 기록 <span className={styles.count}>{dashboard.requests.length}</span></h2>
          <div className={styles.rows}>{dashboard.requests.map((request) => <article className={styles.row} key={request.id}>
            <strong>주문 {request.orderId} · {request.status}</strong>
            <p>사유: {request.reason}</p>
            <p className={styles.meta}>담당자 <span className={styles.identifier}>{request.actorMemberId}</span></p>
            {request.lastErrorCode ? <p className={styles.error} role="status">실패 코드: {request.lastErrorCode}</p> : null}
            <time className={styles.meta}>{new Date(request.requestedAt).toLocaleString('ko-KR')}</time>
          </article>)}</div>
        </section>
        <section className={styles.section} aria-labelledby="recovery-jobs">
          <h2 className={styles.heading} id="recovery-jobs">실패·재시도 중 작업 <span className={styles.count}>{dashboard.jobs.length}</span></h2>
          <div className={styles.rows}>{dashboard.jobs.map((job) => <p className={styles.row} key={job.id}>작업 {job.id} · {job.kind} · {job.state} · 시도 {job.attempt}</p>)}</div>
        </section>
        <section className={styles.section} aria-labelledby="recovery-events">
          <h2 className={styles.heading} id="recovery-events">검증 대기 결제 이벤트 <span className={styles.count}>{dashboard.paymentEvents.length}</span></h2>
          <div className={styles.rows}>{dashboard.paymentEvents.map((event) => <p className={styles.row} key={event.id}>이벤트 {event.id} · {event.state} · 재시도 {event.retries} · 결제사 검증 {event.verified ? '완료' : '대기'}</p>)}</div>
        </section>
        <section className={styles.section} aria-labelledby="recovery-push">
          <h2 className={styles.heading} id="recovery-push">발송 실패 알림 <span className={styles.count}>{dashboard.notifications.length}</span></h2>
          <div className={styles.rows}>{dashboard.notifications.map((item) => <p className={styles.row} key={item.id}>{item.kind} · {item.id} · 시도 {item.attempts} · {item.lastErrorCode}</p>)}</div>
        </section>
      </> : null}
    </main>
  </MobileShell>;
}
