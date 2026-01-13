import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Activity, Clock, CloudOff, Trophy } from 'lucide-react';

interface WalletDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    address: string;
    name: string;
    precalculatedStats?: Record<string, { count: number; volume: string }>;
}

const formatVol = (wei: bigint) => {
    const val = Number(wei) / 1e18;
    if (val === 0) return "0 IP";
    if (val < 0.01) return "<0.01 IP";
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " IP";
};

type TimeWindow = '24h' | '3d' | '7d' | '14d' | '30d' | '60d' | '90d' | 'all';

const API_BASE = 'https://www.storyscan.io/api/v2';

export function WalletDetailsModal({ isOpen, onClose, address, name, precalculatedStats }: WalletDetailsModalProps) {
    const [activeTab, setActiveTab] = useState<TimeWindow>('24h');
    const [stats, setStats] = useState<{ count: number; volume: string } | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // EFFECT 1: Fetch Data on Open (Only if needed)
    useEffect(() => {
        if (isOpen && address) {
            // If we have pre-calculated stats, we DON'T need to fetch history.
            // We trust the pre-calc is complete for all tabs.
            if (precalculatedStats) {
                setLoading(false);
                return;
            }

            // Otherwise, fetch history once.
            setTransactions([]);
            setStats(null);
            fetchHistory(address);
        }
    }, [isOpen, address]); // REMOVED activeTab

    // EFFECT 2: Update UI when Tab changes or Data arrives
    useEffect(() => {
        if (!isOpen) return;

        if (precalculatedStats && precalculatedStats[activeTab]) {
            setStats(precalculatedStats[activeTab]);
            setLoading(false);
        } else {
            // Fallback: Calculate from fetched transactions
            if (transactions.length > 0) {
                calculateStats();
            } else if (!loading && !precalculatedStats) {
                // No data yet
            }
        }
    }, [activeTab, precalculatedStats, transactions, isOpen, loading]);


    const calculateStats = () => {
        // ... (existing logic)
        const now = new Date();
        const timeWindows = {
            '24h': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '14d': 14 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '60d': 60 * 24 * 60 * 60 * 1000,
            '90d': 90 * 24 * 60 * 60 * 1000,
            'all': Infinity
        };

        const cutoffTime = activeTab === 'all' ? 0 : now.getTime() - timeWindows[activeTab];
        let currentCount = 0;
        let currentVolume = BigInt(0);

        for (const tx of transactions) {
            const txDate = new Date(tx.timestamp);
            if (txDate.getTime() >= cutoffTime) {
                currentCount++;
                const isContractInteraction = tx.to?.is_contract;
                const val = BigInt(tx.value || 0);
                if (isContractInteraction) {
                    currentVolume += val;
                }
            }
        }
        setStats({ count: currentCount, volume: formatVol(currentVolume) });
    };

    async function fetchHistory(addr: string) {
        setLoading(true);
        setError('');
        const allTxs: any[] = [];
        const ms90d = 90 * 24 * 60 * 60 * 1000;
        const now = new Date();

        try {
            let nextPageParams = '';
            let keepFetching = true;
            let totalFetched = 0;

            // Fetch up to 2000 txs or 90 days
            while (keepFetching && totalFetched < 2000) {
                // Ensure items_count=50 is always included
                const params = new URLSearchParams(nextPageParams);
                params.set('items_count', '50');

                const url = `${API_BASE}/addresses/${addr}/transactions?${params.toString()}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch history');

                const data = await res.json();
                const items = data.items || [];

                if (items.length === 0) break;

                for (const tx of items) {
                    const txDate = new Date(tx.timestamp);
                    // Optimization: stop pulling if we are way past 90d (safety check)
                    if (now.getTime() - txDate.getTime() > ms90d && activeTab !== 'all') {
                        // We might want to break here physically if we trust the API order
                        // But for safety, we just collect them.
                    }
                    allTxs.push(tx);
                }

                // PROGRESSIVE UPDATE: Show data immediately
                setTransactions([...allTxs]);
                setLoading(false);

                totalFetched += items.length;

                // Small breathing room for UI
                await new Promise(r => setTimeout(r, 10));

                if (data.next_page_params) {
                    // Flatten it specifically for URLSearchParams
                    const next = new URLSearchParams(data.next_page_params);
                    nextPageParams = next.toString();
                } else {
                    keepFetching = false;
                }
            }
            setTransactions(allTxs);
        } catch (err) {
            console.error(err);
            setError('Could not load full history.');
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 relative" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-8 border-b border-gray-800 pb-4">
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-500" />
                        {name}
                    </h2>
                    <p className="text-gray-500 text-sm font-mono break-all">{address}</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
                        <CloudOff className="w-4 h-4" />
                        {error}
                    </div>
                )}

                <div className="flex space-x-2 mb-6 bg-gray-900/50 p-1 rounded-lg">
                    {(['24h', '3d', '7d', '14d', '30d', '60d', '90d', 'all'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === tab
                                ? 'bg-purple-600 text-black shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {tab.toUpperCase()}
                        </button>
                    ))}
                </div>

                {loading && transactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                        <p className="text-gray-400 text-sm animate-pulse">Scanning blockchain history...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {stats ? (
                            <>
                                <StatCard
                                    label={activeTab === 'all' ? "Total Transactions" : `Last ${activeTab.replace('h', ' Hours').replace('d', ' Days')}`}
                                    value={stats.count.toLocaleString()}
                                    unit="TXS"
                                    icon={Clock}
                                    delay={0}
                                />
                                <StatCard
                                    label="Total Volume"
                                    value={stats.volume}
                                    icon={Trophy}
                                    delay={1}
                                />
                            </>
                        ) : (
                            <div className="col-span-full text-center text-gray-500 py-8">No data available for this period.</div>
                        )}
                    </div>
                )}

                {!loading && stats && (
                    <div className="mt-6 pt-4 border-t border-gray-800 text-center">
                        <p className="text-xs text-gray-600">
                            Volume counts only <strong>Contract Interactions</strong> (dApps, Minting, etc). Wallet transfers excluded.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, unit, subValue, icon: Icon, delay }: { label: string, value: string | number, unit?: string, subValue?: string, icon: any, delay: number }) {
    return (
        <div
            className="bg-gray-900/50 border border-gray-800 p-5 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition-all duration-300 group"
            style={{ animationDelay: `${delay * 75}ms` }}
        >
            <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white group-hover:text-purple-400 transition-colors">
                        {value}
                    </span>
                    {unit && <span className="text-xs text-gray-600">{unit}</span>}
                </div>
                {subValue && (
                    <div className="text-xs text-gray-400 font-mono mt-1">
                        {subValue}
                    </div>
                )}
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-purple-900/20 group-hover:scale-110 transition-all">
                <Icon className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors" />
            </div>
        </div>
    )
}
