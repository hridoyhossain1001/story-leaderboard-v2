"use client";

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Trophy, ExternalLink, Activity, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, SlidersHorizontal, DollarSign, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { WalletDetailsModal } from './WalletDetailsModal';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface DomainEntry {
    address: string;
    name: string;
    transaction_count: string | number; // Updated to match JSON
    balance: string;
    net_worth_usd?: number; // New Field
    last_active: string | number;
    last_stats?: Record<string, { count: number; volume: string; swap_count?: number; license_count?: number; asset_count?: number }>;
}

const ClientDate = ({ timestamp }: { timestamp: string | number }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <span>...</span>;
    if (!timestamp || isNaN(new Date(timestamp).getTime())) return <span>Unknown</span>;
    return <>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</>;
};

export function LeaderboardTable() {
    const { data: historicalData } = useSWR<DomainEntry[]>('/known_domains.json', fetcher, {
        refreshInterval: 60000, // Refresh every 60 seconds (was 3s - too aggressive!)
        dedupingInterval: 30000, // Dedupe requests within 30 seconds
        revalidateOnFocus: false, // Don't re-fetch on tab focus
        revalidateIfStale: false // Use cached data first
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [sortedData, setSortedData] = useState<DomainEntry[]>([]);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof DomainEntry | 'net_worth_usd', direction: 'asc' | 'desc' } | null>(null);

    // Filter State
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        minNetWorth: '',
        minTransactions: '',
        activeWithin: 'all' as 'all' | '24h' | '7d' | '30d'
    });

    const [selectedWallet, setSelectedWallet] = useState<DomainEntry | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        if (historicalData) {
            let processed = [...historicalData];

            // 1. apply Filters
            if (filters.minNetWorth) {
                const minVal = parseFloat(filters.minNetWorth);
                processed = processed.filter(p => (p.net_worth_usd || 0) >= minVal);
            }
            if (filters.minTransactions) {
                const minTx = parseInt(filters.minTransactions);
                processed = processed.filter(p => parseInt(String(p.transaction_count || 0)) >= minTx);
            }
            if (filters.activeWithin !== 'all') {
                const now = Date.now();
                const periods = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
                const cutoff = now - periods[filters.activeWithin];
                processed = processed.filter(p => {
                    const ts = typeof p.last_active === 'string' ? new Date(p.last_active).getTime() : p.last_active;
                    return ts >= cutoff;
                });
            }

            // 2. Apply Sorting
            processed.sort((a, b) => {
                if (!sortConfig) {
                    // Default Sort: Transaction Count Descending
                    const countA = parseInt(String(a.transaction_count || 0));
                    const countB = parseInt(String(b.transaction_count || 0));
                    return countB - countA;
                }

                const { key, direction } = sortConfig;
                let valA: any = a[key as keyof DomainEntry];
                let valB: any = b[key as keyof DomainEntry];

                // Numeric handling
                if (key === 'transaction_count') {
                    valA = parseInt(String(valA || 0));
                    valB = parseInt(String(valB || 0));
                } else if (key === 'balance') {
                    valA = parseFloat(String(valA || 0));
                    valB = parseFloat(String(valB || 0));
                } else if (key === 'net_worth_usd') {
                    valA = valA || 0;
                    valB = valB || 0;
                } else if (key === 'last_active') {
                    valA = new Date(valA).getTime() || 0;
                    valB = new Date(valB).getTime() || 0;
                } else if (key === 'name') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });

            setSortedData(processed);
        }
    }, [historicalData, sortConfig, filters]);

    const handleSort = (key: keyof DomainEntry | 'net_worth_usd') => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const filteredData = sortedData.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedData = filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
            {/* Stats Cards (unchanged) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl relative overflow-hidden group">
                    <div className="z-10 relative">
                        <div className="text-gray-400 text-sm font-medium mb-1 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-purple-500" /> Total Active .ip Users
                        </div>
                        <div className="text-3xl font-bold text-white tracking-tight">
                            {historicalData ? historicalData.length : '...'}
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-purple-600/20 transition-all duration-500"></div>
                </div>

                <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl relative overflow-hidden group">
                    <div className="z-10 relative">
                        <div className="text-gray-400 text-sm font-medium mb-1 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-yellow-500" /> Top Active
                        </div>
                        <div className="text-xl font-bold text-white tracking-tight truncate">
                            {sortedData[0]?.name || 'Loading...'}
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-600/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-yellow-600/20 transition-all duration-500"></div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-8 bg-gradient-to-b from-purple-500 to-blue-500 rounded-full inline-block"></span>
                            Live Leaderboard
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">Ranking the most active .ip domain holders on Mainnet</p>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        {/* Filter Button */}
                        <div className="relative">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`p-2 rounded-lg border transition-colors flex items-center gap-2 ${showFilters ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}
                            >
                                <SlidersHorizontal className="w-5 h-5" />
                                <span className="hidden md:inline text-sm font-medium">Filter</span>
                            </button>

                            {/* Filter Popover */}
                            {showFilters && (
                                <div className="absolute top-12 right-0 w-72 bg-[#111] border border-gray-800 rounded-xl shadow-2xl p-4 z-50">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-white font-semibold flex items-center gap-2"><Filter className="w-4 h-4 text-purple-500" /> Filters</h3>
                                        <button onClick={() => setShowFilters(false)}><X className="w-4 h-4 text-gray-500 hover:text-white" /></button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Min Net Worth (USD)</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    className="w-full bg-black/50 border border-gray-800 rounded-lg py-2 pl-8 pr-3 text-sm text-white focus:border-purple-500 outline-none"
                                                    value={filters.minNetWorth}
                                                    onChange={e => setFilters({ ...filters, minNetWorth: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Min Transactions</label>
                                            <div className="relative">
                                                <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                                <input
                                                    type="number"
                                                    placeholder="0"
                                                    className="w-full bg-black/50 border border-gray-800 rounded-lg py-2 pl-8 pr-3 text-sm text-white focus:border-purple-500 outline-none"
                                                    value={filters.minTransactions}
                                                    onChange={e => setFilters({ ...filters, minTransactions: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Last Active</label>
                                            <div className="grid grid-cols-4 gap-1">
                                                {['all', '24h', '7d', '30d'].map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => setFilters({ ...filters, activeWithin: p as any })}
                                                        className={`text-xs py-1.5 rounded border ${filters.activeWithin === p ? 'bg-purple-600/20 border-purple-500 text-purple-400' : 'border-gray-800 text-gray-500 hover:bg-gray-800'}`}
                                                    >
                                                        {p.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search .ip or address..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider font-semibold border-b border-gray-800">
                                <th className="p-4 w-16 text-center">Rank</th>
                                <th className="p-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">User (.ip) {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
                                </th>
                                <th className="p-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('transaction_count')}>
                                    <div className="flex items-center justify-end gap-1">Transactions {sortConfig?.key === 'transaction_count' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
                                </th>
                                <th className="p-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('net_worth_usd')}>
                                    <div className="flex items-center justify-end gap-1">Balance (Net Worth) {sortConfig?.key === 'net_worth_usd' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
                                </th>
                                <th className="p-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('last_active')}>
                                    <div className="flex items-center justify-end gap-1">Last Active {sortConfig?.key === 'last_active' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
                                </th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {paginatedData.map((entry, index) => {
                                const globalIndex = startIndex + index;
                                return (
                                    <tr
                                        key={entry.address}
                                        className="hover:bg-gray-900/40 transition-colors group cursor-pointer"
                                        onClick={() => setSelectedWallet(entry)}
                                    >
                                        <td className="p-4 text-center">
                                            <span className={clsx(
                                                "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
                                                globalIndex === 0 ? "bg-yellow-500/20 text-yellow-400" :
                                                    globalIndex === 1 ? "bg-gray-400/20 text-gray-300" :
                                                        globalIndex === 2 ? "bg-orange-500/20 text-orange-400" :
                                                            "text-gray-600"
                                            )}>
                                                {globalIndex + 1}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="text-white font-medium text-lg tracking-tight group-hover:text-purple-400 transition-colors">
                                                    {entry.name}
                                                </span>
                                                <span className="text-gray-600 text-xs font-mono truncate w-32">
                                                    {entry.address}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 text-gray-300 font-medium">
                                                {parseInt(String(entry.transaction_count || 0)).toLocaleString()}
                                                <span className="text-xs text-gray-600 bg-gray-900 px-1.5 py-0.5 rounded">TXS</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-gray-400 font-mono text-sm">
                                            <div>
                                                {Number(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} IP
                                            </div>
                                            <div className="text-xs text-green-500 font-medium mt-1">
                                                ${(entry.net_worth_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-sm text-gray-500">
                                            <ClientDate timestamp={entry.last_active} />
                                        </td>
                                        <td className="p-4 text-center">
                                            <a
                                                href={`https://www.storyscan.io/address/${entry.address}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-gray-600 hover:text-white transition-colors"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                            </a>
                                        </td>
                                    </tr>
                                )
                            })}

                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-500">
                                        {searchTerm.startsWith('0x') && searchTerm.length === 42 ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <p>Address not found in leaderboard.</p>
                                                <button
                                                    onClick={() => setSelectedWallet({
                                                        name: 'Unknown Address',
                                                        address: searchTerm,
                                                        transaction_count: 0,
                                                        balance: '0',
                                                        last_active: 0
                                                    })}
                                                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
                                                >
                                                    <Activity className="w-5 h-5" />
                                                    Inspect Live Data
                                                </button>
                                                <p className="text-xs text-gray-600 mt-2">
                                                    Click to fetch live Balance & Transactions from the blockchain.
                                                </p>
                                            </div>
                                        ) : (
                                            historicalData ? "No matching domains found." : "Loading initial scan data..."
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {filteredData.length > 0 && (
                <div className="flex justify-between items-center px-4 py-2 bg-[#0a0a0a] border border-gray-800 rounded-xl">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-50 hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" /> Previous
                    </button>

                    <span className="text-gray-500 text-sm font-medium">
                        Page <span className="text-white">{currentPage}</span> of <span className="text-white">{totalPages || 1}</span>
                    </span>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-50 hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
                    >
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            <WalletDetailsModal
                isOpen={!!selectedWallet}
                onClose={() => setSelectedWallet(null)}
                address={selectedWallet?.address || ''}
                name={selectedWallet?.name || ''}
                precalculatedStats={selectedWallet?.last_stats}
            />
        </div >
    );
}
