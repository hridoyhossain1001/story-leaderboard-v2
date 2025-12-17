import { LeaderboardTable } from "@/components/LeaderboardTable";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white relative font-sans selection:bg-purple-500/30">

      {/* Background Noise/Gradient */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#1a103c,transparent_50%)]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 pt-10 pb-20">
        <header className="max-w-6xl mx-auto px-4 mb-16 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-purple-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Story Mainnet Live
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">
            Story IP <br className="md:hidden" /> Leaderboard
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Discover the most active intellectual property creators and collectors on the Story Protocol network.
          </p>
        </header>

        <LeaderboardTable />
      </div>
    </main>
  );
}
