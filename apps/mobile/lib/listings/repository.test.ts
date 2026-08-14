import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createListingRepository } from './repository.ts';

const VALID_SELLER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_LISTING_ID = '22222222-2222-4222-8222-222222222222';
const VALID_SPORT_ID = '33333333-3333-4333-8333-333333333333';

test('createListingRepository listActive maps active listings using signed URLs', async () => {
  const mockClient = {
    from(tableName: string) {
      assert.equal(tableName, 'listings');
      return {
        select(cols: string) {
          assert.equal(cols.includes('listing_images'), true);
          return {
            eq(field: string, value: string) {
              assert.equal(field, 'status');
              assert.equal(value, 'active');
              return {
                order(orderField: string, opts: { ascending: boolean }) {
                  assert.equal(orderField, 'created_at');
                  assert.equal(opts.ascending, false);
                  return Promise.resolve({
                    data: [
                      {
                        id: VALID_LISTING_ID,
                        seller_id: VALID_SELLER_ID,
                        sport_id: VALID_SPORT_ID,
                        category: 'equipment',
                        title: 'All Mountain Skis',
                        description: 'Great condition skis',
                        price: 350,
                        currency: 'USD',
                        condition: 'good',
                        status: 'active',
                        details: { sport: 'ski', lengthCm: 172 },
                        location_text: 'Denver, CO, USA',
                        created_at: '2026-08-14T10:00:00.000Z',
                        updated_at: '2026-08-14T10:00:00.000Z',
                        sports: { slug: 'ski' },
                        listing_images: [
                          {
                            storage_path: `${VALID_SELLER_ID}/${VALID_LISTING_ID}/ski1.jpg`,
                            alt_text: 'Front view',
                            sort_order: 0,
                          },
                        ],
                      },
                    ],
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucketName: string) {
        assert.equal(bucketName, 'listing-images');
        return {
          async createSignedUrls(paths: string[], expiresIn: number) {
            assert.equal(expiresIn, 600);
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://storage.example.com/signed/${path}?token=abc`,
                error: null,
              })),
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const repo = createListingRepository(mockClient);
  const result = await repo.listActive();

  assert.equal(result.error, null);
  assert.notEqual(result.data, null);
  assert.equal(result.data?.length, 1);
  const listing = result.data![0];
  assert.equal(listing.id, VALID_LISTING_ID);
  assert.equal(listing.images.length, 1);
  assert.equal(listing.images[0].url.includes('https://storage.example.com/signed/'), true);
  assert.notEqual(listing.images[0].expiresAt, undefined);
});

test('createListingRepository getActiveById returns single listing with signed image URLs', async () => {
  const mockClient = {
    from(tableName: string) {
      assert.equal(tableName, 'listings');
      return {
        select() {
          return {
            eq(field: string, value: string) {
              if (field === 'id') assert.equal(value, VALID_LISTING_ID);
              if (field === 'status') assert.equal(value, 'active');
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: VALID_LISTING_ID,
                  seller_id: VALID_SELLER_ID,
                  sport_id: VALID_SPORT_ID,
                  category: 'equipment',
                  title: 'All Mountain Skis',
                  description: 'Great condition skis',
                  price: 350,
                  currency: 'USD',
                  condition: 'good',
                  status: 'active',
                  details: { sport: 'ski', lengthCm: 172 },
                  location_text: 'Denver, CO, USA',
                  created_at: '2026-08-14T10:00:00.000Z',
                  updated_at: '2026-08-14T10:00:00.000Z',
                  sports: { slug: 'ski' },
                  listing_images: [
                    {
                      storage_path: `${VALID_SELLER_ID}/${VALID_LISTING_ID}/ski1.jpg`,
                      alt_text: 'Front view',
                      sort_order: 0,
                    },
                  ],
                },
                error: null,
              });
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          async createSignedUrls(paths: string[]) {
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://storage.example.com/signed/${path}`,
                error: null,
              })),
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const repo = createListingRepository(mockClient);
  const result = await repo.getActiveById(VALID_LISTING_ID);

  assert.equal(result.error, null);
  assert.notEqual(result.data, null);
  assert.equal(result.data?.id, VALID_LISTING_ID);
  assert.equal(
    result.data?.images[0].url,
    `https://storage.example.com/signed/${VALID_SELLER_ID}/${VALID_LISTING_ID}/ski1.jpg`,
  );
});

test('createListingRepository create rolls back draft listing if image row insertion fails', async () => {
  let deletedListingId: string | null = null;

  const mockClient = {
    auth: {
      async getUser() {
        return { data: { user: { id: VALID_SELLER_ID } }, error: null };
      },
    },
    from(tableName: string) {
      if (tableName === 'sports') {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({ data: { id: VALID_SPORT_ID }, error: null });
              },
            };
          },
        };
      }
      if (tableName === 'listings') {
        return {
          insert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: {
                        id: VALID_LISTING_ID,
                        seller_id: VALID_SELLER_ID,
                        sport_id: VALID_SPORT_ID,
                        category: 'equipment',
                        title: 'Draft Ski',
                        description: 'Draft description',
                        price: 200,
                        currency: 'USD',
                        condition: 'new',
                        status: 'draft',
                        created_at: '2026-08-14T10:00:00.000Z',
                        updated_at: '2026-08-14T10:00:00.000Z',
                        sports: { slug: 'ski' },
                      },
                      error: null,
                    });
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq(field: string, id: string) {
                if (field === 'id') deletedListingId = id;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (tableName === 'listing_images') {
        return {
          async insert() {
            // Simulate error attaching image rows
            return { error: { message: 'FK violation' } };
          },
        };
      }
      throw new Error(`Unexpected table ${tableName}`);
    },
  } as unknown as SupabaseClient;

  const repo = createListingRepository(mockClient);
  const result = await repo.create({
    sport: 'ski',
    category: 'equipment',
    title: 'Draft Ski',
    description: 'A nice ski',
    price: 200,
    condition: 'new',
    details: { sport: 'ski' },
    images: ['https://example.com/test.jpg'],
  });

  assert.equal(result.data, null);
  assert.notEqual(result.error, null);
  assert.equal(result.error?.code, 'request_failed');
  assert.equal(deletedListingId, VALID_LISTING_ID);
});
