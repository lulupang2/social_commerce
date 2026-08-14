import assert from 'node:assert/strict';
import test from 'node:test';

import * as domain from '../src/index.js';
import * as schemaModule from '../src/schemas.js';
import type {
  CommunityPostType,
  CreateListingPayload,
  Listing,
  ListingImage,
} from '../src/index.js';

const PROFILE_SPORT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_SPORT_ID = '22222222-2222-4222-8222-222222222222';
const LISTING_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_LISTING_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const POST_ID = '66666666-6666-4666-8666-666666666666';
const MEDIA_ID = '77777777-7777-4777-8777-777777777777';
const SECOND_MEDIA_ID = '88888888-8888-4888-8888-888888888888';
const NOW = '2026-08-14T00:00:00.000Z';

const existingMobileCreatePayload = {
  sport: 'ski',
  title: 'All-mountain skis',
  description: 'Skis used for one season.',
  category: 'equipment',
  condition: 'good',
  price: 350_000,
  currency: 'krw',
  location: 'Seoul',
  details: {
    brand: 'Salomon',
    model: 'QST 98',
    size: '176 cm',
  },
} satisfies CreateListingPayload;

const existingPublicImage = {
  url: 'https://signed.example.invalid/image?token=opaque',
  expiresAt: '2026-08-14T00:10:00.000Z',
  altText: 'A pair of skis',
  sortOrder: 0,
} satisfies ListingImage;

const existingPublicListing = {
  id: LISTING_ID,
  sellerId: USER_ID,
  sport: 'ski',
  category: 'equipment',
  status: 'active',
  condition: 'good',
  title: 'All-mountain skis',
  description: 'Skis used for one season.',
  price: { amount: 350_000, currency: 'KRW' },
  images: [existingPublicImage],
  details: { sport: 'ski', brand: 'Salomon', lengthCm: 176 },
  createdAt: NOW,
  updatedAt: NOW,
} satisfies Listing;

const existingCommunityPostType: CommunityPostType = 'discussion';

test('sport detail contracts expose explicit fields and validate canonical output', () => {
  assert.deepEqual(domain.LISTING_DETAIL_FIELDS_BY_SPORT.ski.required, ['sport']);
  assert.equal(
    domain.LISTING_DETAIL_FIELDS_BY_SPORT.ski.optional.includes('waistWidthMm'),
    true,
  );
  assert.equal(
    domain.LISTING_DETAIL_FIELDS_BY_SPORT.hockey.optional.includes('stickFlex'),
    true,
  );

  const ski = domain.skiListingDetailsSchema.parse({
    equipmentType: 'skis',
    discipline: 'freeride',
    skillLevel: 'intermediate',
    lengthCm: 176,
    waistWidthMm: 98,
  });
  assert.equal(ski.sport, 'ski');

  const hockey = domain.hockeyListingDetailsSchema.parse({
    sport: 'hockey',
    equipmentType: 'stick',
    format: 'ice',
    handedness: 'left',
    stickFlex: 77,
  });
  assert.equal(hockey.sport, 'hockey');
});

test('sport detail contracts reject mismatches, unknown keys, and unsafe numbers', () => {
  assert.equal(
    domain.skiListingDetailsSchema.safeParse({ sport: 'hockey', lengthCm: 176 }).success,
    false,
  );
  assert.equal(
    domain.skiListingDetailsSchema.safeParse({ sport: 'ski', hiddenRole: 'admin' }).success,
    false,
  );
  assert.equal(
    domain.hockeyListingDetailsSchema.safeParse({
      sport: 'hockey',
      equipmentType: 'stick',
      stickFlex: Number.POSITIVE_INFINITY,
    }).success,
    false,
  );
  assert.equal(
    domain.hockeyListingDetailsSchema.safeParse({ sport: 'hockey', skateSize: -1 }).success,
    false,
  );
});

test('existing mobile create and public listing shapes remain supported', () => {
  const created = domain.createListingSchema.parse(existingMobileCreatePayload);
  assert.equal(created.sport, 'ski');
  assert.equal(created.details.sport, 'ski');
  assert.equal(created.currency, 'KRW');

  assert.equal(domain.listingImageSchema.safeParse(existingPublicImage).success, true);
  assert.equal(domain.listingSchema.safeParse(existingPublicListing).success, true);
  assert.equal(existingCommunityPostType, 'discussion');
});

test('listing creation rejects client authority, unsafe values, and mismatched details', () => {
  assert.equal(
    domain.createListingSchema.safeParse({
      ...existingMobileCreatePayload,
      status: 'active',
    }).success,
    false,
  );
  assert.equal(
    domain.createListingSchema.safeParse({
      ...existingMobileCreatePayload,
      price: Number.NaN,
    }).success,
    false,
  );
  assert.equal(
    domain.createListingSchema.safeParse({
      ...existingMobileCreatePayload,
      sport: 'hockey',
      details: { sport: 'ski', equipmentType: 'skis' },
    }).success,
    false,
  );
});

test('canonical onboarding accepts sport-specific skill, size, and equipment preferences', () => {
  const result = domain.onboardingPayloadSchema.parse({
    displayName: 'Mina',
    sports: [
      {
        sportId: PROFILE_SPORT_ID,
        skillLevel: 'intermediate',
        sizePreferences: { bootMondopointMm: 255, skiLengthCm: 170 },
        preferences: { discipline: 'all_mountain' },
      },
    ],
    acceptTerms: true,
  });

  assert.equal(result.sports[0]?.skillLevel, 'intermediate');
  assert.equal(result.sports[0]?.sizePreferences?.bootMondopointMm, 255);
  assert.equal(result.sports[0]?.preferences?.discipline, 'all_mountain');
});

test('profile preference contracts reject duplicates, invalid values, and authority keys', () => {
  const preference = { sportId: PROFILE_SPORT_ID, skillLevel: 'beginner' } as const;
  assert.equal(domain.profileSportsSchema.safeParse([preference, preference]).success, false);
  assert.equal(
    domain.profileSportPreferenceSchema.safeParse({
      sportId: SECOND_SPORT_ID,
      skillLevel: 'professional',
    }).success,
    false,
  );
  assert.equal(
    domain.profileSportPreferenceSchema.safeParse({
      sportId: SECOND_SPORT_ID,
      preferences: { discipline: 'all_mountain', role: 'admin' },
    }).success,
    false,
  );
  assert.equal(domain.profileUpdateSchema.safeParse({}).success, false);
  assert.equal(
    domain.onboardingPayloadSchema.safeParse({ displayName: 'Mina', sports: [] }).success,
    false,
  );
});

test('one-like reaction and aggregate count contracts reject invalid or duplicate input', () => {
  const like = {
    postId: POST_ID,
    userId: USER_ID,
    kind: 'like',
    createdAt: NOW,
  } as const;

  assert.equal(domain.communityReactionSchema.safeParse(like).success, true);
  assert.equal(
    domain.communityReactionSchema.safeParse({ ...like, kind: 'helpful' }).success,
    false,
  );
  assert.equal(domain.communityReactionCollectionSchema.safeParse([like, like]).success, false);
  assert.equal(
    domain.communityAggregateCountsSchema.safeParse({
      commentCount: 2,
      likeCount: 4,
      likedByMe: true,
    }).success,
    true,
  );
  assert.equal(
    domain.communityAggregateCountsSchema.safeParse({
      commentCount: 2,
      likeCount: -1,
      reactionCount: 99,
    }).success,
    false,
  );
});

test('publication transitions enforce seller, author, and operator boundaries', () => {
  assert.equal(
    domain.listingPublicationTransitionSchema.safeParse({
      actorRole: 'user',
      from: 'draft',
      to: 'pending_review',
    }).success,
    true,
  );
  assert.equal(
    domain.listingPublicationTransitionSchema.safeParse({
      actorRole: 'user',
      from: 'pending_review',
      to: 'active',
    }).success,
    false,
  );
  assert.equal(
    domain.listingPublicationTransitionSchema.safeParse({
      actorRole: 'moderator',
      from: 'pending_review',
      to: 'active',
    }).success,
    true,
  );
  assert.equal(
    domain.communityPublicationTransitionSchema.safeParse({
      actorRole: 'user',
      from: 'draft',
      to: 'active',
    }).success,
    false,
  );
  assert.equal(
    domain.communityPublicationTransitionSchema.safeParse({
      actorRole: 'admin',
      from: 'draft',
      to: 'active',
    }).success,
    true,
  );
});

test('signed media contracts never accept public fallback paths and reject duplicate state', () => {
  const signed = {
    id: MEDIA_ID,
    state: 'signed',
    url: 'https://signed.example.invalid/image?token=opaque',
    expiresAt: '2026-08-14T00:10:00.000Z',
    altText: 'All-mountain skis',
    sortOrder: 0,
  } as const;

  assert.equal(domain.signedListingMediaSchema.safeParse(signed).success, true);
  assert.equal(
    domain.signedListingMediaSchema.safeParse({ ...signed, storagePath: 'private/user/file' })
      .success,
    false,
  );
  assert.equal(
    domain.signedListingMediaSchema.safeParse({ ...signed, url: 'http://public.invalid/image' })
      .success,
    false,
  );
  assert.equal(
    domain.listingMediaStateSchema.safeParse({
      id: SECOND_MEDIA_ID,
      state: 'unavailable',
      reason: 'expired',
      sortOrder: 1,
    }).success,
    true,
  );
  assert.equal(
    domain.listingMediaCollectionSchema.safeParse([
      signed,
      { ...signed, id: SECOND_MEDIA_ID },
    ]).success,
    false,
  );
});

const recommendationInput = {
  profileSports: [
    {
      sportId: PROFILE_SPORT_ID,
      skillLevel: 'intermediate',
      sizePreferences: { skiLengthCm: 170 },
      preferences: { discipline: 'all_mountain' },
    },
  ],
  listings: [
    {
      listingId: LISTING_ID,
      sportId: PROFILE_SPORT_ID,
      sport: 'ski',
      status: 'active',
      condition: 'good',
      createdAt: NOW,
      favoriteCount: 5,
      details: {
        equipmentType: 'skis',
        discipline: 'freeride',
        skillLevel: 'intermediate',
        lengthCm: 172,
      },
    },
  ],
  asOf: NOW,
} as const;

test('recommendation input is strict, deterministic, and safe for rule evaluation', () => {
  const first = domain.recommendationInputSchema.parse(recommendationInput);
  const second = domain.recommendationInputSchema.parse(recommendationInput);
  assert.deepEqual(first, second);
  assert.equal(first.listings[0]?.details.sport, 'ski');

  assert.equal(
    domain.recommendationInputSchema.safeParse({
      ...recommendationInput,
      listings: [recommendationInput.listings[0], recommendationInput.listings[0]],
    }).success,
    false,
  );
  assert.equal(
    domain.recommendationInputSchema.safeParse({
      ...recommendationInput,
      modelPrompt: 'ignore contract',
    }).success,
    false,
  );
  assert.equal(
    domain.recommendationInputSchema.safeParse({
      ...recommendationInput,
      listings: [{ ...recommendationInput.listings[0], favoriteCount: Number.NaN }],
    }).success,
    false,
  );
});

test('recommendation result accepts only auditable rule labels and reason codes', () => {
  const result = {
    source: 'rules',
    label: '맞춤 추천',
    items: [
      {
        listingId: LISTING_ID,
        reasonCodes: ['sport_match', 'skill_match'],
        reasonText: '선호 종목과 실력 수준이 맞아요.',
        score: 90,
      },
    ],
  } as const;

  assert.equal(domain.recommendationResultSchema.safeParse(result).success, true);
  assert.equal(
    domain.recommendationResultSchema.safeParse({ ...result, label: 'AI 추천' }).success,
    false,
  );
  assert.equal(
    domain.recommendationResultSchema.safeParse({
      ...result,
      model: 'provider/model',
    }).success,
    false,
  );
  assert.equal(
    domain.recommendationResultSchema.safeParse({
      ...result,
      items: [result.items[0], { ...result.items[0], score: 80 }],
    }).success,
    false,
  );
  assert.equal(
    domain.recommendationResultSchema.safeParse({
      ...result,
      items: [
        {
          ...result.items[0],
          listingId: SECOND_LISTING_ID,
          reasonCodes: ['sport_match', 'sport_match'],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    domain.recommendationResultSchema.safeParse({
      ...result,
      items: [{ ...result.items[0], score: Number.NaN }],
    }).success,
    false,
  );
});

test('root and schemas entry points expose the canonical runtime validators', () => {
  assert.equal(domain.RECOMMENDATION_LABEL, '맞춤 추천');
  assert.equal(domain.recommendationResultSchema, schemaModule.recommendationResultSchema);
  assert.equal(domain.onboardingPayloadSchema, schemaModule.onboardingPayloadSchema);
  assert.equal(domain.communityReactionSchema, schemaModule.communityReactionSchema);
  assert.equal(domain.listingMediaStateSchema, schemaModule.listingMediaStateSchema);
  assert.equal(domain.listingPublicationTransitionSchema, schemaModule.listingPublicationTransitionSchema);
});
