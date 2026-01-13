"use client";

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Trophy, ExternalLink, Activity, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
        refreshInterval: 3000
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [sortedData, setSortedData] = useState<DomainEntry[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<{ name: string, address: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        if (historicalData) {
            const sorted = [...historicalData].sort((a, b) => {
                const countA = parseInt(String(a.transaction_count || 0));
                const countB = parseInt(String(b.transaction_count || 0));
                return countB - countA;
            });
            setSortedData(sorted);
        }
    }, [historicalData]);

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

                    <div className="relative w-full md:w-64">
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

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider font-semibold border-b border-gray-800">
                                <th className="p-4 w-16 text-center">Rank</th>
                                <th className="p-4">User (.ip)</th>
                                <th className="p-4 text-right">Transactions</th>
                                <th className="p-4 text-right">Balance (Net Worth)</th>
                                <th className="p-4 text-right">Last Active</th>
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
                                        onClick={() => setSelectedWallet({ name: entry.name, address: entry.address })}
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
                                                    onClick={() => setSelectedWallet({ name: 'Unknown Address', address: searchTerm })}
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
                precalculatedStats={(selectedWallet as any)?.last_stats}
            />
        </div >
    );
}
