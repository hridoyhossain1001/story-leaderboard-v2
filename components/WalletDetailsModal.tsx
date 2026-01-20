import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Activity, Clock, CloudOff, Trophy, RefreshCcw, BadgeCheck, FileText, MoreHorizontal, ChevronRight } from 'lucide-react';

interface WalletDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    address: string;
    name: string;
    precalculatedStats?: Record<string, { count: number; volume: string; swap_count?: number; license_count?: number; asset_count?: number; other_count?: number }>;
    totalTransactions?: number;
}

const formatVol = (wei: bigint) => {
    const val = Number(wei) / 1e18;
    if (val === 0) return "0 IP";
    if (val < 0.01) return "<0.01 IP";
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " IP";
};

type TimeWindow = '24h' | '3d' | '7d' | '14d' | '30d' | '60d' | '90d' | 'all';

const API_BASE = 'https://www.storyscan.io/api/v2';

export function WalletDetailsModal({ isOpen, onClose, address, name, precalculatedStats, totalTransactions = 0 }: WalletDetailsModalProps) {
    const [activeTab, setActiveTab] = useState<TimeWindow>('24h');
    const [stats, setStats] = useState<{ count: number; volume: string; swap_count?: number; license_count?: number; asset_count?: number; other_count?: number; breakdown?: Record<string, Record<string, number>> } | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // NEW API DATA STATES
    const [counters, setCounters] = useState<{ transactions_count: number; token_transfers_count: number; gas_usage_count: string } | null>(null);
    const [domainName, setDomainName] = useState<string | null>(null);
    const [tokenBalances, setTokenBalances] = useState<any[]>([]);

    // EFFECT 0: RESET STATE IMMEDIATELY when address changes
    useEffect(() => {
        // Clear stale data instantly when selecting a new wallet
        setStats(null);
        setTransactions([]);
        setError('');
        setActiveTab('24h'); // Reset to default tab
        // Reset new API states
        setCounters(null);
        setDomainName(null);
        setTokenBalances([]);
    }, [address]);

    // EFFECT 1: Load Data on Open - ALWAYS fetch live data
    useEffect(() => {
        if (isOpen && address) {
            // ⚡ ALWAYS LIVE FETCH: No cache, always get fresh blockchain data
            setLoading(true);
            fetchHistory(address);
            // 🆕 Fetch additional API data in parallel
            fetchCounters(address);
            fetchDomainName(address);
            fetchTokenBalances(address);
        }
    }, [isOpen, address]);

    // EFFECT 2: Update UI when Tab changes or Data arrives
    useEffect(() => {
        if (!isOpen) return;

        // PRIORITY 1: LIVE DATA
        // If we have fetched transactions, ALWAYS calculate stats from them.
        // This ensures 100% accuracy and consistent behavior.
        if (transactions.length > 0) {
            calculateStats();
            return;
        }

        // PRIORITY 2: PRECALCULATED DATA (Cache/Fallback)
        // While waiting for live data, show cached data if available.
        if (precalculatedStats && precalculatedStats[activeTab]) {
            setStats(precalculatedStats[activeTab]);
            // setLoading(false);
        }

    }, [activeTab, precalculatedStats, transactions, isOpen]);


    const calculateStats = () => {
        if (transactions.length === 0) return;

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
        let swapCount = 0;
        let licenseCount = 0;
        let assetCount = 0;
        let otherCount = 0;
        const breakdown: Record<string, Record<string, number>> = { swap: {}, license: {}, asset: {}, other: {} };

        for (const tx of transactions) {
            const txDate = new Date(tx.timestamp);
            if (txDate.getTime() >= cutoffTime) {
                currentCount++;
                const isContractInteraction = tx.to?.is_contract;
                const val = BigInt(tx.value || 0);
                if (isContractInteraction) {
                    currentVolume += val;
                }

                // CLASSIFY ON FRONTEND
                const method = (tx.method || '').toLowerCase();
                let decoded = '';
                if (tx.decoded_input && tx.decoded_input.method_call) {
                    decoded = tx.decoded_input.method_call.toLowerCase();
                }

                // Extract Clean Method Name for Display
                const methodDisplay = tx.decoded_input && tx.decoded_input.method_call
                    ? tx.decoded_input.method_call.split('(')[0]
                    : (tx.method || 'unknown');

                const toName = (tx.to && tx.to.name) ? tx.to.name.toLowerCase() : '';
                let isPiper = toName.includes('piper') || toName.includes('swap');

                let contractName = tx.to?.name || tx.to?.hash || 'Unknown';

                // Use Tags if available (Superior Source for Project Name)
                if (tx.to?.metadata?.tags && tx.to.metadata.tags.length > 0) {
                    const tag = tx.to.metadata.tags.find((t: any) => t.name && !t.name.includes('contract'));
                    if (tag) contractName = `# ${tag.name}`;
                }
                // Composite Key: ContractName|MethodName
                const key = `${contractName}|${methodDisplay}`;

                // STRICT CLASSIFICATION LOGIC
                if (method.includes('swap') || decoded.includes('swap') || (method.includes('multicall') && isPiper)) {
                    swapCount++;
                    breakdown.swap[key] = (breakdown.swap[key] || 0) + 1;
                }
                // ASSET: Must contain register/create AND NOT license (to avoid overlap)
                // ASSET: Register, Create IP, or Attach Terms (Creator Actions)
                // We define 'attachpilterms' as Asset behavior because you are setting terms for your own IP.
                else if (method.includes('register') || decoded.includes('register') || method.includes('createip') ||
                    method.includes('attachpilterms') || decoded.includes('attachpilterms')) {
                    assetCount++;
                    breakdown.asset[key] = (breakdown.asset[key] || 0) + 1;
                }
                // LICENSE: Minting or Buying Licenses (Consumer Actions)
                // We check this AFTER Asset to ensure 'mintAndRegister...' is caught by Asset first.
                else if (method.includes('license') || decoded.includes('license') || method.includes('mintlicense')) {
                    licenseCount++;
                    breakdown.license[key] = (breakdown.license[key] || 0) + 1;
                }
                else {
                    otherCount++;
                    breakdown.other[key] = (breakdown.other[key] || 0) + 1;
                }
            }
        }
        setStats({ count: currentCount, volume: formatVol(currentVolume), swap_count: swapCount, license_count: licenseCount, asset_count: assetCount, other_count: otherCount, breakdown });
    };

    async function fetchHistory(addr: string) {
        setLoading(true);
        setError('');
        const allTxs: any[] = [];

        try {
            let nextPageParams = '';
            let keepFetching = true;
            let totalFetched = 0;

            // Fetch up to 2000 txs max
            while (keepFetching && totalFetched < 2000) {
                const params = new URLSearchParams(nextPageParams);
                params.set('items_count', '50'); // API max is 50 per page

                const url = `${API_BASE}/addresses/${addr}/transactions?${params.toString()}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch history');

                const data = await res.json();
                const items = data.items || [];

                if (items.length === 0) break;

                for (const tx of items) {
                    allTxs.push(tx);
                }

                // ⚡ INSTANT UPDATE: Show data after FIRST batch
                if (totalFetched === 0) {
                    setTransactions([...allTxs]);
                    setLoading(false); // Hide spinner, show first batch instantly!
                }

                totalFetched += items.length;

                // Progressive update every 50 txs (every page)
                if (totalFetched > 50) {
                    setTransactions([...allTxs]);
                }

                if (data.next_page_params) {
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

    // 🆕 FETCH ADDRESS COUNTERS - Lifetime stats
    async function fetchCounters(addr: string) {
        try {
            const res = await fetch(`${API_BASE}/addresses/${addr}/counters`);
            if (res.ok) {
                const data = await res.json();
                setCounters(data);
            }
        } catch (err) {
            console.error('Failed to fetch counters:', err);
        }
    }

    // 🆕 FETCH DOMAIN NAME - .story or ENS name
    async function fetchDomainName(addr: string) {
        try {
            // Try the address info endpoint first
            const res = await fetch(`${API_BASE}/addresses/${addr}`);
            if (res.ok) {
                const data = await res.json();
                // Check if there's an ENS or domain name
                if (data.ens_domain_name) {
                    setDomainName(data.ens_domain_name);
                } else if (data.name) {
                    setDomainName(data.name);
                }
            }
        } catch (err) {
            console.error('Failed to fetch domain:', err);
        }
    }

    // 🆕 FETCH TOKEN BALANCES - NFTs and Tokens with images
    async function fetchTokenBalances(addr: string) {
        try {
            const res = await fetch(`${API_BASE}/addresses/${addr}/token-balances`);
            if (res.ok) {
                const data = await res.json();
                // Filter to show NFTs/interesting tokens
                const filtered = (data || [])
                    .filter((item: any) => item.token?.type === 'ERC-721' || item.token?.type === 'ERC-1155' || parseFloat(item.value) > 0);
                setTokenBalances(filtered);
            }
        } catch (err) {
            console.error('Failed to fetch token balances:', err);
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

                <div className="mb-6 border-b border-gray-800 pb-4">
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-500" />
                        {domainName && name === 'Unknown' ? domainName : name}
                        {domainName && name !== 'Unknown' && name !== domainName && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
                                {domainName}
                            </span>
                        )}
                    </h2>
                    <p className="text-gray-500 text-sm font-mono break-all">{address}</p>

                    {/* 🆕 LIFETIME STATS ROW */}
                    {counters && (
                        <div className="flex gap-4 mt-3 text-xs">
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <Activity className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-white font-medium">{Number(counters.transactions_count).toLocaleString()}</span> Lifetime TXs
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <RefreshCcw className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-white font-medium">{Number(counters.token_transfers_count).toLocaleString()}</span> Transfers
                            </div>
                        </div>
                    )}
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
                    <>
                        {loading && (
                            <div className="mb-4 bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 flex items-center justify-between animate-pulse">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                                    <span className="text-sm text-purple-200">
                                        Scanning blockchain history...
                                        <span className="font-mono ml-2 font-bold">
                                            {transactions.length.toLocaleString()}
                                            {counters ? ` / ${Number(counters.transactions_count).toLocaleString()}` : ''} TXs
                                        </span>
                                    </span>
                                </div>
                                <span className="text-xs text-purple-400 font-medium tracking-wider uppercase">Live Update</span>
                            </div>
                        )}
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
                                    <StatCard
                                        label="Swaps"
                                        value={stats.swap_count || 0}
                                        icon={RefreshCcw}
                                        delay={2}
                                        onClick={() => setSelectedCategory('swap')}
                                        hasBreakdown={stats.breakdown && Object.keys(stats.breakdown.swap || {}).length > 0}
                                    />
                                    <StatCard
                                        label="Licenses"
                                        value={stats.license_count || 0}
                                        subValue="Consumer (Buyer)"
                                        icon={BadgeCheck}
                                        delay={3}
                                        onClick={() => setSelectedCategory('license')}
                                        hasBreakdown={stats.breakdown && Object.keys(stats.breakdown.license || {}).length > 0}
                                    />
                                    <StatCard
                                        label="Assets"
                                        value={stats.asset_count || 0}
                                        subValue="Creator (IP Owner)"
                                        icon={FileText}
                                        delay={4}
                                        onClick={() => setSelectedCategory('asset')}
                                        hasBreakdown={stats.breakdown && Object.keys(stats.breakdown.asset || {}).length > 0}
                                    />
                                    <StatCard
                                        label="Others"
                                        value={stats.other_count || 0}
                                        icon={MoreHorizontal}
                                        delay={5}
                                        onClick={() => setSelectedCategory('other')}
                                        hasBreakdown={stats.breakdown && Object.keys(stats.breakdown.other || {}).length > 0}
                                    />
                                </>
                            ) : (
                                <div className="col-span-full text-center text-gray-500 py-8">No data available for this period.</div>
                            )}
                        </div>
                    </>
                )}

                {!loading && stats && (
                    <div className="mt-6 pt-4 border-t border-gray-800 text-center">
                        <p className="text-xs text-gray-600">
                            Volume counts only <strong>Contract Interactions</strong> (dApps, Minting, etc). Wallet transfers excluded.
                        </p>
                    </div>
                )}

                {/* 🆕 NFT/TOKEN GALLERY */}
                {tokenBalances.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-800">
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-yellow-500" />
                            Owned Assets ({tokenBalances.length})
                        </h3>
                        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                            {tokenBalances.slice(0, 100).map((item: any, idx: number) => {
                                const token = item.token || {};
                                const instance = item.token_instance || {};
                                const imageUrl = instance.image_url || token.icon_url;
                                const tokenName = token.name || token.symbol || 'Token';
                                const tokenId = instance.id ? `#${instance.id}` : '';
                                const isNFT = token.type === 'ERC-721' || token.type === 'ERC-1155';

                                return (
                                    <div
                                        key={idx}
                                        className="bg-gray-900/50 border border-gray-800 rounded-lg p-2 hover:border-purple-500/30 transition-all group"
                                        title={`${tokenName} ${tokenId}`}
                                    >
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={tokenName}
                                                className="w-full aspect-square object-cover rounded-md mb-1.5"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%231a1a1a" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666" font-size="12">NFT</text></svg>';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full aspect-square bg-gray-800 rounded-md mb-1.5 flex items-center justify-center">
                                                <span className="text-2xl">{isNFT ? '🖼️' : '🪙'}</span>
                                            </div>
                                        )}
                                        <p className="text-xs text-gray-300 truncate font-medium">{tokenName}</p>
                                        <p className="text-xs text-gray-500 truncate">{tokenId || (isNFT ? 'NFT' : 'Token')}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Breakdown Popup */}
                {selectedCategory && stats?.breakdown && stats.breakdown[selectedCategory] && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50" onClick={() => setSelectedCategory(null)}>
                        <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-white capitalize">{selectedCategory} Breakdown</h3>
                                <button onClick={() => setSelectedCategory(null)} className="text-gray-500 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {Object.entries(stats.breakdown[selectedCategory])
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 10)
                                    .map(([key, count], i) => {
                                        // HUMAN READABLE NAMES MAPPING
                                        const getReadableName = (name: string) => {
                                            const map: Record<string, string> = {
                                                'SwapRouter': 'Story Swap',
                                                'PiperXRouter': 'PiperX DEX',
                                                'SudoSwap': 'SudoSwap NFT',
                                                'StoryProtocol': 'Story Protocol Core',
                                                'SimpleSPGNFT': 'SPG NFT Collection',
                                                'ERC1967Proxy': 'Story Protocol Core',
                                                'Operator': 'Story Protocol Core',
                                                'Unknown': 'Unknown Contract'
                                            };
                                            if (map[name]) return map[name];

                                            // Format Hex: 0x1234...5678
                                            if (name.startsWith('0x') && name.length > 10) {
                                                return `Contract (${name.slice(0, 6)}...${name.slice(-4)})`;
                                            }
                                            return name;
                                        };

                                        // key format: "ContractName|MethodName"
                                        const parts = key.split('|');
                                        const rawName = parts[0];
                                        const method = parts.length > 1 ? parts[1] : '';

                                        return (
                                            <div key={i} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
                                                <div className="flex flex-col overflow-hidden mr-3">
                                                    <span className="text-gray-300 text-sm truncate font-medium" title={rawName}>
                                                        {getReadableName(rawName)}
                                                    </span>
                                                    {method && (
                                                        <span className="text-xs text-gray-500 font-mono truncate lowercase">
                                                            {method}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-purple-400 font-bold shrink-0">{count}</span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, unit, subValue, icon: Icon, delay, onClick, hasBreakdown }: { label: string, value: string | number, unit?: string, subValue?: string, icon: any, delay: number, onClick?: () => void, hasBreakdown?: boolean }) {
    return (
        <div
            className={`bg-gray-900/50 border border-gray-800 p-5 rounded-xl flex items-center justify-between hover:border-purple-500/30 transition-all duration-300 group ${onClick ? 'cursor-pointer' : ''}`}
            style={{ animationDelay: `${delay * 75}ms` }}
            onClick={onClick}
        >
            <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    {label}
                    {hasBreakdown && <ChevronRight className="w-3 h-3 text-purple-500" />}
                </p>
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
