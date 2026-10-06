import { expect, test } from '@playwright/test';
import { FakeListingApi } from '../lib/go-listings/fake-api';

test('language selection survives reload, navigation, and sign-in return without translating listing content', async ({ page, context }) => {
  const listing = { ...new FakeListingApi().listing, status: 'active', title: '사용자 작성 상품명' };
  let signedIn = false;
  const session = { member: { id: listing.seller.id }, csrfToken: 'test-csrf' };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/dev-login') { signedIn = true; return route.fulfill({ json: session }); }
    if (path === '/api/v1/auth/fixture-roles') return route.fulfill({ json: { roles: [] } });
    if (path === '/api/v1/auth/session' && signedIn) return route.fulfill({ json: session });
    if (path === '/api/v1/listings') return route.fulfill({ json: { items: [listing], nextCursor: null } });
    if (path === '/api/v1/me/favorites' && signedIn) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', message: 'Raw server diagnostic' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/market?sport=surf&minPrice=50000');
  await page.getByRole('button', { name: '언어 변경', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('textbox', { name: 'Minimum price', exact: true })).toHaveValue('50000');
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to favorites', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Summer sports gear/);
  expect((await context.cookies()).find((cookie) => cookie.name === 'summergear_locale')?.value).toBe('en');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=/);
  await expect(page.getByRole('button', { name: 'Continue with a temporary account' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with a temporary account' }).click();
  await expect(page).toHaveURL(/\/market\?sport=surf&minPrice=50000$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('button', { name: '찜하기', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('English pages render on desktop and mobile without hydration errors or horizontal overflow', async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: 'summergear_locale', value: 'en', url: new URL('/', testInfo.project.use.baseURL as string).href }]);
  const listing = { ...new FakeListingApi().listing, status: 'active' };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/session') return route.fulfill({ json: { member: { id: listing.seller.id }, csrfToken: 'test-csrf' } });
    if (path === '/api/v1/listings') return route.fulfill({ json: { items: [listing], nextCursor: null } });
    if (path === '/api/v1/recommendations') return route.fulfill({ json: { items: [] } });
    if (path === '/api/v1/me/favorites') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { message: 'Raw server diagnostic' } });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/market', '/sell', '/community', '/orders']) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      if (path === '/sell') await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible();
      if (path === '/orders') await expect(page.locator('main').getByRole('alert')).toBeVisible();
      await expect(page.getByText('Raw server diagnostic', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}px`).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '') || 'home'}-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('switching language preserves an unfinished listing and updates validation copy', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/v1/auth/session') return route.fulfill({ json: { member: { id: new FakeListingApi().listing.seller.id }, csrfToken: 'test-csrf' } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/sell');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('제목', { exact: true }).fill('A');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByText('제목을 4자 이상 입력해 주세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '언어 변경', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('A');
  await expect(page.getByText('Enter a title with at least 4 characters.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await expect(page.getByLabel('제목', { exact: true })).toHaveValue('A');
  await expect(page.getByText('제목을 4자 이상 입력해 주세요.', { exact: true })).toBeVisible();
});
