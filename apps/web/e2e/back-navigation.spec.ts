import { expect, test, type Page } from '@playwright/test';
import { FakeListingApi } from '../lib/go-listings/fake-api';

const listing = { ...new FakeListingApi().listing, status: 'active' };
async function guestApi(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/community/posts' || path === '/api/v1/me/favorites')
      return route.fulfill({ json: { items: [] } });
    if (path === '/api/v1/auth/fixture-roles') return route.fulfill({ json: { roles: [] } });
    if (path === '/api/v1/listings')
      return route.fulfill({ json: { items: [listing], nextCursor: null } });
    if (path === `/api/v1/listings/${listing.id}`) return route.fulfill({ json: listing });
    if (path === `/api/v1/listings/${listing.id}/images`)
      return route.fulfill({ json: { listingId: listing.id, images: [] } });
    return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
  });
}
async function hydrated(page: Page) {
  await page.waitForFunction(
    () => history.state?.summergearPath === location.pathname + location.search,
  );
}

test('cancel and browser Back leave login without revisiting the protected writing page', async ({
  page,
}) => {
  await guestApi(page);
  await page.goto('/community');
  await hydrated(page);
  await page.getByRole('link', { name: '글쓰기', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=%2Fcommunity%2Fcreate&back=%2Fcommunity$/);
  await hydrated(page);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(/\/community$/);
  await hydrated(page);
  await page.getByRole('link', { name: '글쓰기', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/community$/);
  await page.goto('/auth?next=%2Fcommunity%2Fcreate&back=https%3A%2F%2Fevil.test');
  await hydrated(page);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(/\/community$/);
});

test('detail Back preserves catalog filters and direct entry falls back to the catalog', async ({
  page,
  context,
}) => {
  await guestApi(page);
  await page.goto('/market?sport=surf&minPrice=50000');
  await hydrated(page);
  await page.getByRole('link', { name: listing.title + ' 상세 보기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/market/' + listing.id));
  await hydrated(page);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(/\/market\?sport=surf&minPrice=50000$/);
  await expect(page.getByRole('textbox', { name: '최저 가격', exact: true })).toHaveValue('50000');
  const direct = await context.newPage();
  await guestApi(direct);
  await direct.goto(`/market/${listing.id}?source=go`);
  await hydrated(direct);
  await direct.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(direct).toHaveURL(/\/market$/);
});
