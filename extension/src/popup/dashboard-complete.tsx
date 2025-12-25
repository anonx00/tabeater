import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colorsPro, spacingPro, typographyPro, borderRadiusPro, transitionsPro, glassPanelStyle, textGradientStyle, animationKeyframes, gridBackgroundCSS } from '../shared/theme-pro';
import { HealthRing } from '../ui/components/HealthRing';
import { Sparkline } from '../ui/components/Sparkline';
import { RamBar } from '../ui/components/RamBar';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';
import { faviconFallback } from '../shared/theme';

// Types
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
    dailyLimit?: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface MemoryReport {
    totalMB: number;
    tabs: any[];
    heavyTabs: any[];
    systemMemory?: {
        availableMB: number;
        capacityMB: number;
        usedMB: number;
    };
    browserMemoryMB: number;
}

interface AutoPilotReport {
    analytics?: {
        healthScore: number;
        healthLabel: string;
        insights: string[];
        categoryBreakdown?: { category: string; count: number; percentage: number }[];
    };
}

type NavView = 'dashboard' | 'tabs' | 'analytics' | 'settings';

const DashboardPopup = () => {
    const [view, setView] = useState<NavView>('dashboard');
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [memoryReport, setMemoryReport] = useState<MemoryReport | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);
    const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [provider, setProvider] = useState<string>('none');
    const [searchQuery, setSearchQuery] = useState('');

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    }, []);

    useEffect(() => {
        loadDashboardData();
        const interval = setInterval(() => updateMemoryHistory(), 5000);
        return () => clearInterval(interval);
    }, []);

    const loadDashboardData = async () => {
        const [licenseRes, memRes, providerRes, tabsRes] = await Promise.all([
            sendMessage('getLicenseStatus', { forceRefresh: true }),
            sendMessage('getMemoryReport'),
            sendMessage('getAIProvider'),
            sendMessage('getWindowTabs'),
        ]);

        if (licenseRes.success) setLicense(licenseRes.data);
        if (memRes.success) {
            setMemoryReport(memRes.data);
            updateMemoryHistory();
        }
        if (providerRes.success) setProvider(providerRes.data.provider);
        if (tabsRes.success) setTabs(tabsRes.data);
    };

    const updateMemoryHistory = async () => {
        const memRes = await sendMessage('getMemoryReport');
        if (memRes.success) {
            setMemoryReport(memRes.data);
            setMemoryHistory(prev => [...prev, memRes.data.totalMB].slice(-20));
        }
    };

    const handleAutoPilot = async () => {
        if (!license?.paid) {
            setView('settings');
            return;
        }
        setLoading(true);
        const response = await sendMessage('autoPilotAnalyzeWithAI');
        if (response.success) {
            setAutoPilotReport(response.data);
        }
        setLoading(false);
    };

    const handlePurgeDuplicates = async () => {
        setLoading(true);
        const dupsRes = await sendMessage('getDuplicates');
        if (dupsRes.success && dupsRes.data.length > 0) {
            const tabsToClose: number[] = [];
            for (const group of dupsRes.data) {
                tabsToClose.push(...group.slice(1).map((t: any) => t.id));
            }
            await sendMessage('closeTabs', { tabIds: tabsToClose });
            await loadDashboardData();
        }
        setLoading(false);
    };

    const handleSmartGroup = async () => {
        if (provider === 'none') {
            alert('Configure AI in settings first');
            return;
        }
        setLoading(true);
        await sendMessage('smartOrganize');
        await loadDashboardData();
        setLoading(false);
    };

    const handleFocusMode = async () => {
        const inactiveTabs = tabs.filter(t => !t.active);
        const tabIds = inactiveTabs.map(t => t.id);
        await sendMessage('closeTabs', { tabIds });
        await loadDashboardData();
    };

    const closeTab = async (tabId: number) => {
        setTabs(prev => prev.filter(t => t.id !== tabId));
        await sendMessage('closeTab', { tabId });
    };

    const getHealthScore = () => {
        if (autoPilotReport?.analytics?.healthScore !== undefined) {
            return autoPilotReport.analytics.healthScore;
        }
        if (!memoryReport) return 75;
        const tabCount = memoryReport.tabs.length;
        const memoryPerTab = memoryReport.totalMB / tabCount;
        let score = 100;
        if (tabCount > 50) score -= 20;
        else if (tabCount > 30) score -= 10;
        if (memoryPerTab > 150) score -= 20;
        else if (memoryPerTab > 100) score -= 10;
        return Math.max(score, 0);
    };

    return (
        <div style={styles.container}>
            <style>{animationKeyframes}</style>
            <style>{gridBackgroundCSS}</style>

            <div style={styles.content}>
                {loading && <LoadingOverlay />}

                {view === 'dashboard' && (
                    <DashboardView
                        healthScore={getHealthScore()}
                        memoryHistory={memoryHistory}
                        memoryReport={memoryReport}
                        license={license}
                        loading={loading}
                        tabCount={tabs.length}
                        onAutoPilot={handleAutoPilot}
                        onPurgeDuplicates={handlePurgeDuplicates}
                        onSmartGroup={handleSmartGroup}
                        onFocusMode={handleFocusMode}
                    />
                )}

                {view === 'tabs' && (
                    <TabsView
                        tabs={tabs}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onCloseTab={closeTab}
                    />
                )}

                {view === 'analytics' && (
                    <AnalyticsView
                        memoryReport={memoryReport}
                        autoPilotReport={autoPilotReport}
                        license={license}
                        onRunAnalysis={handleAutoPilot}
                    />
                )}

                {view === 'settings' && (
                    <SettingsView license={license} />
                )}
            </div>

            <nav style={styles.bottomNav}>
                {[
                    { key: 'dashboard', icon: '⚡', label: 'Home' },
                    { key: 'tabs', icon: '📑', label: 'Tabs' },
                    { key: 'analytics', icon: '📊', label: 'Stats' },
                    { key: 'settings', icon: '⚙️', label: 'Settings' },
                ].map((item) => (
                    <button
                        key={item.key}
                        style={{
                            ...styles.navButton,
                            ...(view === item.key ? styles.navButtonActive : {}),
                        }}
                        onClick={() => setView(item.key as NavView)}
                    >
                        <span style={{ fontSize: '20px' }}>{item.icon}</span>
                        <span style={styles.navButtonLabel}>{item.label}</span>
                    </button>
                ))}
            </nav>

            <ScanlineOverlay />
        </div>
    );
};

// Loading Overlay
const LoadingOverlay = () => (
    <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `${colorsPro.bgDarkest}ee`,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease',
    }}>
        <div style={{
            width: '40px',
            height: '40px',
            border: `3px solid ${colorsPro.borderMedium}`,
            borderTop: `3px solid ${colorsPro.primaryPurple}`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `}</style>
    </div>
);

// Dashboard View
const DashboardView: React.FC<{
    healthScore: number;
    memoryHistory: number[];
    memoryReport: MemoryReport | null;
    license: LicenseStatus | null;
    loading: boolean;
    tabCount: number;
    onAutoPilot: () => void;
    onPurgeDuplicates: () => void;
    onSmartGroup: () => void;
    onFocusMode: () => void;
}> = ({ healthScore, memoryHistory, memoryReport, license, loading, tabCount, onAutoPilot, onPurgeDuplicates, onSmartGroup, onFocusMode }) => {
    return (
        <div style={styles.dashboardGrid}>
            {/* Health Card */}
            <div style={{ ...glassPanelStyle, ...styles.card, gridColumn: 'span 2' }}>
                <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>Health</h3>
                    <span style={styles.statValue}>{tabCount} tabs</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                    <HealthRing score={healthScore} size={120} label="" />
                </div>
            </div>

            {/* Memory Card */}
            <div style={{ ...glassPanelStyle, ...styles.card, gridColumn: 'span 2' }}>
                <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>Memory</h3>
                    <span style={styles.statValue}>
                        {memoryReport?.totalMB ? `${(memoryReport.totalMB / 1024).toFixed(1)}GB` : '--'}
                    </span>
                </div>
                <div style={{ padding: '12px 0' }}>
                    {memoryHistory.length > 1 ? (
                        <Sparkline data={memoryHistory} width={280} height={50} color={colorsPro.accentCyan} fillGradient />
                    ) : (
                        <div style={styles.emptyState}>Collecting data...</div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div style={{ gridColumn: 'span 4' }}>
                <h4 style={styles.sectionTitle}>Quick Actions</h4>
                <div style={styles.actionsGrid}>
                    <ActionButton icon="🤖" label="Auto Pilot" onClick={onAutoPilot} disabled={loading || !license?.paid} pro={!license?.paid} />
                    <ActionButton icon="🗑️" label="Purge Dupes" onClick={onPurgeDuplicates} disabled={loading} />
                    <ActionButton icon="📦" label="Smart Group" onClick={onSmartGroup} disabled={loading} />
                    <ActionButton icon="🎯" label="Focus" onClick={onFocusMode} disabled={loading} />
                </div>
            </div>
        </div>
    );
};

// Action Button
const ActionButton: React.FC<{
    icon: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    pro?: boolean;
}> = ({ icon, label, onClick, disabled, pro }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isActive, setIsActive] = useState(false);

    return (
        <button
            style={{
                ...glassPanelStyle,
                ...styles.actionButton,
                opacity: disabled ? 0.5 : 1,
                transform: isActive ? 'scale(0.95)' : isHovered ? 'scale(1.02)' : 'scale(1)',
                cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
            onMouseDown={() => setIsActive(true)}
            onMouseUp={() => setIsActive(false)}
        >
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>{icon}</div>
            <div style={styles.actionLabel}>
                {label}
                {pro && <span style={styles.proBadge}>PRO</span>}
            </div>
        </button>
    );
};

// Tabs View
const TabsView: React.FC<{
    tabs: TabInfo[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onCloseTab: (id: number) => void;
}> = ({ tabs, searchQuery, onSearchChange, onCloseTab }) => {
    const filteredTabs = searchQuery
        ? tabs.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.url.toLowerCase().includes(searchQuery.toLowerCase()))
        : tabs;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacingPro.md }}>
            {/* Search */}
            <div style={styles.searchContainer}>
                <input
                    type="text"
                    placeholder="Search tabs..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    style={styles.searchInput}
                />
            </div>

            {/* Tab List */}
            <div style={styles.tabListContainer}>
                {filteredTabs.length === 0 ? (
                    <div style={styles.emptyState}>
                        {searchQuery ? 'No tabs match your search' : 'No tabs open'}
                    </div>
                ) : (
                    filteredTabs.map((tab, index) => (
                        <TabCard key={tab.id} tab={tab} onClose={onCloseTab} index={index} />
                    ))
                )}
            </div>
        </div>
    );
};

// Tab Card
const TabCard: React.FC<{ tab: TabInfo; onClose: (id: number) => void; index: number }> = ({ tab, onClose, index }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            style={{
                ...glassPanelStyle,
                ...styles.tabCard,
                animation: `fadeIn 0.3s ease ${index * 0.03}s backwards`,
                borderColor: tab.active ? colorsPro.primaryPurple : colorsPro.borderMedium,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <img src={tab.favIconUrl || faviconFallback} style={styles.tabFavicon} alt="" />
            <div style={styles.tabInfo}>
                <div style={styles.tabTitle}>{tab.title}</div>
                <div style={styles.tabUrl}>{new URL(tab.url).hostname}</div>
            </div>
            {isHovered && (
                <button
                    style={styles.tabCloseBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose(tab.id);
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
};

// Analytics View
const AnalyticsView: React.FC<{
    memoryReport: MemoryReport | null;
    autoPilotReport: AutoPilotReport | null;
    license: LicenseStatus | null;
    onRunAnalysis: () => void;
}> = ({ memoryReport, autoPilotReport, license, onRunAnalysis }) => {
    if (!license?.paid) {
        return (
            <div style={{ ...styles.emptyState, padding: '40px 20px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                <div style={{ marginBottom: '16px' }}>Analytics require Pro</div>
                <button style={styles.upgradeBtn} onClick={() => window.location.href = '#settings'}>
                    Upgrade to Pro
                </button>
            </div>
        );
    }

    if (!autoPilotReport) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <button style={styles.upgradeBtn} onClick={onRunAnalysis}>
                    Run Analysis
                </button>
            </div>
        );
    }

    return (
        <div style={styles.analyticsGrid}>
            {/* Memory Distribution */}
            {memoryReport && (
                <div style={{ ...glassPanelStyle, ...styles.card }}>
                    <h3 style={styles.cardTitle}>Memory Distribution</h3>
                    <div style={{ padding: '16px 0' }}>
                        <MemoryDonut memoryReport={memoryReport} />
                    </div>
                </div>
            )}

            {/* Top Offenders */}
            {memoryReport && memoryReport.heavyTabs.length > 0 && (
                <div style={{ ...glassPanelStyle, ...styles.card }}>
                    <h3 style={styles.cardTitle}>Top Memory Hogs</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                        {memoryReport.heavyTabs.slice(0, 3).map((tab: any) => (
                            <div key={tab.tabId}>
                                <div style={styles.tabTitle}>{tab.title.slice(0, 30)}...</div>
                                <RamBar value={tab.actualMB} max={500} showLabel height={4} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Insights */}
            {autoPilotReport.analytics?.insights && (
                <div style={{ ...glassPanelStyle, ...styles.card, gridColumn: 'span 2' }}>
                    <h3 style={styles.cardTitle}>Insights</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                        {autoPilotReport.analytics.insights.slice(0, 4).map((insight, i) => (
                            <div key={i} style={styles.insightItem}>
                                <span style={{ color: colorsPro.accentCyan }}>•</span>
                                <span>{insight}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Memory Donut Chart
const MemoryDonut: React.FC<{ memoryReport: MemoryReport }> = ({ memoryReport }) => {
    const total = memoryReport.browserMemoryMB;
    const tabs = memoryReport.totalMB;
    const browser = total - tabs;
    const tabPercent = (tabs / total) * 100;
    const browserPercent = (browser / total) * 100;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke={colorsPro.borderMedium} strokeWidth="10" />
                <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={colorsPro.accentCyan}
                    strokeWidth="10"
                    strokeDasharray={`${tabPercent * 2.51} 251`}
                    transform="rotate(-90 50 50)"
                />
            </svg>
            <div style={{ flex: 1 }}>
                <div style={styles.donutLegendItem}>
                    <div style={{ ...styles.donutDot, background: colorsPro.accentCyan }} />
                    <span>Tabs: {(tabs / 1024).toFixed(1)}GB ({tabPercent.toFixed(0)}%)</span>
                </div>
                <div style={styles.donutLegendItem}>
                    <div style={{ ...styles.donutDot, background: colorsPro.borderMedium }} />
                    <span>Browser: {(browser / 1024).toFixed(1)}GB ({browserPercent.toFixed(0)}%)</span>
                </div>
            </div>
        </div>
    );
};

// Settings/Upgrade View
const SettingsView: React.FC<{ license: LicenseStatus | null }> = ({ license }) => {
    const handleUpgrade = async () => {
        const response = await chrome.runtime.sendMessage({ action: 'getCheckoutUrl' });
        if (response.success) chrome.tabs.create({ url: response.data.url });
    };

    if (license?.paid) {
        return (
            <div style={{ ...glassPanelStyle, ...styles.card, margin: '20px' }}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>✨</div>
                    <h2 style={{ ...styles.cardTitle, fontSize: typographyPro.xl }}>Pro Active</h2>
                    <p style={{ color: colorsPro.textMuted, marginTop: '8px' }}>
                        You have unlimited access to all features
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.upgradeContainer}>
            {/* Premium Card */}
            <div style={styles.upgradeCard}>
                <div style={styles.upgradeGlow} />
                <div style={styles.upgradeHeader}>
                    <div style={styles.upgradeIcon}>👑</div>
                    <h2 style={styles.upgradeTitle}>Upgrade to Pro</h2>
                    <div style={styles.upgradePrice}>
                        <span style={styles.upgradePriceCurrency}>$</span>
                        <span style={styles.upgradePriceAmount}>2</span>
                        <span style={styles.upgradePriceNote}>/month</span>
                    </div>
                </div>

                <div style={styles.upgradeFeatures}>
                    {[
                        { icon: '🤖', text: 'Auto Pilot AI Analysis' },
                        { icon: '📊', text: 'Advanced Analytics' },
                        { icon: '♾️', text: 'Unlimited AI Queries' },
                        { icon: '🎯', text: 'Smart Organization' },
                    ].map((feature, i) => (
                        <div key={i} style={styles.upgradeFeature}>
                            <span style={{ fontSize: '20px' }}>{feature.icon}</span>
                            <span>{feature.text}</span>
                        </div>
                    ))}
                </div>

                <button style={styles.upgradeButton} onClick={handleUpgrade}>
                    <span>Upgrade Now</span>
                    <span style={{ marginLeft: '8px' }}>→</span>
                </button>

                {license?.status === 'trial' && (
                    <div style={styles.trialNote}>
                        Free trial: {license.usageRemaining}/{license.dailyLimit || 20} queries remaining
                    </div>
                )}
            </div>
        </div>
    );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: 400,
        minHeight: 500,
        maxHeight: 600,
        background: colorsPro.bgDarkest,
        color: colorsPro.textPrimary,
        fontFamily: typographyPro.fontSans,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: spacingPro.md,
        paddingBottom: 80,
    },
    dashboardGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacingPro.md,
    },
    card: {
        padding: spacingPro.lg,
        animation: 'fadeIn 0.3s ease-out',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacingPro.sm,
    },
    cardTitle: {
        margin: 0,
        fontSize: typographyPro.sm,
        fontWeight: typographyPro.weightSemibold,
        color: colorsPro.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    statValue: {
        fontSize: typographyPro.md,
        fontWeight: typographyPro.weightBold,
        color: colorsPro.accentCyan,
        fontFamily: typographyPro.fontMono,
    },
    sectionTitle: {
        margin: 0,
        marginBottom: spacingPro.sm,
        fontSize: typographyPro.xs,
        fontWeight: typographyPro.weightMedium,
        color: colorsPro.textDim,
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    actionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: spacingPro.sm,
    },
    actionButton: {
        padding: spacingPro.lg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacingPro.xs,
        border: `1px solid ${colorsPro.borderMedium}`,
        background: colorsPro.glassLight,
        transition: transitionsPro.fast,
    },
    actionLabel: {
        fontSize: typographyPro.sm,
        fontWeight: typographyPro.weightMedium,
        color: colorsPro.textPrimary,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    proBadge: {
        fontSize: typographyPro.xs,
        padding: '2px 4px',
        borderRadius: borderRadiusPro.sm,
        background: colorsPro.proGold,
        color: colorsPro.bgDarkest,
        fontWeight: typographyPro.weightBold,
    },
    searchContainer: {
        ...glassPanelStyle,
        padding: spacingPro.sm,
    },
    searchInput: {
        width: '100%',
        padding: spacingPro.sm,
        background: colorsPro.bgCard,
        border: `1px solid ${colorsPro.borderSubtle}`,
        borderRadius: borderRadiusPro.md,
        color: colorsPro.textPrimary,
        fontSize: typographyPro.base,
        fontFamily: typographyPro.fontSans,
        outline: 'none',
        transition: transitionsPro.fast,
    },
    tabListContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: spacingPro.sm,
    },
    tabCard: {
        padding: spacingPro.md,
        display: 'flex',
        alignItems: 'center',
        gap: spacingPro.sm,
        transition: transitionsPro.fast,
        cursor: 'pointer',
    },
    tabFavicon: {
        width: 16,
        height: 16,
        flexShrink: 0,
    },
    tabInfo: {
        flex: 1,
        minWidth: 0,
    },
    tabTitle: {
        fontSize: typographyPro.sm,
        color: colorsPro.textPrimary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    tabUrl: {
        fontSize: typographyPro.xs,
        color: colorsPro.textDim,
        fontFamily: typographyPro.fontMono,
    },
    tabCloseBtn: {
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colorsPro.glassLight,
        border: `1px solid ${colorsPro.borderMedium}`,
        borderRadius: borderRadiusPro.sm,
        color: colorsPro.textMuted,
        cursor: 'pointer',
        fontSize: '18px',
        transition: transitionsPro.fast,
    },
    analyticsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: spacingPro.md,
    },
    donutLegendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: typographyPro.sm,
        color: colorsPro.textMuted,
        marginBottom: '4px',
    },
    donutDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
    },
    insightItem: {
        display: 'flex',
        gap: '8px',
        fontSize: typographyPro.sm,
        color: colorsPro.textSecondary,
    },
    upgradeContainer: {
        padding: spacingPro.lg,
    },
    upgradeCard: {
        ...glassPanelStyle,
        padding: spacingPro.xxl,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    upgradeGlow: {
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        right: '-50%',
        bottom: '-50%',
        background: `radial-gradient(circle, ${colorsPro.proGold}20 0%, transparent 70%)`,
        animation: 'glow 3s ease-in-out infinite',
        pointerEvents: 'none',
    },
    upgradeHeader: {
        position: 'relative',
        zIndex: 1,
    },
    upgradeIcon: {
        fontSize: '48px',
        marginBottom: spacingPro.md,
    },
    upgradeTitle: {
        fontSize: typographyPro.xxl,
        fontWeight: typographyPro.weightBold,
        background: `linear-gradient(135deg, ${colorsPro.proGold} 0%, ${colorsPro.primaryPurple} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: spacingPro.md,
    },
    upgradePrice: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: '4px',
        marginBottom: spacingPro.lg,
    },
    upgradePriceCurrency: {
        fontSize: typographyPro.xl,
        color: colorsPro.proGold,
        fontWeight: typographyPro.weightBold,
    },
    upgradePriceAmount: {
        fontSize: '48px',
        color: colorsPro.proGold,
        fontWeight: typographyPro.weightBold,
        fontFamily: typographyPro.fontMono,
    },
    upgradePriceNote: {
        fontSize: typographyPro.sm,
        color: colorsPro.textDim,
    },
    upgradeFeatures: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: spacingPro.md,
        marginBottom: spacingPro.xl,
        position: 'relative',
        zIndex: 1,
    },
    upgradeFeature: {
        display: 'flex',
        alignItems: 'center',
        gap: spacingPro.sm,
        padding: spacingPro.sm,
        background: colorsPro.glassLight,
        borderRadius: borderRadiusPro.md,
        border: `1px solid ${colorsPro.borderSubtle}`,
        fontSize: typographyPro.sm,
    },
    upgradeButton: {
        width: '100%',
        padding: `${spacingPro.md}px ${spacingPro.xl}px`,
        background: `linear-gradient(135deg, ${colorsPro.proGold} 0%, ${colorsPro.primaryPurple} 100%)`,
        border: 'none',
        borderRadius: borderRadiusPro.md,
        color: colorsPro.bgDarkest,
        fontSize: typographyPro.md,
        fontWeight: typographyPro.weightBold,
        cursor: 'pointer',
        transition: transitionsPro.fast,
        position: 'relative',
        zIndex: 1,
    },
    trialNote: {
        marginTop: spacingPro.md,
        fontSize: typographyPro.xs,
        color: colorsPro.textDim,
        position: 'relative',
        zIndex: 1,
    },
    upgradeBtn: {
        padding: `${spacingPro.sm}px ${spacingPro.lg}px`,
        background: colorsPro.primaryPurple,
        border: 'none',
        borderRadius: borderRadiusPro.md,
        color: colorsPro.textPrimary,
        fontSize: typographyPro.base,
        fontWeight: typographyPro.weightSemibold,
        cursor: 'pointer',
        transition: transitionsPro.fast,
    },
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        background: colorsPro.glassHeavy,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${colorsPro.borderMedium}`,
        display: 'flex',
        justifyContent: 'space-around',
        padding: `${spacingPro.xs}px ${spacingPro.sm}px`,
        boxShadow: `0 -2px 10px ${colorsPro.bgDarkest}80`,
    },
    navButton: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        background: 'transparent',
        border: 'none',
        color: colorsPro.textDim,
        cursor: 'pointer',
        transition: transitionsPro.fast,
        borderRadius: borderRadiusPro.md,
        padding: spacingPro.xs,
    },
    navButtonActive: {
        color: colorsPro.primaryPurple,
        background: colorsPro.glassAccent,
    },
    navButtonLabel: {
        fontSize: typographyPro.xs,
        fontWeight: typographyPro.weightMedium,
    },
    emptyState: {
        textAlign: 'center',
        color: colorsPro.textDim,
        fontSize: typographyPro.sm,
        padding: '20px',
    },
};

// Mount
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<DashboardPopup />);
}

export {};
