export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return (
    <main className="shell">
      <p className="eyebrow">IceGear / health</p>
      <h1>OK</h1>
      <p className="lede">The web server rendered this health page successfully.</p>
      <p className="timestamp">Checked at {new Date().toISOString()}</p>
    </main>
  );
}
