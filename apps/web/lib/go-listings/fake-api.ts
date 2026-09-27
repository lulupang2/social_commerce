import { randomUUID } from 'node:crypto';
import type { GoListing } from './client';
import type { GoListingImage } from './images';

// Node-only contract simulator. Imported by tests, never by application code.
export class FakeListingApi {
  readonly ownerId = '33333333-3333-4333-8333-333333333333';
  memberId: string | null = this.ownerId;
  listing: GoListing = {
    id: '22222222-2222-4222-8222-222222222222',
    seller: { id: this.ownerId, displayName: '사진 판매자' },
    sport: 'surf', category: 'equipment', title: '테스트 서핑보드',
    description: '보관 상태가 좋은 테스트 서핑보드입니다.', priceKrw: 100000,
    condition: 'good', status: 'pending_review', location: '서울',
    details: { sport: 'surf', brand: 'Test', model: 'Board', discipline: 'shortboard', boardLengthFeet: 6, volumeLiters: 30, finSystem: 'fcs2' },
    publishedAt: null, createdAt: '2026-09-21T00:00:00Z', updatedAt: '2026-09-21T00:00:00Z', images: [],
  };
  readonly slots = new Map<string, { sortOrder: number; replaceImageId?: string; uploaded: boolean; altText?: string }>();
  readonly calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  storageStatus = 200;
  listStatus = 200;
  uploadStatus = 201;
  cleanupStatus = 204;
  completeStatus = 200;
  expireUpload = false;
  loseCompleteResponse = false;
  dropCompleteRequest = false;
  failListAfterComplete = false;
  failPutAt = 0;
  private putCount = 0;

  seed(orders: number[]): void {
    this.listing.images = orders.map((sortOrder) => this.signed(randomUUID(), sortOrder));
  }

  private signed(id: string, sortOrder: number, altText?: string): GoListingImage {
    return { id, state: 'signed', sortOrder, altText: altText ?? null,
      url: `https://storage.fixture.invalid/read/${id}?token=test`,
      expiresAt: new Date(Date.now() + 600_000).toISOString() };
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(new URL(input instanceof Request ? input.url : String(input), 'http://fixture.invalid'), init);
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const body = method === 'POST' || method === 'PATCH' ? await request.clone().json().catch(() => undefined) as Record<string, unknown> | undefined : undefined;
    this.calls.push({ method, path, body });
    const fail = (status: number, code?: string) => Response.json({ code: code ?? ({ 400: 'IMAGE_INVALID', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'IMAGE_NOT_FOUND', 409: 'IMAGE_CONFLICT', 410: 'IMAGE_UPLOAD_EXPIRED', 503: 'IMAGE_STORAGE_UNAVAILABLE' } as Record<number, string>)[status], message: 'fixture failure', requestId: randomUUID() }, { status });
    if (path === '/api/v1/auth/session') {
      return this.memberId ? Response.json({ member: { id: this.memberId, displayName: '테스터', email: null, onboarded: true }, csrfToken: 'test-csrf', session: { expiresAt: new Date(Date.now() + 600_000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(), reauthenticatedAt: null } }) : fail(401);
    }
    if (url.hostname === 'storage.fixture.invalid' && method === 'PUT') {
      this.putCount += 1;
      if (this.storageStatus !== 200 || this.putCount === this.failPutAt) return fail(this.storageStatus !== 200 ? this.storageStatus : 503);
      const slot = this.slots.get(path.split('/').at(-1)!);
      if (!slot) return fail(404);
      slot.uploaded = true;
      return new Response(null, { status: 200 });
    }
    if (!path.startsWith('/api/v1/listings')) return fail(404);
    if (method !== 'GET') {
      if (!this.memberId) return fail(401);
      if (request.headers.get('X-CSRF-Token') !== 'test-csrf') return fail(403);
      if (this.memberId !== this.ownerId) return fail(404);
      if (!['draft', 'pending_review', 'rejected'].includes(this.listing.status)) return fail(409);
    } else if (this.listing.status !== 'active' && this.memberId !== this.ownerId) return fail(404);
    if (path === '/api/v1/listings') {
      if (method === 'POST') { Object.assign(this.listing, body); return Response.json(this.listing, { status: 201 }); }
      return Response.json({ items: [this.listing], nextCursor: null });
    }
    const parts = path.split('/').filter(Boolean);
    if (parts[3] !== this.listing.id) return fail(404);
    if (parts.length === 4) {
      if (method === 'PATCH') Object.assign(this.listing, body);
      return Response.json(this.listing);
    }
    if (parts[4] !== 'images') return fail(404);
    if (parts.length === 5 && method === 'GET') {
      if (this.listStatus !== 200) return fail(this.listStatus);
      this.listing.images = this.listing.images.map((image) => this.signed(image.id, image.sortOrder, image.altText ?? undefined)).sort((a, b) => a.sortOrder - b.sortOrder);
      return Response.json({ listingId: this.listing.id, images: this.listing.images });
    }
    if (parts[5] === 'uploads' && method === 'POST') {
      if (this.uploadStatus !== 201) return fail(this.uploadStatus);
      const replaceImageId = body?.replaceImageId as string | undefined;
      const previous = this.listing.images.find((image) => image.id === replaceImageId);
      if (replaceImageId && !previous) return fail(404);
      const sortOrder = body?.sortOrder ?? previous?.sortOrder;
      if (!Number.isInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 11) return fail(400);
      if (previous && sortOrder !== previous.sortOrder) return fail(409);
      if (!previous && this.listing.images.length + [...this.slots.values()].filter((slot) => !slot.replaceImageId).length >= 12) return fail(409, 'IMAGE_LIMIT_EXCEEDED');
      if ((!previous && this.listing.images.some((image) => image.sortOrder === sortOrder)) || [...this.slots.values()].some((slot) => slot.sortOrder === sortOrder)) return fail(409);
      const imageId = randomUUID();
      this.slots.set(imageId, { sortOrder: Number(sortOrder), replaceImageId, uploaded: false, altText: body?.altText as string | undefined });
      return Response.json({ imageId, uploadUrl: `https://storage.fixture.invalid/upload/${imageId}`, expiresAt: new Date(Date.now() + (this.expireUpload ? -1000 : 7_200_000)).toISOString() }, { status: 201 });
    }
    const imageId = parts[5];
    if (method === 'DELETE') {
      if (this.cleanupStatus !== 204) return fail(this.cleanupStatus);
      this.slots.delete(imageId);
      this.listing.images = this.listing.images.filter((image) => image.id !== imageId);
      return new Response(null, { status: 204 });
    }
    if (parts[6] === 'complete' && method === 'POST') {
      if (this.dropCompleteRequest) { this.dropCompleteRequest = false; throw new TypeError('request lost'); }
      if (this.completeStatus !== 200) return fail(this.completeStatus);
      const slot = this.slots.get(imageId);
      if (!slot) return fail(409);
      if (!slot.uploaded) return fail(409, 'IMAGE_UPLOAD_INCOMPLETE');
      this.listing.images = this.listing.images.filter((image) => image.id !== slot.replaceImageId);
      this.listing.images.push(this.signed(imageId, slot.sortOrder, slot.altText));
      this.listing.images.sort((a, b) => a.sortOrder - b.sortOrder);
      this.slots.delete(imageId);
      if (this.failListAfterComplete) this.listStatus = 503;
      if (this.loseCompleteResponse) { this.loseCompleteResponse = false; throw new TypeError('response lost'); }
      return Response.json({ imageId, state: 'ready' });
    }
    return fail(404);
  };
}
