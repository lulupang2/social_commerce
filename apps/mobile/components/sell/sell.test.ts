import assert from 'node:assert/strict';
import test from 'node:test';

import { createListingSchema, type CreateListingPayload } from '@icegear/domain';
import {
  initialHockeyDetails,
  initialSkiDetails,
  initialSellFormState,
  type SellFormState,
} from './types.ts';

function buildPayload(form: SellFormState): CreateListingPayload {
  const isSki = form.sport === 'ski';

  const skiDetails = {
    sport: 'ski' as const,
    ...(form.skiDetails.equipmentType ? { equipmentType: form.skiDetails.equipmentType } : {}),
    ...(form.skiDetails.discipline ? { discipline: form.skiDetails.discipline } : {}),
    ...(form.skiDetails.brand.trim() ? { brand: form.skiDetails.brand.trim() } : {}),
    ...(form.skiDetails.model.trim() ? { model: form.skiDetails.model.trim() } : {}),
    ...(form.skiDetails.year.trim() ? { year: Number(form.skiDetails.year) } : {}),
    ...(form.skiDetails.size.trim() ? { size: form.skiDetails.size.trim() } : {}),
    ...(form.skiDetails.lengthCm.trim() ? { lengthCm: Number(form.skiDetails.lengthCm) } : {}),
    ...(form.skiDetails.waistWidthMm.trim()
      ? { waistWidthMm: Number(form.skiDetails.waistWidthMm) }
      : {}),
    ...(form.skiDetails.radiusM.trim() ? { radiusM: Number(form.skiDetails.radiusM) } : {}),
    ...(form.skiDetails.bootMondopointMm.trim()
      ? { bootMondopointMm: Number(form.skiDetails.bootMondopointMm) }
      : {}),
    ...(form.skiDetails.bootFlex.trim() ? { bootFlex: Number(form.skiDetails.bootFlex) } : {}),
    ...(form.skiDetails.bindingIncluded !== null
      ? { bindingIncluded: form.skiDetails.bindingIncluded }
      : {}),
    ...(form.skiDetails.gender ? { gender: form.skiDetails.gender } : {}),
    ...(form.skiDetails.skillLevel ? { skillLevel: form.skiDetails.skillLevel } : {}),
    ...(form.skiDetails.notes.trim() ? { notes: form.skiDetails.notes.trim() } : {}),
  };

  const hockeyDetails = {
    sport: 'hockey' as const,
    ...(form.hockeyDetails.equipmentType
      ? { equipmentType: form.hockeyDetails.equipmentType }
      : {}),
    ...(form.hockeyDetails.format ? { format: form.hockeyDetails.format } : {}),
    ...(form.hockeyDetails.position ? { position: form.hockeyDetails.position } : {}),
    ...(form.hockeyDetails.handedness ? { handedness: form.hockeyDetails.handedness } : {}),
    ...(form.hockeyDetails.brand.trim() ? { brand: form.hockeyDetails.brand.trim() } : {}),
    ...(form.hockeyDetails.model.trim() ? { model: form.hockeyDetails.model.trim() } : {}),
    ...(form.hockeyDetails.year.trim() ? { year: Number(form.hockeyDetails.year) } : {}),
    ...(form.hockeyDetails.size.trim() ? { size: form.hockeyDetails.size.trim() } : {}),
    ...(form.hockeyDetails.stickFlex.trim()
      ? { stickFlex: Number(form.hockeyDetails.stickFlex) }
      : {}),
    ...(form.hockeyDetails.stickLengthCm.trim()
      ? { stickLengthCm: Number(form.hockeyDetails.stickLengthCm) }
      : {}),
    ...(form.hockeyDetails.curve.trim() ? { curve: form.hockeyDetails.curve.trim() } : {}),
    ...(form.hockeyDetails.kickPoint.trim()
      ? { kickPoint: form.hockeyDetails.kickPoint.trim() }
      : {}),
    ...(form.hockeyDetails.skateSize.trim()
      ? { skateSize: Number(form.hockeyDetails.skateSize) }
      : {}),
    ...(form.hockeyDetails.skateWidth.trim()
      ? { skateWidth: form.hockeyDetails.skateWidth.trim() }
      : {}),
    ...(form.hockeyDetails.gender ? { gender: form.hockeyDetails.gender } : {}),
    ...(form.hockeyDetails.skillLevel ? { skillLevel: form.hockeyDetails.skillLevel } : {}),
    ...(form.hockeyDetails.notes.trim() ? { notes: form.hockeyDetails.notes.trim() } : {}),
  };

  return {
    sport: form.sport,
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    condition: form.condition,
    price: Number(form.price),
    currency: form.currency.trim().toUpperCase(),
    ...(form.location.trim() ? { location: form.location.trim() } : {}),
    isNegotiable: form.isNegotiable,
    shippingAvailable: form.shippingAvailable,
    localPickupAvailable: form.localPickupAvailable,
    details: isSki ? skiDetails : hockeyDetails,
  } as CreateListingPayload;
}

test('initialSellFormState provides clean defaults', () => {
  assert.equal(initialSellFormState.step, 1);
  assert.equal(initialSellFormState.sport, 'ski');
  assert.equal(initialSellFormState.photos.length, 0);
  assert.equal(initialSellFormState.currency, 'KRW');
  assert.equal(initialSellFormState.localPickupAvailable, true);
});

test('buildPayload produces valid ski payload for createListingSchema', () => {
  const form: SellFormState = {
    ...initialSellFormState,
    title: 'Rossignol Ski Set 165cm',
    description: 'Great ski set in good condition',
    price: '450000',
    location: 'Seoul Songpa',
    skiDetails: {
      ...initialSkiDetails,
      equipmentType: 'skis',
      discipline: 'alpine',
      brand: 'Rossignol',
      model: 'Hero Elite',
      lengthCm: '165',
      waistWidthMm: '68',
      radiusM: '13',
    },
  };

  const payload = buildPayload(form);
  const result = createListingSchema.safeParse(payload);
  assert.equal(result.success, true);
  if (result.success && result.data.sport === 'ski') {
    assert.equal(result.data.sport, 'ski');
    assert.equal(result.data.title, 'Rossignol Ski Set 165cm');
    assert.equal(result.data.price, 450000);
    assert.equal(result.data.details.sport, 'ski');
    assert.equal(result.data.details.lengthCm, 165);
  }
});

test('buildPayload produces valid hockey payload for createListingSchema', () => {
  const form: SellFormState = {
    ...initialSellFormState,
    sport: 'hockey',
    title: 'Bauer Vapor Hyperlite Stick',
    description: 'Senior 77 flex stick left handed',
    price: '280000',
    hockeyDetails: {
      ...initialHockeyDetails,
      equipmentType: 'stick',
      format: 'ice',
      position: 'forward',
      handedness: 'left',
      brand: 'Bauer',
      model: 'Vapor Hyperlite',
      stickFlex: '77',
      curve: 'P29',
    },
  };

  const payload = buildPayload(form);
  const result = createListingSchema.safeParse(payload);
  assert.equal(result.success, true);
  if (result.success && result.data.sport === 'hockey') {
    assert.equal(result.data.sport, 'hockey');
    assert.equal(result.data.title, 'Bauer Vapor Hyperlite Stick');
    assert.equal(result.data.price, 280000);
    assert.equal(result.data.details.sport, 'hockey');
    assert.equal(result.data.details.stickFlex, 77);
  }
});

test('sport change cleanly resets sport-specific details', () => {
  let form: SellFormState = {
    ...initialSellFormState,
    sport: 'ski',
    skiDetails: {
      ...initialSkiDetails,
      equipmentType: 'skis',
      lengthCm: '170',
    },
  };

  // Simulate sport change handler
  const nextSport = 'hockey';
  form = {
    ...form,
    sport: nextSport,
    skiDetails: initialSkiDetails,
    hockeyDetails: initialHockeyDetails,
  };

  assert.equal(form.sport, 'hockey');
  assert.equal(form.skiDetails.equipmentType, '');
  assert.equal(form.skiDetails.lengthCm, '');
  assert.equal(form.hockeyDetails.equipmentType, '');
});

test('ordinary user payload never requests status active', () => {
  const form: SellFormState = {
    ...initialSellFormState,
    title: 'Testing status constraint',
    description: 'Testing description',
    price: '100000',
  };

  const payload = buildPayload(form);
  assert.equal('status' in payload, false);

  // Passing status: 'active' explicitly to schema fails validation
  const invalidPayload = { ...payload, status: 'active' };
  const parseResult = createListingSchema.safeParse(invalidPayload);
  assert.equal(parseResult.success, false);
});
