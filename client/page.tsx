import SalesGeniusStream from '@/components/salesgenius-stream';

export const metadata = {
  title: 'SalesGenius Live - AI Sales Assistant',
  description: 'Real-time AI-powered sales suggestions during your calls',
};

export default function StreamPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900">
      <div className="container mx-auto px-4 py-8">
        <SalesGeniusStream />
      </div>
    </main>
  );
}
