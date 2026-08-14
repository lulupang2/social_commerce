import type {
  Gender,
  HockeyEquipmentType,
  HockeyFormat,
  HockeyPosition,
  Handedness,
  ListingCategory,
  ListingCondition,
  SkiDiscipline,
  SkiEquipmentType,
  SkillLevel,
  Sport,
} from '@icegear/domain';
import type { ValidatedMediaAsset } from '../../lib/media/types';

export type SellStep = 1 | 2 | 3 | 4 | 5;

export interface SkiDetailsState {
  equipmentType: SkiEquipmentType | '';
  discipline: SkiDiscipline | '';
  brand: string;
  model: string;
  year: string;
  size: string;
  lengthCm: string;
  waistWidthMm: string;
  radiusM: string;
  bootMondopointMm: string;
  bootFlex: string;
  bindingIncluded: boolean | null;
  gender: Gender | '';
  skillLevel: SkillLevel | '';
  notes: string;
}

export interface HockeyDetailsState {
  equipmentType: HockeyEquipmentType | '';
  format: HockeyFormat | '';
  position: HockeyPosition | '';
  handedness: Handedness | '';
  brand: string;
  model: string;
  year: string;
  size: string;
  stickFlex: string;
  stickLengthCm: string;
  curve: string;
  kickPoint: string;
  skateSize: string;
  skateWidth: string;
  gender: Gender | '';
  skillLevel: SkillLevel | '';
  notes: string;
}

export interface SellFormState {
  step: SellStep;
  photos: ValidatedMediaAsset[];
  photoError: string | null;
  permissionDenied: boolean;
  sport: Sport;
  title: string;
  description: string;
  category: ListingCategory;
  condition: ListingCondition;
  price: string;
  currency: string;
  location: string;
  isNegotiable: boolean;
  shippingAvailable: boolean;
  localPickupAvailable: boolean;
  skiDetails: SkiDetailsState;
  hockeyDetails: HockeyDetailsState;
}

export const initialSkiDetails: SkiDetailsState = {
  equipmentType: '',
  discipline: '',
  brand: '',
  model: '',
  year: '',
  size: '',
  lengthCm: '',
  waistWidthMm: '',
  radiusM: '',
  bootMondopointMm: '',
  bootFlex: '',
  bindingIncluded: null,
  gender: '',
  skillLevel: '',
  notes: '',
};

export const initialHockeyDetails: HockeyDetailsState = {
  equipmentType: '',
  format: '',
  position: '',
  handedness: '',
  brand: '',
  model: '',
  year: '',
  size: '',
  stickFlex: '',
  stickLengthCm: '',
  curve: '',
  kickPoint: '',
  skateSize: '',
  skateWidth: '',
  gender: '',
  skillLevel: '',
  notes: '',
};

export const initialSellFormState: SellFormState = {
  step: 1,
  photos: [],
  photoError: null,
  permissionDenied: false,
  sport: 'ski',
  title: '',
  description: '',
  category: 'equipment',
  condition: 'good',
  price: '',
  currency: 'KRW',
  location: '',
  isNegotiable: false,
  shippingAvailable: false,
  localPickupAvailable: true,
  skiDetails: initialSkiDetails,
  hockeyDetails: initialHockeyDetails,
};
