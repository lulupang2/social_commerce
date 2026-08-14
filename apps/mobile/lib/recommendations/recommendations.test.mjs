import assert from 'node:assert/strict';
import test from 'node:test';

import { generateRecommendations } from './engine.ts';
import { RuleBasedRecommendationProvider } from './provider.ts';

const mockAsOf = '2026-08-14T10:00:00.000Z';
const mockSkiSportId = '11111111-1111-4111-8111-111111111111';
const mockHockeySportId = '22222222-2222-4222-8222-222222222222';

test('missing preferences: falls back gracefully to recent_fallback or popular_fallback', () => {
  const input = {
    profileSports: [],
    listings: [
      {
        listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sportId: mockSkiSportId,
        sport: 'ski',
        status: 'active',
        condition: 'like_new',
        createdAt: '2026-08-14T08:00:00.000Z',
        favoriteCount: 5,
        details: { sport: 'ski' },
      },
    ],
    asOf: mockAsOf,
  };

  const result = generateRecommendations(input);
  assert.equal(result.source, 'rules');
  assert.equal(result.label, '맞춤 추천');
  assert.equal(result.items.length, 1);
  assert.ok(
    result.items[0].reasonCodes.includes('recent_fallback') ||
      result.items[0].reasonCodes.includes('popular_fallback'),
  );
  assert.ok(result.items[0].reasonText.length > 0);
});

test('incompatible equipment: excludes handedness mismatch and extreme skill difference', () => {
  const profileSports = [
    {
      sportId: mockHockeySportId,
      skillLevel: 'beginner',
      preferences: {
        handedness: 'left',
      },
    },
  ];

  const listings = [
    {
      // Incompatible due to handedness mismatch (profile: left, listing: right)
      listingId: '11111111-1111-4111-8111-111111111111',
      sportId: mockHockeySportId,
      sport: 'hockey',
      status: 'active',
      condition: 'good',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 1,
      details: {
        sport: 'hockey',
        handedness: 'right',
      },
    },
    {
      // Compatible hockey stick
      listingId: '22222222-2222-4222-8222-222222222222',
      sportId: mockHockeySportId,
      sport: 'hockey',
      status: 'active',
      condition: 'like_new',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 2,
      details: {
        sport: 'hockey',
        handedness: 'left',
        skillLevel: 'beginner',
      },
    },
    {
      // Incompatible due to extreme skill gap (beginner vs expert)
      listingId: '33333333-3333-4333-8333-333333333333',
      sportId: mockHockeySportId,
      sport: 'hockey',
      status: 'active',
      condition: 'like_new',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 0,
      details: {
        sport: 'hockey',
        handedness: 'left',
        skillLevel: 'expert',
      },
    },
  ];

  const result = generateRecommendations({
    profileSports,
    listings,
    asOf: mockAsOf,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].listingId, '22222222-2222-4222-8222-222222222222');
  assert.ok(result.items[0].reasonCodes.includes('sport_match'));
  assert.ok(result.items[0].reasonCodes.includes('skill_match'));
  assert.ok(result.items[0].reasonCodes.includes('preference_match'));
});

test('ties: orders by score desc, createdAt desc, then listingId asc', () => {
  const profileSports = [
    {
      sportId: mockSkiSportId,
      skillLevel: 'intermediate',
    },
  ];

  const listings = [
    {
      listingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sportId: mockSkiSportId,
      sport: 'ski',
      status: 'active',
      condition: 'good',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 0,
      details: { sport: 'ski' },
    },
    {
      listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sportId: mockSkiSportId,
      sport: 'ski',
      status: 'active',
      condition: 'good',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 0,
      details: { sport: 'ski' },
    },
    {
      listingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sportId: mockSkiSportId,
      sport: 'ski',
      status: 'active',
      condition: 'good',
      createdAt: '2026-08-14T09:00:00.000Z',
      favoriteCount: 0,
      details: { sport: 'ski' },
    },
  ];

  const result1 = generateRecommendations({ profileSports, listings, asOf: mockAsOf });
  const result2 = generateRecommendations({ profileSports, listings, asOf: mockAsOf });

  assert.deepEqual(result1, result2);

  const orderedIds = result1.items.map((i) => i.listingId);
  assert.deepEqual(orderedIds, [
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ]);
});

test('malformed details: handles unexpected types safely without crash', () => {
  const profileSports = [
    {
      sportId: mockSkiSportId,
      sizePreferences: { bootMondopointMm: 275 },
    },
  ];

  const listings = [
    {
      listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sportId: mockSkiSportId,
      sport: 'ski',
      status: 'active',
      condition: 'new',
      createdAt: '2026-08-14T08:00:00.000Z',
      favoriteCount: 0,
      details: {
        sport: 'ski',
        bootMondopointMm: 'not-a-number',
        skillLevel: null,
        discipline: 12345,
      },
    },
  ];

  assert.doesNotThrow(() => {
    const result = generateRecommendations({ profileSports, listings, asOf: mockAsOf });
    assert.equal(result.items.length, 1);
  });
});

test('RuleBasedRecommendationProvider adapter works end-to-end with domain objects', async () => {
  const provider = new RuleBasedRecommendationProvider();

  const mockMobileListings = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sportId: mockSkiSportId,
      sellerId: 'seller-1',
      sport: 'ski',
      title: 'Ski boots',
      description: 'Good condition',
      price: { amount: 200000, currency: 'KRW' },
      location: { region: 'Seoul', city: 'Gangnam' },
      images: [],
      category: 'equipment',
      condition: 'like_new',
      status: 'active',
      favoriteCount: 3,
      details: { sport: 'ski', bootMondopointMm: 270, skillLevel: 'intermediate' },
      createdAt: '2026-08-14T08:00:00.000Z',
      updatedAt: '2026-08-14T08:00:00.000Z',
    },
  ];

  const mockProfileSports = [
    {
      sportId: mockSkiSportId,
      skillLevel: 'intermediate',
      sizePreferences: { bootMondopointMm: 275 },
    },
  ];

  const result = await provider.recommendForListings(
    mockMobileListings,
    mockProfileSports,
    mockAsOf,
  );

  assert.equal(result.source, 'rules');
  assert.equal(result.items.length, 1);
  assert.ok(result.items[0].reasonCodes.includes('sport_match'));
  assert.ok(result.items[0].reasonCodes.includes('skill_match'));
  assert.ok(result.items[0].reasonCodes.includes('size_match'));
});
