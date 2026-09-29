import { notFound } from 'next/navigation';

import { PortfolioProductDetail } from '@/components/preview/PortfolioProductDetail';
import {
  getPortfolioPreviewListing,
  PORTFOLIO_PREVIEW_FEATURED,
} from '@/lib/data/portfolio-preview-data';

export default async function PortfolioPreviewAProductPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; theme?: string }>;
}) {
  const query = await searchParams;
  const listing = getPortfolioPreviewListing(
    query.id ?? PORTFOLIO_PREVIEW_FEATURED.id,
  );
  if (!listing) notFound();

  return (
    <PortfolioProductDetail
      initialTheme={query.theme === 'dark' ? 'dark' : 'light'}
      listing={listing}
      variant="a"
    />
  );
}
