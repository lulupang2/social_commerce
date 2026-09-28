import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type Role = 'buyer_a' | 'buyer_b' | 'seller_a' | 'seller_b' | 'reviewer';
type Order = { id: string; listingId: string; itemName: string; status: string; paymentStatus: string; fulfillmentStatus: string };
type Stock = { availableQuantity: number; reservedQuantity: number };
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210';
const runId = process.env.E2E_RUN_ID ?? Date.now().toString(36);

async function login(context: BrowserContext, role: Role): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/auth');
  await page.getByLabel('격리 fixture 계정').selectOption(role);
  await page.getByRole('button', { name: '임시 계정으로 계속하기' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect((await context.request.get('/api/v1/auth/session')).status()).toBe(200);
  return page;
}

async function post(page: Page, path: string, data: object = {}): Promise<APIResponse> {
  const session = await page.request.get('/api/v1/auth/session');
  expect(session.status()).toBe(200);
  const { csrfToken } = (await session.json()) as { csrfToken: string };
  expect(typeof csrfToken).toBe('string');
  return page.request.post(path, { data, headers: { Origin: baseURL, 'X-CSRF-Token': csrfToken } });
}

async function getOrder(page: Page, id: string): Promise<Order> {
  const response = await page.request.get(`/api/v1/orders/${id}`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<Order>;
}

async function getStock(seller: Page, id: string): Promise<Stock | null> {
  const response = await seller.request.get(`/api/v1/listings/${id}/inventory`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { inventory: Stock | null };
  return body.inventory;
}

async function expectStock(seller: Page, listingId: string, availableQuantity: number, reservedQuantity: number) {
  await expect.poll(() => getStock(seller, listingId)).toMatchObject({ availableQuantity, reservedQuantity });
}

async function createListing(seller: Page, title: string): Promise<string> {
  await seller.goto('/sell');
  await seller.getByRole('button', { name: '다음 단계' }).click();
  await seller.getByLabel('제목').fill(title);
  await seller.getByLabel('판매 가격').fill('12000');
  await seller.getByLabel('거래 장소').fill('격리 테스트 장소');
  await seller.getByRole('button', { name: '다음 단계' }).click();
  await seller.getByLabel('상세 설명').fill('격리 fixture E2E 검증용 상품이며 실제 거래가 아닙니다.');
  const responsePromise = seller.waitForResponse((response) => response.url().endsWith('/api/v1/listings') && response.request().method() === 'POST');
  await seller.getByRole('button', { name: '검토 요청하기' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const listing = (await response.json()) as { id: string; status: string };
  expect(listing.status).toBe('pending_review');
  await expect(seller.getByText('Go API 검토 요청 완료')).toBeVisible();
  return listing.id;
}

async function approveListing(reviewer: Page, title: string) {
  await reviewer.goto('/reviews');
  const card = reviewer.locator('article').filter({ has: reviewer.getByRole('heading', { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '승인', exact: true }).click();
  await expect(card).toHaveCount(0);
}

async function prepareListing(seller: Page, reviewer: Page, title: string): Promise<string> {
  const id = await createListing(seller, title);
  await approveListing(reviewer, title);
  await seller.goto(`/seller/inventory/${id}`);
  await expect(seller.getByText('현재 판매 가능: 0개 · 예약 중: 0개')).toBeVisible();
  await seller.getByRole('button', { name: '재고 1개 판매 시작' }).click();
  await expect(seller.getByText('현재 판매 가능: 1개 · 예약 중: 0개')).toBeVisible();
  await expectStock(seller, id, 1, 0);
  return id;
}

async function createOrder(buyer: Page, listingId: string, title: string, clickTwice = false): Promise<Order> {
  await buyer.goto(`/market/${listingId}`);
  await buyer.getByRole('link', { name: '구매하기' }).click();
  await expect(buyer.getByRole('heading', { name: '주문서' })).toBeVisible();
  await expect(buyer.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const button = buyer.getByRole('button', { name: '주문 확인하고 결제 단계로' });
  if (clickTwice) {
    await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  } else {
    await button.click();
  }
  await expect(buyer).toHaveURL(/\/order\/confirm\/[0-9a-f-]+$/);
  const id = new URL(buyer.url()).pathname.split('/').at(-1)!;
  const order = await getOrder(buyer, id);
  expect(order.listingId).toBe(listingId);
  expect(order.itemName).toBe(title);
  expect(order.status).toBe('pending');
  expect(order.paymentStatus).toBe('unpaid');
  return order;
}

async function pay(buyer: Page, order: Order) {
  await buyer.goto(`/order/confirm/${order.id}`);
  await expect(buyer.getByText('FIXTURE PAYMENT')).toBeVisible();
  await buyer.getByRole('button', { name: '가짜 PG 승인' }).click();
  await expect(buyer.getByText('테스트 결제 승인을 확인했습니다.')).toBeVisible();
  await expect.poll(async () => (await getOrder(buyer, order.id)).paymentStatus).toBe('approved');
}

test('real isolated buyer/seller/operator transaction, inventory and ownership', async ({ browser }: { browser: Browser }, info: TestInfo) => {
  test.setTimeout(240_000);
  const roles = ['buyer_a', 'buyer_b', 'seller_a', 'seller_b', 'reviewer'] as const;
  const contexts: Partial<Record<Role, BrowserContext>> = {};
  const pages: Partial<Record<Role, Page>> = {};
  try {
    for (const role of roles) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, colorScheme: 'light' });
      contexts[role] = context;
      pages[role] = await login(context, role);
    }
    const buyer = pages.buyer_a!, otherBuyer = pages.buyer_b!, seller = pages.seller_b!, otherSeller = pages.seller_a!, reviewer = pages.reviewer!;
    const normalTitle = `E2E 서핑 장비 정상거래 ${runId}`;
    const unpaidTitle = `E2E 서핑 장비 미결제취소 ${runId}`;
    const paidTitle = `E2E 서핑 장비 결제취소 ${runId}`;

    await test.step('buyer B has an empty list and seller B is approved by the operator through the UI', async () => {
      await otherBuyer.goto('/orders');
      await expect(otherBuyer.getByText('아직 주문 내역이 없어요')).toBeVisible();
      const initial = await otherBuyer.request.get('/api/v1/orders');
      expect(initial.status()).toBe(200);
      expect((await initial.json() as { orders: Order[] }).orders).toEqual([]);
      await seller.goto('/seller/apply');
      const displayName = `격리 판매자 ${runId}`;
      await seller.getByLabel('표시 이름').fill(displayName);
      const applicationResponse = seller.waitForResponse((response) => response.url().endsWith('/api/v1/me/seller-application') && response.request().method() === 'POST');
      await seller.getByRole('button', { name: '승인 신청' }).click();
      const application = (await (await applicationResponse).json()) as { id: string };
      await expect(seller.getByText(/신청을 검토 중입니다/)).toBeVisible();
      await buyer.goto('/operator/sellers');
      await expect(buyer.getByText('운영자 권한이 필요합니다.')).toBeVisible();
      expect((await buyer.request.get('/api/v1/seller-applications')).status()).toBe(403);
      expect((await post(buyer, `/api/v1/seller-applications/${application.id}/approve`, { reason: '' })).status()).toBe(403);
      await reviewer.goto('/operator/sellers');
      const card = reviewer.locator('article').filter({ hasText: displayName });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: '승인', exact: true }).click();
      await expect(card).toHaveCount(0);
      await seller.reload();
      await expect(seller.getByText('판매자 승인 완료')).toBeVisible();
    });

    const listingId = await test.step('pending and approved-but-unstocked listings block purchase in UI and API', async () => {
      const id = await createListing(seller, normalTitle);
      await seller.goto('/my/listings');
      await expect(seller.getByText(normalTitle)).toBeVisible();
      await expect(seller.getByText('검토 대기').first()).toBeVisible();
      await buyer.goto(`/market/${id}`);
      await expect(buyer.getByRole('link', { name: '구매하기' })).toHaveCount(0);
      expect((await post(buyer, '/api/v1/orders', { listingId: id, quantity: 1 })).status()).toBe(404);
      await approveListing(reviewer, normalTitle);
      await buyer.goto(`/market/${id}`);
      await expect(buyer.getByText('판매 준비 중이에요.')).toBeVisible();
      await expect(buyer.getByRole('link', { name: '구매하기' })).toHaveCount(0);
      expect((await post(buyer, '/api/v1/orders', { listingId: id, quantity: 1 })).status()).toBe(404);
      await seller.goto(`/seller/inventory/${id}`);
      await expect(seller.getByText('현재 판매 가능: 0개 · 예약 중: 0개')).toBeVisible();
      await seller.getByRole('button', { name: '재고 1개 판매 시작' }).click();
      await expectStock(seller, id, 1, 0);
      return id;
    });

    const completedOrder = await test.step('buyer orders and fake-pays; seller accepts and hands over; buyer confirms receipt', async () => {
      const order = await createOrder(buyer, listingId, normalTitle);
      await expectStock(seller, listingId, 0, 1);
      await buyer.goto('/orders');
      const card = buyer.getByRole('article', { name: `${normalTitle} 주문` });
      await expect(card).toContainText('결제 대기');
      await card.getByRole('link', { name: '주문 상세' }).click();
      await expect(buyer.locator('#order-actions')).toBeVisible();
      expect(await buyer.evaluate(() => scrollY)).toBe(0);
      await buyer.locator('#order-actions').getByRole('link', { name: '결제 계속하기' }).click();
      await expect(buyer).toHaveURL(new RegExp(`/order/confirm/${order.id}$`));
      await pay(buyer, order);
      await expectStock(seller, listingId, 0, 0);
      await seller.goto('/seller/orders');
      const sellerCard = seller.locator('article.checkout-card').filter({ hasText: normalTitle });
      await expect(sellerCard).toContainText('판매자 접수');
      await sellerCard.getByRole('button', { name: '판매자 접수' }).click();
      await expect(sellerCard.getByRole('button', { name: '전달/발송 처리' })).toBeVisible();
      await sellerCard.getByRole('button', { name: '전달/발송 처리' }).click();
      await expect(sellerCard).toContainText('수령 대기');
      expect((await getOrder(buyer, order.id)).fulfillmentStatus).toBe('handed_over');
      await otherBuyer.goto('/orders');
      await expect(otherBuyer.getByText('아직 주문 내역이 없어요')).toBeVisible();
      expect((await otherBuyer.request.get(`/api/v1/orders/${order.id}`)).status()).toBe(404);
      expect((await post(otherBuyer, `/api/v1/orders/${order.id}/cancel`)).status()).toBe(404);
      expect((await post(otherBuyer, `/api/v1/orders/${order.id}/receive`)).status()).toBe(404);
      await otherBuyer.goto(`/order/${order.id}`);
      await expect(otherBuyer.getByText('주문을 확인하지 못했어요')).toBeVisible();
      await otherSeller.goto('/seller/orders');
      await expect(otherSeller.getByText('처리할 판매 주문이 없습니다.')).toBeVisible();
      const sellerOrders = await otherSeller.request.get('/api/v1/seller/orders');
      expect(sellerOrders.status()).toBe(200);
      expect((await sellerOrders.json() as { orders: Order[] }).orders.some((item) => item.id === order.id)).toBe(false);
      expect((await otherSeller.request.get(`/api/v1/orders/${order.id}`)).status()).toBe(404);
      await otherSeller.goto(`/order/${order.id}`);
      await expect(otherSeller.getByText('주문을 확인하지 못했어요')).toBeVisible();
      expect((await post(otherSeller, `/api/v1/seller/orders/${order.id}/accept`)).status()).toBe(404);
      expect((await post(otherSeller, `/api/v1/seller/orders/${order.id}/hand-over`)).status()).toBe(404);
      expect((await getOrder(buyer, order.id)).fulfillmentStatus).toBe('handed_over');
      return order;
    });

    await test.step('real delayed order GET allows one hash jump and keyboard focus but ordinary detail does not move', async () => {
      await buyer.goto('/orders');
      const card = buyer.getByRole('article', { name: `${normalTitle} 주문` });
      await card.getByRole('link', { name: '주문 상세' }).click();
      await expect(buyer.locator('#order-actions')).toBeVisible();
      expect(await buyer.evaluate(() => scrollY)).toBe(0);
      await buyer.goto('/orders');
      let entered!: () => void;
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const match = (url: URL) => url.pathname === `/api/v1/orders/${completedOrder.id}`;
      await buyer.route(match, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        entered();
        await gate;
        await route.continue(); // Forward the real API response; never fake transaction success.
      });
      try {
        const click = buyer.getByRole('article', { name: `${normalTitle} 주문` }).getByRole('link', { name: '수령 확인하기' }).click();
        await waiting;
        await expect(buyer.getByText('주문 정보를 불러오고 있어요.')).toBeVisible();
        expect(await buyer.evaluate(() => document.getElementById('order-actions'))).toBeNull();
        release();
        await click;
        const target = buyer.locator('#order-actions');
        await expect(target).toBeFocused();
        const visible = await buyer.evaluate(() => {
          const section = document.getElementById('order-actions')!;
          const button = section.querySelector('button')!;
          const nav = document.querySelector('.bottom-nav')!;
          return { scrollY, top: section.getBoundingClientRect().top, buttonBottom: button.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top };
        });
        expect(visible.scrollY).toBeGreaterThan(0);
        expect(visible.top).toBeGreaterThan(60);
        expect(visible.buttonBottom).toBeLessThan(visible.navTop);
        await buyer.keyboard.press('Tab');
        await expect(target.getByRole('button', { name: '수령 확인하기' })).toBeFocused();
      } finally {
        release();
        await buyer.unroute(match);
      }
      await buyer.setViewportSize({ width: 320, height: 740 });
      await buyer.emulateMedia({ colorScheme: 'light' });
      await expect(buyer.getByText(normalTitle)).toBeVisible();
      expect(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await buyer.screenshot({ path: info.outputPath('order-320-light.png') });
      await buyer.setViewportSize({ width: 390, height: 844 });
      await buyer.emulateMedia({ colorScheme: 'dark' });
      await expect(buyer.locator('#order-actions').getByRole('button', { name: '수령 확인하기' })).toBeVisible();
      expect(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await buyer.screenshot({ path: info.outputPath('order-390-dark.png') });
      let refreshEntered!: () => void;
      let releaseRefresh!: () => void;
      const refreshRequested = new Promise<void>((resolve) => { refreshEntered = resolve; });
      const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
      const refreshMatch = (url: URL) => url.pathname === `/api/v1/orders/${completedOrder.id}`;
      await buyer.route(refreshMatch, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        refreshEntered();
        await refreshGate;
        await route.continue();
      });
      try {
        const refreshClick = buyer.locator('#order-actions').getByRole('button', { name: '최신 상태 확인' }).click();
        await refreshRequested;
        await expect(buyer.getByText('주문 정보를 불러오고 있어요.')).toBeVisible();
        await buyer.evaluate(() => window.scrollTo(0, 0));
        releaseRefresh();
        await refreshClick;
        await expect(buyer.locator('#order-actions')).toBeVisible();
        expect(await buyer.evaluate(() => scrollY)).toBe(0);
      } finally {
        releaseRefresh();
        await buyer.unroute(refreshMatch);
      }
      await buyer.locator('#order-actions').getByRole('button', { name: '수령 확인하기' }).click();
      await expect(buyer.getByText('물품을 받으셨나요?')).toBeVisible();
      await buyer.getByRole('button', { name: '수령 확인 확정' }).click();
      await expect(buyer.getByText('수령 확인이 완료되었어요.')).toBeVisible();
      const received = await getOrder(buyer, completedOrder.id);
      expect(received.fulfillmentStatus).toBe('completed');
      expect(received.paymentStatus).toBe('approved');
      await seller.reload();
      await expect(seller.locator('article.checkout-card').filter({ hasText: normalTitle })).toContainText('거래 완료');
      await expectStock(seller, listingId, 0, 0);
    });

    await test.step('unpaid cancellation restores one stock and duplicate create/cancel does not double-reserve or restore', async () => {
      const listing = await prepareListing(seller, reviewer, unpaidTitle);
      const order = await createOrder(buyer, listing, unpaidTitle, true);
      await expectStock(seller, listing, 0, 1);
      const repeated = await post(buyer, '/api/v1/orders', { listingId: listing, quantity: 1 });
      expect(repeated.status()).toBe(201);
      expect((await repeated.json() as Order).id).toBe(order.id);
      await expectStock(seller, listing, 0, 1);
      await buyer.goto(`/order/${order.id}`);
      await buyer.getByRole('button', { name: '주문 취소하기' }).click();
      await buyer.getByRole('button', { name: '주문 취소 확정' }).click();
      await expect(buyer.getByText('주문이 취소되었어요.')).toBeVisible();
      expect((await getOrder(buyer, order.id)).status).toBe('cancelled');
      await expectStock(seller, listing, 1, 0);
      const again = await post(buyer, `/api/v1/orders/${order.id}/cancel`);
      expect(again.status()).toBe(200);
      expect((await again.json() as { order: Order }).order.id).toBe(order.id);
      await expectStock(seller, listing, 1, 0);
    });

    await test.step('fake-approved allowed full cancellation restores one stock and repeated refund is idempotent', async () => {
      const listing = await prepareListing(seller, reviewer, paidTitle);
      const order = await createOrder(buyer, listing, paidTitle);
      await pay(buyer, order);
      await expectStock(seller, listing, 0, 0);
      await buyer.getByRole('button', { name: '테스트 결제 전체 취소' }).click();
      await expect(buyer.getByText('결제 전체 취소가 확인되었습니다.')).toBeVisible();
      await expect.poll(async () => (await getOrder(buyer, order.id)).paymentStatus).toBe('cancelled');
      expect((await getOrder(buyer, order.id)).status).toBe('cancelled');
      await expectStock(seller, listing, 1, 0);
      const repeated = await post(buyer, `/api/v1/orders/${order.id}/refunds`);
      expect(repeated.status()).toBe(200);
      expect((await repeated.json() as Order).paymentStatus).toBe('cancelled');
      await expectStock(seller, listing, 1, 0);
    });
  } finally {
    await Promise.all(Object.values(contexts).filter((context): context is BrowserContext => !!context).map((context) => context.close()));
  }
});

test('real empty orders, failed read retry and logged-out state', async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 320, height: 740 } });
  const guest = await browser.newContext({ baseURL });
  try {
    const page = await login(context, 'buyer_b');
    await page.route((url) => url.pathname === '/api/v1/orders', (route) => route.abort('failed'), { times: 1 });
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
    await page.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.getByText('아직 주문 내역이 없어요')).toBeVisible();
    expect((await page.request.get('/api/v1/orders')).status()).toBe(200);
    await page.goto('/profile');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect.poll(async () => (await page.request.get('/api/v1/auth/session')).status()).toBe(401);
    await page.goto('/orders');
    await expect(page.getByRole('link', { name: '로그인하기' })).toBeVisible();
    const guestPage = await guest.newPage();
    await guestPage.goto('/orders');
    await expect(guestPage.getByRole('link', { name: '로그인하기' })).toBeVisible();
    expect((await guestPage.request.get('/api/v1/orders')).status()).toBe(401);
  } finally {
    await Promise.all([context.close(), guest.close()]);
  }
});
