import { PortfolioPreview } from '@/components/preview/PortfolioPreview';

export default async function PortfolioPreviewBPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const query = await searchParams;
  return (
    <PortfolioPreview
      initialTheme={query.theme === 'dark' ? 'dark' : 'light'}
      variant="b"
    />
  );
}
