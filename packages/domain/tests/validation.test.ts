import assert from 'node:assert/strict';
import test from 'node:test';
import { createListingSchema, onboardingInputSchema, profileInputSchema } from '../src/index.js';

test('createListingSchema accepts ski listings and keeps unknown client fields', () => {
  const result = createListingSchema.safeParse({
    sport: 'ski',
    category: 'equipment',
    condition: 'good',
    title: 'All-mountain skis',
    description: 'Skis used for one season.',
    price: { amount: 350, currency: 'usd' },
    details: {
      equipmentType: 'skis',
      discipline: 'alpine',
      lengthCm: 172,
    },
    clientVersion: 2,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sport, 'ski');
    assert.equal(result.data.details.lengthCm, 172);
    assert.equal(result.data.clientVersion, 2);
  }
});

test('createListingSchema rejects a mismatched sport detail discriminator', () => {
  const result = createListingSchema.safeParse({
    sport: 'hockey',
    category: 'equipment',
    condition: 'new',
    title: 'Ice hockey stick',
    description: 'Unused stick.',
    price: 100,
    details: {
      sport: 'ski',
      equipmentType: 'skis',
    },
  });

  assert.equal(result.success, false);
});

test('profile and onboarding schemas validate required identity and sport choices', () => {
  assert.equal(
    profileInputSchema.safeParse({
      displayName: 'Mina',
      preferredSports: ['ski'],
    }).success,
    true,
  );
  assert.equal(
    onboardingInputSchema.safeParse({
      name: 'Mina',
      favoriteSports: ['hockey'],
      acceptTerms: true,
    }).success,
    true,
  );
  assert.equal(onboardingInputSchema.safeParse({ displayName: 'Mina' }).success, false);
  assert.equal(
    profileInputSchema.safeParse({
      displayName: 'Mina',
      preferredSports: ['surfing'],
    }).success,
    false,
  );
});
