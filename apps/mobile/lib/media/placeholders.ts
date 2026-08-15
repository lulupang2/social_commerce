/**
 * Curated high-resolution placeholder images for winter sports equipment
 * and gear categories when real user photos are not yet uploaded.
 * All URLs are verified and responsive.
 */

export interface PlaceholderOptions {
  sport?: string | null;
  category?: string | null;
  title?: string | null;
}

const SKI_IMAGES = {
  skis: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&auto=format&fit=crop&q=80',
  boots:
    'https://images.unsplash.com/photo-1548777123-e216912df7d8?w=800&auto=format&fit=crop&q=80',
  helmet:
    'https://images.unsplash.com/photo-1565992441121-4367c2967103?w=800&auto=format&fit=crop&q=80',
  apparel:
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop&q=80',
  mountain:
    'https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800&auto=format&fit=crop&q=80',
  default:
    'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&auto=format&fit=crop&q=80',
};

const HOCKEY_IMAGES = {
  skates:
    'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=800&auto=format&fit=crop&q=80',
  stick:
    'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=800&auto=format&fit=crop&q=80',
  helmet:
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&auto=format&fit=crop&q=80',
  default:
    'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=800&auto=format&fit=crop&q=80',
};

const FALLBACK_SPORTS_IMAGE =
  'https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800&auto=format&fit=crop&q=80';

/**
 * Returns a deterministic, contextually matching placeholder photo URL
 * for ski and ice hockey marketplace listings.
 */
export function getListingPlaceholderImage(options: PlaceholderOptions): string {
  const sport = options.sport?.toLowerCase() || '';
  const title = options.title?.toLowerCase() || '';
  const category = options.category?.toLowerCase() || '';

  const isHockey =
    sport.includes('hockey') ||
    sport.includes('하키') ||
    title.includes('하키') ||
    title.includes('hockey') ||
    title.includes('스케이트') ||
    title.includes('skate') ||
    title.includes('stick') ||
    title.includes('bauer') ||
    title.includes('ccm');

  if (isHockey) {
    if (
      title.includes('헬멧') ||
      title.includes('helmet') ||
      title.includes('보호') ||
      category.includes('protection')
    ) {
      return HOCKEY_IMAGES.helmet;
    }
    return HOCKEY_IMAGES.default;
  }

  // Ski & general winter gear
  if (
    title.includes('부츠') ||
    title.includes('boot') ||
    title.includes('바인딩') ||
    title.includes('binding')
  ) {
    return SKI_IMAGES.boots;
  }
  if (
    title.includes('헬멧') ||
    title.includes('고글') ||
    title.includes('goggle') ||
    title.includes('helmet')
  ) {
    return SKI_IMAGES.helmet;
  }
  if (title.includes('의류') || title.includes('자켓') || category.includes('apparel')) {
    return SKI_IMAGES.apparel;
  }
  if (
    sport.includes('ski') ||
    sport.includes('스키') ||
    title.includes('ski') ||
    title.includes('스키') ||
    title.includes('salomon') ||
    title.includes('atomic') ||
    title.includes('head')
  ) {
    return SKI_IMAGES.skis;
  }

  return FALLBACK_SPORTS_IMAGE;
}
