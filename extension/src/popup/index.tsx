import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, spacing, typography, borderRadius, transitions, faviconFallback, commonStyles } from '../shared/theme';

interface TabInfo {
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
}

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface TabHealth {
    tabId: number;
    title: string;
    url: string;
    favicon?: string;
    staleDays: number;
    category: string;
    isStale: boolean;
    isDuplicate: boolean;
    recommendation: 'keep' | 'close' | 'review';
    reason: string;
}

interface TabAnalytics {
    topDomains: { domain: string; count: number; percentage: number }[];
    categoryBreakdown: { category: string; count: number; percentage: number }[];
    avgTabAge: number;
    oldestTabDays: number;
    healthScore: number;
    healthLabel: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
    insights: string[];
}

interface AutoPilotReport {
    totalTabs: number;
    totalMemoryMB: number;
    staleCount: number;
    duplicateCount: number;
    categoryGroups: { [key: string]: TabHealth[] };
    recommendations: {
        closeSuggestions: TabHealth[];
        groupSuggestions: { name: string; tabIds: number[] }[];
        memoryHogs: TabHealth[];
    };
    analytics?: TabAnalytics;
    aiInsights?: string;
}

type View = 'tabs' | 'analyze' | 'duplicates' | 'upgrade' | 'autopilot' | 'analytics';

const Popup = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [duplicates, setDuplicates] = useState<TabInfo[][]>([]);
    const [view, setView] = useState<View>('tabs');
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [provider, setProvider] = useState<string>('none');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [hoveredTab, setHoveredTab] = useState<number | null>(null);
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);

    useEffect(() => {
        loadTabs();
        checkProvider();
        checkLicense();
    }, []);

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    }, []);

    const loadTabs = useCallback(async () => {
        const response = await sendMessage('getWindowTabs');
        if (response.success) setTabs(response.data);
    }, [sendMessage]);

    const checkProvider = useCallback(async () => {
        const response = await sendMessage('getAIProvider');
        if (response.success) setProvider(response.data.provider);
    }, [sendMessage]);

    const checkLicense = useCallback(async () => {
        const response = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (response.success) setLicense(response.data);
    }, [sendMessage]);

    const closeTab = useCallback(async (tabId: number) => {
        await sendMessage('closeTab', { tabId });
        loadTabs();
    }, [sendMessage, loadTabs]);

    const findDuplicates = useCallback(async () => {
        setView('duplicates');
        const response = await sendMessage('getDuplicates');
        if (response.success) setDuplicates(response.data);
    }, [sendMessage]);

    const closeDuplicates = useCallback(async () => {
        for (const group of duplicates) {
            const tabsToClose = group.slice(1).map(t => t.id);
            await sendMessage('closeTabs', { tabIds: tabsToClose });
        }
        loadTabs();
        findDuplicates();
    }, [duplicates, sendMessage, loadTabs, findDuplicates]);

    const showStatus = useCallback((message: string, duration = 3000) => {
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(''), duration);
    }, []);

    const smartOrganize = useCallback(async () => {
        if (provider === 'none') {
            showStatus('Configure AI in settings first');
            return;
        }
        setLoading(true);
        showStatus('Organizing tabs...');
        const response = await sendMessage('smartOrganize');
        if (response.success) {
            showStatus(response.data.message);
            loadTabs();
        } else {
            showStatus(response.error || 'Organization failed');
        }
        setLoading(false);
    }, [provider, sendMessage, loadTabs, showStatus]);

    const analyzeWithAI = useCallback(async () => {
        if (provider === 'none') {
            setAnalysis('No AI provider configured.\n\nOpen Settings to set up an AI provider.');
            setView('analyze');
            return;
        }
        setLoading(true);
        setView('analyze');
        const response = await sendMessage('analyzeAllTabs');
        if (response.success) {
            setAnalysis(response.data.analysis);
        } else {
            if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
                setView('upgrade');
                setLoading(false);
                return;
            }
            setAnalysis(response.error || 'Analysis failed');
        }
        setLoading(false);
        checkLicense();
    }, [provider, sendMessage, checkLicense]);

    const handleUpgrade = useCallback(async () => {
        setLoading(true);
        const response = await sendMessage('getCheckoutUrl');
        if (response.success) chrome.tabs.create({ url: response.data.url });
        setLoading(false);
    }, [sendMessage]);

    const runAutoPilot = useCallback(async () => {
        if (!license?.paid) {
            setView('upgrade');
            return;
        }
        setLoading(true);
        setView('autopilot');
        setAutoPilotReport(null);
        const response = await sendMessage('autoPilotAnalyzeWithAI');
        if (response.success) {
            setAutoPilotReport(response.data);
        } else {
            if (response.error?.includes('TRIAL_EXPIRED') || response.error?.includes('LIMIT_REACHED')) {
                setView('upgrade');
            }
        }
        setLoading(false);
        checkLicense();
    }, [license, sendMessage, checkLicense]);

    const executeCleanup = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        const tabIds = autoPilotReport.recommendations.closeSuggestions.map(t => t.tabId);
        await sendMessage('autoPilotCleanup', { tabIds });
        await loadTabs();
        await runAutoPilot();
    }, [autoPilotReport, sendMessage, loadTabs, runAutoPilot]);

    const executeGrouping = useCallback(async () => {
        if (!autoPilotReport) return;
        setLoading(true);
        await sendMessage('autoPilotGroup', { groups: autoPilotReport.recommendations.groupSuggestions });
        await loadTabs();
        await runAutoPilot();
    }, [autoPilotReport, sendMessage, loadTabs, runAutoPilot]);

    const filteredTabs = searchQuery
        ? tabs.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.url.toLowerCase().includes(searchQuery.toLowerCase()))
        : tabs;

    const getHostname = (url: string) => {
        try { return new URL(url).hostname; } catch { return url; }
    };

    const getProviderDisplay = () => {
        const labels: Record<string, string> = {
            nano: 'NANO',
            gemini: 'GEMINI',
            openai: 'OPENAI',
            anthropic: 'CLAUDE',
            none: 'NO AI'
        };
        return labels[provider] || provider.toUpperCase();
    };

    const getLicenseTag = () => {
        if (!license) return null;
        if (license.paid) return <span style={styles.tagPro}>PRO</span>;
        if (license.status === 'trial') return <span style={styles.tagTrial}>{license.usageRemaining} left</span>;
        return null;
    };

    const showAnalytics = useCallback(async () => {
        if (!license?.paid) {
            setView('upgrade');
            return;
        }
        setLoading(true);
        setView('analytics');
        const response = await sendMessage('autoPilotAnalyzeWithAI');
        if (response.success) {
            setAutoPilotReport(response.data);
        }
        setLoading(false);
    }, [license, sendMessage]);

    const getHealthScoreColor = (score: number) => {
        if (score >= 80) return colors.success;
        if (score >= 60) return colors.accent;
        if (score >= 40) return colors.warning;
        return colors.error;
    };

    const buttonLabels: Record<string, { label: string; title: string; icon: string }> = {
        auto: { label: 'Pilot', title: 'Auto Pilot - AI-powered cleanup', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
        group: { label: 'Group', title: 'Smart Group - Organize by purpose', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
        scan: { label: 'Scan', title: 'AI Scan - Analyze tabs', icon: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' },
        stats: { label: 'Stats', title: 'Analytics - View insights', icon: 'M18 20V10M12 20V4M6 20v-6' },
    };

    // Parse AI analysis into structured cards
    const parseAnalysis = (text: string) => {
        if (!text) return null;

        const sections: { title: string; items: string[]; color: string; icon: string }[] = [];
        const lines = text.split('\n').filter(l => l.trim());

        let currentSection: { title: string; items: string[]; color: string; icon: string } | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            // Match section headers like "1. DUPLICATES:", "2. CLOSE:", etc.
            const sectionMatch = trimmed.match(/^(\d+\.?\s*)?(DUPLICATES|CLOSE|GROUPS|WORK|AI|CLOUD|ENTERTAINMENT|PROJECT|DEV|SOCIAL|OTHER)[:\s]/i);
            if (sectionMatch) {
                if (currentSection) sections.push(currentSection);
                const sectionName = sectionMatch[2].toUpperCase();
                const sectionColors: Record<string, string> = {
                    'DUPLICATES': colors.warning,
                    'CLOSE': colors.error,
                    'GROUPS': colors.info,
                    'AI': colors.accent,
                    'WORK': colors.primary,
                    'CLOUD': colors.providerGemini,
                    'DEV': colors.providerOpenai,
                    'ENTERTAINMENT': colors.providerAnthropic,
                    'PROJECT': colors.success,
                    'SOCIAL': colors.info,
                };
                const sectionIcons: Record<string, string> = {
                    'DUPLICATES': 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2',
                    'CLOSE': 'M18 6 6 18M6 6l12 12',
                    'GROUPS': 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
                    'AI': 'M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z',
                    'WORK': 'M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z',
                };
                const content = trimmed.replace(sectionMatch[0], '').trim();
                currentSection = {
                    title: sectionName,
                    items: content ? [content] : [],
                    color: sectionColors[sectionName] || colors.textDim,
                    icon: sectionIcons[sectionName] || 'M12 2v20M2 12h20',
                };
            } else if (currentSection) {
                // Sub-items (lines starting with *, -, or bullet points)
                const cleanItem = trimmed.replace(/^[-*•]\s*/, '').replace(/^\*\s*/, '');
                if (cleanItem) currentSection.items.push(cleanItem);
            } else if (!currentSection && trimmed) {
                // First line without section - treat as general info
                if (!sections.find(s => s.title === 'SUMMARY')) {
                    currentSection = {
                        title: 'SUMMARY',
                        items: [trimmed],
                        color: colors.primary,
                        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
                    };
                }
            }
        }
        if (currentSection) sections.push(currentSection);

        if (sections.length === 0) {
            // Fallback: show as plain text if parsing fails
            return <pre style={styles.analysisText}>{text}</pre>;
        }

        return sections.map((section, idx) => (
            <div key={idx} style={{ ...styles.analysisCard, borderLeftColor: section.color }}>
                <div style={{ ...styles.analysisCardHeader, color: section.color }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={section.icon} />
                    </svg>
                    {section.title}
                </div>
                <div style={styles.analysisCardContent}>
                    {section.items.map((item, i) => (
                        <div key={i} style={styles.analysisItem}>{item}</div>
                    ))}
                </div>
            </div>
        ));
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerMain}>
                    <div style={styles.logoSection}>
                        <div style={styles.logo}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M8 12l2 2 4-4"/>
                            </svg>
                        </div>
                        <div>
                            <div style={styles.title}>TabEater</div>
                            <div style={styles.subtitle}>
                                {tabs.length} tab{tabs.length !== 1 ? 's' : ''} {provider !== 'none' && `· ${getProviderDisplay()}`}
                            </div>
                        </div>
                    </div>
                    {getLicenseTag()}
                </div>
                {statusMessage && (
                    <div style={styles.statusBar}>
                        <span style={styles.statusIcon}>*</span>
                        {statusMessage}
                    </div>
                )}
            </header>

            {/* Actions */}
            <div style={styles.actions}>
                {Object.entries(buttonLabels).map(([key, { label, title, icon }]) => (
                    <button
                        key={key}
                        style={{
                            ...styles.btn,
                            ...(key === 'auto' && license?.paid ? styles.btnPrimary : {}),
                            ...(key === 'stats' && license?.paid ? styles.btnAccent : {}),
                            ...(hoveredButton === key ? styles.btnHover : {}),
                        }}
                        onClick={() => {
                            if (key === 'auto') runAutoPilot();
                            else if (key === 'group') smartOrganize();
                            else if (key === 'scan') analyzeWithAI();
                            else if (key === 'stats') showAnalytics();
                        }}
                        onMouseEnter={() => setHoveredButton(key)}
                        onMouseLeave={() => setHoveredButton(null)}
                        disabled={loading}
                        title={title}
                        aria-label={title}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                            <path d={icon} />
                        </svg>
                        {label}
                    </button>
                ))}
                <button
                    style={{
                        ...styles.btnIcon,
                        ...(hoveredButton === 'settings' ? styles.btnIconHover : {}),
                    }}
                    onClick={() => chrome.runtime.openOptionsPage()}
                    onMouseEnter={() => setHoveredButton('settings')}
                    onMouseLeave={() => setHoveredButton(null)}
                    title="Settings"
                    aria-label="Open Settings"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                    </svg>
                </button>
            </div>

            {/* Search */}
            <div style={styles.searchWrap}>
                <div style={styles.searchContainer}>
                    <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search tabs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={styles.search}
                        aria-label="Search tabs"
                    />
                    {searchQuery && (
                        <button
                            style={styles.searchClear}
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Tab List View */}
            {view === 'tabs' && (
                <div style={styles.tabList}>
                    {filteredTabs.length === 0 ? (
                        <div style={styles.emptyState}>
                            {searchQuery ? 'No matching tabs found' : 'No tabs open'}
                        </div>
                    ) : (
                        filteredTabs.map(tab => (
                            <div
                                key={tab.id}
                                style={{
                                    ...styles.tabItem,
                                    ...(hoveredTab === tab.id ? styles.tabItemHover : {}),
                                    ...(tab.active ? styles.tabItemActive : {}),
                                }}
                                onMouseEnter={() => setHoveredTab(tab.id)}
                                onMouseLeave={() => setHoveredTab(null)}
                            >
                                <img
                                    src={tab.favIconUrl || faviconFallback}
                                    style={styles.favicon}
                                    alt=""
                                    onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                />
                                <div style={styles.tabInfo}>
                                    <div style={styles.tabTitle}>{tab.title || 'Untitled'}</div>
                                    <div style={styles.tabUrl}>{getHostname(tab.url)}</div>
                                </div>
                                <button
                                    style={{
                                        ...styles.closeBtn,
                                        opacity: hoveredTab === tab.id ? 1 : 0,
                                    }}
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                    aria-label={`Close ${tab.title}`}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Duplicates View */}
            {view === 'duplicates' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Duplicate Tabs</span>
                        {duplicates.length > 0 && (
                            <button
                                style={{
                                    ...styles.btnDanger,
                                    ...(hoveredButton === 'closeAll' ? styles.btnDangerHover : {}),
                                }}
                                onClick={closeDuplicates}
                                onMouseEnter={() => setHoveredButton('closeAll')}
                                onMouseLeave={() => setHoveredButton(null)}
                            >
                                Close All Dupes
                            </button>
                        )}
                    </div>
                    <div style={styles.panelContent}>
                        {duplicates.length === 0 ? (
                            <div style={styles.emptyStateIcon}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.textDimmest} strokeWidth="1.5">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span>No duplicates found</span>
                            </div>
                        ) : (
                            duplicates.map((group, i) => (
                                <div key={i} style={styles.dupeItem}>
                                    <img
                                        src={group[0]?.favIconUrl || faviconFallback}
                                        style={styles.favicon}
                                        alt=""
                                        onError={(e) => { e.currentTarget.src = faviconFallback; }}
                                    />
                                    <div style={styles.dupeInfo}>
                                        <div style={styles.dupeTitle}>{group[0]?.title}</div>
                                        <div style={styles.dupeCount}>{group.length} copies</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Analysis View */}
            {view === 'analyze' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>AI Analysis</div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing your tabs...</span>
                            </div>
                        ) : (
                            <div style={styles.analysisCards}>
                                {parseAnalysis(analysis)}
                            </div>
                        )}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Auto Pilot View */}
            {view === 'autopilot' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Auto Pilot</span>
                        <span style={styles.tagPro}>PRO</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing tabs...</span>
                            </div>
                        ) : autoPilotReport ? (
                            <>
                                <div style={styles.statsRow}>
                                    <div style={styles.stat}>
                                        <div style={styles.statNum}>{autoPilotReport.totalTabs}</div>
                                        <div style={styles.statLabel}>Total</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.staleCount > 0 ? colors.warning : colors.success }}>
                                            {autoPilotReport.staleCount}
                                        </div>
                                        <div style={styles.statLabel}>Stale</div>
                                    </div>
                                    <div style={styles.stat}>
                                        <div style={{ ...styles.statNum, color: autoPilotReport.duplicateCount > 0 ? colors.error : colors.success }}>
                                            {autoPilotReport.duplicateCount}
                                        </div>
                                        <div style={styles.statLabel}>Dupes</div>
                                    </div>
                                </div>

                                {autoPilotReport.aiInsights && (
                                    <div style={styles.insightBox}>
                                        <div style={styles.insightLabel}>AI Insights</div>
                                        <div style={styles.insightText}>{autoPilotReport.aiInsights}</div>
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>Suggested to Close ({autoPilotReport.recommendations.closeSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeCleanup}>Close All</button>
                                        </div>
                                        {autoPilotReport.recommendations.closeSuggestions.slice(0, 4).map(th => (
                                            <div key={th.tabId} style={styles.suggestionItem}>
                                                <span style={styles.suggestionTitle}>{th.title}</span>
                                                <span style={styles.suggestionReason}>{th.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {autoPilotReport.recommendations.groupSuggestions.length > 0 && (
                                    <div style={styles.section}>
                                        <div style={styles.sectionHead}>
                                            <span>Suggested Groups ({autoPilotReport.recommendations.groupSuggestions.length})</span>
                                            <button style={styles.btnSmall} onClick={executeGrouping}>Group All</button>
                                        </div>
                                        {autoPilotReport.recommendations.groupSuggestions.map(g => (
                                            <div key={g.name} style={styles.groupItem}>
                                                <span>{g.name}</span>
                                                <span style={styles.groupCount}>{g.tabIds.length} tabs</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {autoPilotReport.recommendations.closeSuggestions.length === 0 &&
                                    autoPilotReport.recommendations.groupSuggestions.length === 0 && (
                                        <div style={styles.emptyStateIcon}>
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="1.5">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                <polyline points="22 4 12 14.01 9 11.01" />
                                            </svg>
                                            <span style={{ color: colors.success }}>All tabs optimized!</span>
                                        </div>
                                    )}
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Analytics View */}
            {view === 'analytics' && (
                <div style={styles.panel}>
                    <div style={styles.panelHeader}>
                        <span>Analytics</span>
                        <span style={styles.tagPro}>PRO</span>
                    </div>
                    <div style={styles.panelContent}>
                        {loading ? (
                            <div style={styles.loadingContainer}>
                                <div style={styles.loadingSpinner} />
                                <span>Analyzing...</span>
                            </div>
                        ) : autoPilotReport?.analytics ? (
                            <>
                                {/* Health Score */}
                                <div style={styles.healthScoreCard}>
                                    <div style={styles.healthScoreCircle}>
                                        <svg width="80" height="80" viewBox="0 0 80 80">
                                            <circle cx="40" cy="40" r="35" fill="none" stroke={colors.borderMedium} strokeWidth="6" />
                                            <circle
                                                cx="40"
                                                cy="40"
                                                r="35"
                                                fill="none"
                                                stroke={getHealthScoreColor(autoPilotReport.analytics.healthScore)}
                                                strokeWidth="6"
                                                strokeLinecap="round"
                                                strokeDasharray={`${(autoPilotReport.analytics.healthScore / 100) * 220} 220`}
                                                transform="rotate(-90 40 40)"
                                            />
                                        </svg>
                                        <div style={styles.healthScoreValue}>
                                            <span style={{ fontSize: 24, fontWeight: typography.bold, color: getHealthScoreColor(autoPilotReport.analytics.healthScore) }}>
                                                {autoPilotReport.analytics.healthScore}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={styles.healthLabel}>
                                        <span style={{ color: getHealthScoreColor(autoPilotReport.analytics.healthScore) }}>
                                            {autoPilotReport.analytics.healthLabel}
                                        </span>
                                    </div>
                                </div>

                                {/* Insights */}
                                <div style={styles.insightBox}>
                                    <div style={styles.insightLabel}>Insights</div>
                                    {autoPilotReport.analytics.insights.map((insight, i) => (
                                        <div key={i} style={styles.insightItem}>
                                            <span style={styles.insightBullet}>·</span>
                                            {insight}
                                        </div>
                                    ))}
                                </div>

                                {/* Category Breakdown */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHead}>
                                        <span>Categories</span>
                                    </div>
                                    {autoPilotReport.analytics.categoryBreakdown.slice(0, 5).map(cat => (
                                        <div key={cat.category} style={styles.analyticsRow}>
                                            <span style={styles.analyticsLabel}>{cat.category}</span>
                                            <div style={styles.analyticsBar}>
                                                <div style={{
                                                    ...styles.analyticsBarFill,
                                                    width: `${cat.percentage}%`,
                                                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
                                                }} />
                                            </div>
                                            <span style={styles.analyticsValue}>{cat.count}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Top Domains */}
                                <div style={styles.section}>
                                    <div style={styles.sectionHead}>
                                        <span>Top Domains</span>
                                    </div>
                                    {autoPilotReport.analytics.topDomains.map(domain => (
                                        <div key={domain.domain} style={styles.analyticsRow}>
                                            <span style={styles.analyticsLabel}>{domain.domain}</span>
                                            <span style={styles.analyticsValue}>{domain.percentage}%</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Stats Grid */}
                                <div style={styles.statsGrid}>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{tabs.length}</div>
                                        <div style={styles.miniStatLabel}>Tabs</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport.analytics.avgTabAge}</div>
                                        <div style={styles.miniStatLabel}>Avg Age</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport.analytics.oldestTabDays}</div>
                                        <div style={styles.miniStatLabel}>Oldest</div>
                                    </div>
                                    <div style={styles.miniStat}>
                                        <div style={styles.miniStatValue}>{autoPilotReport?.duplicateCount || 0}</div>
                                        <div style={styles.miniStatLabel}>Dupes</div>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}

            {/* Upgrade View */}
            {view === 'upgrade' && (
                <div style={styles.panel}>
                    <div style={styles.upgradeBox}>
                        <div style={styles.upgradeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </div>
                        <div style={styles.upgradeTitle}>Upgrade to Pro</div>
                        <div style={styles.upgradePrice}>$9.99</div>
                        <div style={styles.upgradeOnce}>one-time payment</div>
                        <ul style={styles.upgradeList}>
                            <li><span style={styles.checkmark}>&#10003;</span> Auto Pilot Mode</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Unlimited AI Scans</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Smart Grouping</li>
                            <li><span style={styles.checkmark}>&#10003;</span> Priority Support</li>
                        </ul>
                        <button
                            style={{
                                ...styles.btnUpgrade,
                                ...(hoveredButton === 'upgrade' ? styles.btnUpgradeHover : {}),
                            }}
                            onClick={handleUpgrade}
                            onMouseEnter={() => setHoveredButton('upgrade')}
                            onMouseLeave={() => setHoveredButton(null)}
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Get Pro Access'}
                        </button>
                        <button
                            style={styles.btnRefresh}
                            onClick={checkLicense}
                        >
                            Already purchased? Refresh status
                        </button>
                    </div>
                    <button style={styles.btnBack} onClick={() => setView('tabs')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to tabs
                    </button>
                </div>
            )}
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: 380,
        maxHeight: 520,
        background: colors.bgDark,
        color: colors.textMuted,
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeBase,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        background: colors.bgCard,
        borderBottom: `2px solid ${colors.primary}`,
        flexShrink: 0,
    },
    headerMain: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md}px ${spacing.md}px`,
    },
    logoSection: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    },
    logo: {
        width: 32,
        height: 32,
        background: colors.primary,
        color: colors.bgDarkest,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: typography.bold,
        fontSize: typography.sizeBase,
        borderRadius: borderRadius.md,
    },
    title: {
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.primary,
        letterSpacing: typography.letterWide,
    },
    subtitle: {
        fontSize: typography.sizeSm,
        color: colors.textDimmer,
        marginTop: 2,
    },
    tagPro: {
        background: colors.primary,
        color: colors.bgDarkest,
        padding: '3px 8px',
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        borderRadius: borderRadius.sm,
        letterSpacing: typography.letterNormal,
    },
    tagTrial: {
        background: colors.borderLight,
        color: colors.warning,
        padding: '3px 8px',
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        borderRadius: borderRadius.sm,
    },
    statusBar: {
        background: colors.warningBg,
        color: colors.warningText,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: typography.sizeMd,
        borderTop: `1px solid ${colors.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    },
    statusIcon: {
        color: colors.warning,
        fontWeight: typography.bold,
    },
    actions: {
        display: 'flex',
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgDarker,
        borderBottom: `1px solid ${colors.borderMedium}`,
        flexShrink: 0,
    },
    btn: {
        flex: 1,
        padding: `${spacing.sm}px ${spacing.xs}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDim,
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        letterSpacing: typography.letterNormal,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    btnHover: {
        background: colors.borderMedium,
        color: colors.textSecondary,
        borderColor: colors.textDim,
    },
    btnPrimary: {
        background: colors.primaryBg,
        border: `1px solid ${colors.primary}`,
        color: colors.primary,
    },
    btnAccent: {
        background: colors.accentBg,
        border: `1px solid ${colors.accent}`,
        color: colors.accent,
    },
    btnIcon: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgCardHover,
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDimmer,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnIconHover: {
        background: colors.borderMedium,
        color: colors.textSecondary,
        borderColor: colors.textDim,
    },
    searchWrap: {
        padding: `${spacing.sm}px ${spacing.md}px`,
        background: colors.bgDarker,
        flexShrink: 0,
    },
    searchContainer: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    searchIcon: {
        position: 'absolute',
        left: 10,
        color: colors.textDimmest,
        pointerEvents: 'none',
    },
    search: {
        width: '100%',
        padding: `${spacing.sm}px ${spacing.md}px ${spacing.sm}px 32px`,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        color: colors.textPrimary,
        fontSize: typography.sizeMd,
        borderRadius: borderRadius.sm,
        boxSizing: 'border-box',
        outline: 'none',
        transition: `border-color ${transitions.fast}`,
    },
    searchClear: {
        position: 'absolute',
        right: 8,
        background: 'transparent',
        border: 'none',
        color: colors.textDimmest,
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
    },
    tabList: {
        flex: 1,
        overflowY: 'auto',
        padding: `${spacing.xs}px ${spacing.sm}px`,
    },
    tabItem: {
        display: 'flex',
        alignItems: 'center',
        padding: spacing.sm,
        gap: spacing.md,
        borderBottom: `1px solid ${colors.borderDark}`,
        borderRadius: borderRadius.sm,
        transition: `background ${transitions.fast}`,
        cursor: 'default',
    },
    tabItemHover: {
        background: colors.bgCard,
    },
    tabItemActive: {
        borderLeft: `2px solid ${colors.primary}`,
        paddingLeft: spacing.sm - 2,
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: borderRadius.sm,
        flexShrink: 0,
        objectFit: 'contain',
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: typography.sizeBase,
        color: colors.textSecondary,
        ...commonStyles.truncate,
    },
    tabUrl: {
        fontSize: typography.sizeSm,
        color: colors.textDimmest,
        marginTop: 1,
        ...commonStyles.truncate,
    },
    closeBtn: {
        width: 22,
        height: 22,
        background: 'transparent',
        border: 'none',
        color: colors.textDim,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
        flexShrink: 0,
    },
    panel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: spacing.md,
        overflow: 'hidden',
    },
    panelHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
        color: colors.primary,
        marginBottom: spacing.md,
        paddingBottom: spacing.sm,
        borderBottom: `1px solid ${colors.borderMedium}`,
        flexShrink: 0,
    },
    panelContent: {
        flex: 1,
        overflowY: 'auto',
    },
    emptyState: {
        textAlign: 'center',
        color: colors.textDimmest,
        padding: spacing.xxxl,
        fontSize: typography.sizeMd,
    },
    emptyStateIcon: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.xxxl,
        color: colors.textDimmest,
        fontSize: typography.sizeMd,
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xxxl,
        color: colors.primary,
    },
    loadingSpinner: {
        width: 24,
        height: 24,
        border: `2px solid ${colors.borderLight}`,
        borderTop: `2px solid ${colors.primary}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    btnBack: {
        marginTop: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        border: `1px solid ${colors.borderMedium}`,
        color: colors.textDim,
        fontSize: typography.sizeMd,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        transition: `all ${transitions.fast}`,
        flexShrink: 0,
    },
    btnDanger: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.errorBg,
        border: `1px solid ${colors.error}`,
        color: colors.error,
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    btnDangerHover: {
        background: colors.error,
        color: colors.textPrimary,
    },
    dupeItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        background: colors.bgCard,
        marginBottom: spacing.sm,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.warning}`,
    },
    dupeInfo: {
        flex: 1,
        minWidth: 0,
    },
    dupeTitle: {
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        ...commonStyles.truncate,
    },
    dupeCount: {
        fontSize: typography.sizeSm,
        color: colors.warning,
        marginTop: 2,
    },
    analysisText: {
        margin: 0,
        whiteSpace: 'pre-wrap',
        fontFamily: typography.fontFamily,
        fontSize: typography.sizeMd,
        lineHeight: 1.6,
        color: colors.textDim,
        background: colors.bgDarker,
        padding: spacing.md,
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderDark}`,
    },
    analysisCards: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
    },
    analysisCard: {
        background: colors.bgCard,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.primary}`,
        overflow: 'hidden',
    },
    analysisCardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: typography.sizeSm,
        fontWeight: typography.bold,
        letterSpacing: typography.letterNormal,
        textTransform: 'uppercase',
        background: 'rgba(0,0,0,0.2)',
    },
    analysisCardContent: {
        padding: `${spacing.sm}px ${spacing.md}px`,
    },
    analysisItem: {
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        padding: `${spacing.xs}px 0`,
        lineHeight: 1.4,
        borderBottom: `1px solid ${colors.borderDark}`,
    },
    statsRow: {
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    stat: {
        flex: 1,
        background: colors.bgCard,
        padding: `${spacing.md}px ${spacing.sm}px`,
        textAlign: 'center',
        borderRadius: borderRadius.sm,
        border: `1px solid ${colors.borderDark}`,
    },
    statNum: {
        fontSize: 22,
        fontWeight: typography.bold,
        color: colors.primary,
    },
    statLabel: {
        fontSize: typography.sizeXs,
        color: colors.textDimmest,
        letterSpacing: typography.letterNormal,
        marginTop: spacing.xs,
        textTransform: 'uppercase',
    },
    insightBox: {
        background: colors.primaryBg,
        border: `1px solid ${colors.borderLight}`,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: borderRadius.sm,
    },
    insightLabel: {
        fontSize: typography.sizeXs,
        color: colors.primary,
        letterSpacing: typography.letterNormal,
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
        fontWeight: typography.semibold,
    },
    insightText: {
        fontSize: typography.sizeMd,
        lineHeight: 1.5,
        color: '#88cc88',
        whiteSpace: 'pre-wrap',
    },
    section: {
        marginBottom: spacing.md,
    },
    sectionHead: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: typography.sizeSm,
        fontWeight: typography.semibold,
        color: colors.textDim,
        letterSpacing: typography.letterNormal,
        marginBottom: spacing.sm,
    },
    btnSmall: {
        padding: `${spacing.xs}px ${spacing.md}px`,
        background: colors.primary,
        border: 'none',
        color: colors.bgDarkest,
        fontSize: typography.sizeXs,
        fontWeight: typography.bold,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
    },
    suggestionItem: {
        padding: spacing.sm,
        background: '#1a0a0a',
        marginBottom: spacing.xs,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.error}`,
    },
    suggestionTitle: {
        display: 'block',
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        ...commonStyles.truncate,
    },
    suggestionReason: {
        display: 'block',
        fontSize: typography.sizeXs,
        color: colors.warning,
        marginTop: 3,
    },
    groupItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: spacing.sm,
        background: colors.infoBg,
        marginBottom: spacing.xs,
        borderRadius: borderRadius.sm,
        borderLeft: `3px solid ${colors.info}`,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
    },
    groupCount: {
        color: colors.info,
        fontSize: typography.sizeSm,
    },
    upgradeBox: {
        background: `linear-gradient(180deg, ${colors.bgDarker}, ${colors.bgCard})`,
        border: `2px solid ${colors.primary}`,
        borderRadius: borderRadius.lg,
        padding: spacing.xxl,
        textAlign: 'center',
    },
    upgradeIcon: {
        marginBottom: spacing.md,
    },
    upgradeTitle: {
        fontSize: typography.sizeXxl,
        fontWeight: typography.bold,
        color: colors.primary,
        letterSpacing: typography.letterWider,
        marginBottom: spacing.sm,
    },
    upgradePrice: {
        fontSize: 36,
        fontWeight: typography.bold,
        color: colors.textPrimary,
    },
    upgradeOnce: {
        fontSize: typography.sizeSm,
        color: colors.textDimmer,
        letterSpacing: typography.letterWide,
        marginBottom: spacing.lg,
    },
    upgradeList: {
        textAlign: 'left',
        listStyle: 'none',
        padding: 0,
        margin: `0 0 ${spacing.xl}px`,
        fontSize: typography.sizeBase,
        color: colors.textDim,
    },
    checkmark: {
        color: colors.primary,
        marginRight: spacing.sm,
        fontWeight: typography.bold,
    },
    btnUpgrade: {
        width: '100%',
        padding: spacing.md,
        background: colors.primary,
        border: 'none',
        color: colors.bgDarkest,
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        letterSpacing: typography.letterWide,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        marginBottom: spacing.sm,
        transition: `all ${transitions.fast}`,
    },
    btnUpgradeHover: {
        background: colors.primaryDark,
    },
    btnRefresh: {
        width: '100%',
        padding: spacing.sm,
        background: 'transparent',
        border: `1px solid ${colors.borderLight}`,
        color: colors.textDimmer,
        fontSize: typography.sizeSm,
        cursor: 'pointer',
        borderRadius: borderRadius.sm,
        transition: `all ${transitions.fast}`,
    },
    // Analytics styles
    healthScoreCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    healthScoreCircle: {
        position: 'relative',
        width: 80,
        height: 80,
    },
    healthScoreValue: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    healthLabel: {
        marginTop: spacing.sm,
        fontSize: typography.sizeLg,
        fontWeight: typography.semibold,
    },
    insightItem: {
        display: 'flex',
        gap: spacing.sm,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        marginBottom: spacing.xs,
        lineHeight: 1.4,
    },
    insightBullet: {
        color: colors.primary,
        fontWeight: typography.bold,
    },
    analyticsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.sm}px 0`,
        borderBottom: `1px solid ${colors.borderDark}`,
    },
    analyticsLabel: {
        flex: 1,
        fontSize: typography.sizeMd,
        color: colors.textMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    analyticsBar: {
        width: 80,
        height: 6,
        background: colors.borderMedium,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    analyticsBarFill: {
        height: '100%',
        borderRadius: borderRadius.full,
        transition: `width ${transitions.normal}`,
    },
    analyticsValue: {
        fontSize: typography.sizeMd,
        color: colors.textDim,
        minWidth: 28,
        textAlign: 'right',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    miniStat: {
        background: colors.bgDarker,
        padding: spacing.sm,
        borderRadius: borderRadius.sm,
        textAlign: 'center',
    },
    miniStatValue: {
        fontSize: typography.sizeXl,
        fontWeight: typography.bold,
        color: colors.primary,
    },
    miniStatLabel: {
        fontSize: typography.sizeXs,
        color: colors.textDimmest,
        marginTop: 2,
    },
};

// Add keyframe animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    input:focus {
        border-color: ${colors.primary} !important;
    }
    button:focus-visible {
        outline: 2px solid ${colors.primary};
        outline-offset: 2px;
    }
    ::-webkit-scrollbar {
        width: 6px;
    }
    ::-webkit-scrollbar-track {
        background: transparent;
    }
    ::-webkit-scrollbar-thumb {
        background: ${colors.borderLight};
        border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: ${colors.textDimmest};
    }
`;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
}
