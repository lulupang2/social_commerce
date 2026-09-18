export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return (
    <main className="shell">
      <p className="eyebrow">SummerGear / health</p>
      <h1>OK</h1>
      <p className="lede">SummerGear web rendered successfully.</p>
      <p className="timestamp">Checked at {new Date().toISOString()}</p>
    </main>
  );
}
