import { expect, test } from '@playwright/test';
import { FakeListingApi } from '../lib/go-listings/fake-api';

test('guest favorites open login and test login returns to the filtered catalog without replaying a write', async ({
  page,
}) => {
  const listing = { ...new FakeListingApi().listing, status: 'active' };
  let signedIn = false;
  let favoriteWrites = 0;
  const session = { member: { id: listing.seller.id }, csrfToken: 'test-csrf' };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/dev-login') {
      signedIn = true;
      return route.fulfill({ json: session });
    }
    if (path === '/api/v1/auth/fixture-roles') return route.fulfill({ json: { roles: [] } });
    if (path === '/api/v1/auth/session' && signedIn) return route.fulfill({ json: session });
    if (path === '/api/v1/listings')
      return route.fulfill({ json: { items: [listing], nextCursor: null } });
    if (path === '/api/v1/me/favorites' && signedIn) return route.fulfill({ json: { items: [] } });
    if (path === `/api/v1/me/favorites/${listing.id}` && signedIn) {
      favoriteWrites++;
      return route.fulfill({ json: { listingId: listing.id, favorite: true } });
    }
    return route.fulfill({
      status: 401,
      json: { code: 'UNAUTHENTICATED', message: 'A valid service session is required' },
    });
  });
  await page.goto('/market?sport=surf&minPrice=50000');
  await expect(page.getByRole('button', { name: '찜하기', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/market\?sport=surf&minPrice=50000$/);
  const loginReady = page.waitForResponse('**/api/v1/auth/fixture-roles');
  await page.getByRole('button', { name: '찜하기', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/market?sport=surf&minPrice=50000');
  await loginReady;
  await expect(page.getByText('A valid service session is required')).toHaveCount(0);
  await page.getByRole('button', { name: '임시 계정으로 계속하기' }).click();
  await expect(page).toHaveURL(/\/market\?sport=surf&minPrice=50000$/);
  await expect(page.getByRole('textbox', { name: '최저 가격', exact: true })).toHaveValue('50000');
  expect(favoriteWrites).toBe(0);
  await page.getByRole('button', { name: '찜하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '찜 해제', exact: true })).toBeVisible();
  expect(favoriteWrites).toBe(1);
});

test('protected pages redirect only for missing login, while service and permission failures stay Korean and retryable', async ({
  page,
}) => {
  let status = 503;
  let protectedRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/session')
      return route.fulfill({ status, json: { message: 'Raw server failure' } });
    if (path === '/api/v1/auth/fixture-roles') return route.fulfill({ json: { roles: [] } });
    if (path === '/api/v1/orders') protectedRequests++;
    return route.fulfill({ status: 401, json: { message: 'A valid service session is required' } });
  });
  await page.goto('/orders');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    '로그인 상태를 확인하지 못했어요',
  );
  await expect(page).toHaveURL(/\/orders$/);
  status = 403;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('권한이 없어요');
  await expect(page).toHaveURL(/\/orders$/);
  status = 401;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page).toHaveURL(/\/auth\?next=%2Forders&back=%2F$/);
  await expect(page.getByRole('button', { name: '임시 계정으로 계속하기' })).toBeVisible();
  expect(protectedRequests).toBe(0);
});
