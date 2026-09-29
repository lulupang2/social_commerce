import { PortfolioPreview } from '@/components/preview/PortfolioPreview';

export default async function PortfolioPreviewAPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const query = await searchParams;
  return (
    <PortfolioPreview
      initialTheme={query.theme === 'dark' ? 'dark' : 'light'}
      variant="a"
    />
  );
}
