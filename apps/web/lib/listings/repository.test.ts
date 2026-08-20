import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeSearchTerm, formatListingLabel, parseListingFilters } from './repository';

test('parseListingFilters keeps supported values and ignores unknown filters', () => {
  assert.deepEqual(
    parseListingFilters({
      sport: 'surf',
      category: 'equipment',
      search: '  shortboard 6.0  ',
    }),
    { sport: 'surf', category: 'equipment', search: 'shortboard 6.0' },
  );

  assert.deepEqual(parseListingFilters({ sport: 'snowboard', category: 'unknown' }), {});
});

test('search terms are bounded and cannot change the PostgREST OR expression', () => {
  assert.equal(escapeSearchTerm(' Channel%,surf,(new) '), 'Channel\\% surf new');
  assert.equal(escapeSearchTerm('x'.repeat(200)).length, 120);
});

test('formatListingLabel turns stored enum values into readable labels', () => {
  assert.equal(formatListingLabel('like_new'), 'Like New');
  assert.equal(formatListingLabel('equipment'), 'Equipment');
});
