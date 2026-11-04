import TrackForm from './TrackForm';

export const metadata = { title: 'Tra cứu đơn hàng' };

export default function TrackPage({ searchParams }: { searchParams: { ma?: string } }) {
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>Tra cứu đơn hàng</h1>
      <TrackForm initialCode={(searchParams.ma ?? '').slice(0, 30)} />
    </div>
  );
}
