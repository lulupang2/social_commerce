import Link from 'next/link';

import { isSupabaseConfigured } from '../lib/supabase/config';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const hasSupabaseConfig = isSupabaseConfigured();

  return (
    <main className="shell">
      <p className="eyebrow">IceGear</p>
      <h1>Gear for your next session.</h1>
      <p className="lede">
        Browse community listings for ski and hockey equipment, apparel, and accessories.
      </p>
      <div className="actions">
        <Link className="button" href="/market">
          Browse marketplace
        </Link>
        <Link className="button button-secondary" href="/health">
          Check health
        </Link>
      </div>
      <p className={`config-status ${hasSupabaseConfig ? 'config-ready' : 'config-missing'}`}>
        {hasSupabaseConfig
          ? 'Marketplace data connection is available.'
          : 'Marketplace is not configured yet. Add the public Supabase variables to load listings.'}
      </p>
    </main>
  );
}
