import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { colorsPro, spacingPro, typographyPro, borderRadiusPro, transitionsPro, glassPanelStyle, textGradientStyle, animationKeyframes, gridBackgroundCSS } from '../shared/theme-pro';
import { HealthRing } from '../ui/components/HealthRing';
import { Sparkline } from '../ui/components/Sparkline';
import { RamBar } from '../ui/components/RamBar';
import { ScanlineOverlay } from '../ui/components/ScanlineOverlay';

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
    };
}

type NavView = 'dashboard' | 'tabs' | 'analytics' | 'settings';

const DashboardPopup = () => {
    const [view, setView] = useState<NavView>('dashboard');
    const [license, setLicense] = useState<LicenseStatus | null>(null);
    const [memoryReport, setMemoryReport] = useState<MemoryReport | null>(null);
    const [autoPilotReport, setAutoPilotReport] = useState<AutoPilotReport | null>(null);
    const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [provider, setProvider] = useState<string>('none');

    const sendMessage = useCallback(async (action: string, payload?: any) => {
        return await chrome.runtime.sendMessage({ action, payload });
    }, []);

    useEffect(() => {
        loadDashboardData();

        // Update memory history every 5 seconds
        const interval = setInterval(() => {
            updateMemoryHistory();
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const loadDashboardData = async () => {
        // Load license
        const licenseRes = await sendMessage('getLicenseStatus', { forceRefresh: true });
        if (licenseRes.success) setLicense(licenseRes.data);

        // Load memory
        const memRes = await sendMessage('getMemoryReport');
        if (memRes.success) {
            setMemoryReport(memRes.data);
            updateMemoryHistory();
        }

        // Load provider
        const providerRes = await sendMessage('getAIProvider');
        if (providerRes.success) setProvider(providerRes.data.provider);
    };

    const updateMemoryHistory = async () => {
        const memRes = await sendMessage('getMemoryReport');
        if (memRes.success) {
            setMemoryReport(memRes.data);
            setMemoryHistory(prev => {
                const newHistory = [...prev, memRes.data.totalMB];
                return newHistory.slice(-20); // Keep last 20 points
            });
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
        setLoading(false);
    };

    const handleFocusMode = async () => {
        // Close all tabs except active
        const tabsRes = await sendMessage('getWindowTabs');
        if (tabsRes.success) {
            const inactiveTabs = tabsRes.data.filter((t: any) => !t.active);
            const tabIds = inactiveTabs.map((t: any) => t.id);
            await sendMessage('closeTabs', { tabIds });
            await loadDashboardData();
        }
    };

    const getHealthScore = () => {
        if (autoPilotReport?.analytics?.healthScore !== undefined) {
            return autoPilotReport.analytics.healthScore;
        }
        // Estimate based on memory
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
            {/* Inject animations */}
            <style>{animationKeyframes}</style>
            <style>{gridBackgroundCSS}</style>

            {/* Content Area */}
            <div style={styles.content}>
                {view === 'dashboard' && (
                    <DashboardView
                        healthScore={getHealthScore()}
                        memoryHistory={memoryHistory}
                        memoryReport={memoryReport}
                        license={license}
                        loading={loading}
                        onAutoPilot={handleAutoPilot}
                        onPurgeDuplicates={handlePurgeDuplicates}
                        onSmartGroup={handleSmartGroup}
                        onFocusMode={handleFocusMode}
                    />
                )}

                {view === 'tabs' && <TabsView />}
                {view === 'analytics' && <AnalyticsView memoryReport={memoryReport} />}
                {view === 'settings' && <SettingsView license={license} />}
            </div>

            {/* Bottom Navigation */}
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

// Dashboard View Component
const DashboardView: React.FC<{
    healthScore: number;
    memoryHistory: number[];
    memoryReport: MemoryReport | null;
    license: LicenseStatus | null;
    loading: boolean;
    onAutoPilot: () => void;
    onPurgeDuplicates: () => void;
    onSmartGroup: () => void;
    onFocusMode: () => void;
}> = ({ healthScore, memoryHistory, memoryReport, license, loading, onAutoPilot, onPurgeDuplicates, onSmartGroup, onFocusMode }) => {
    return (
        <div style={styles.dashboardGrid}>
            {/* Health Score Card */}
            <div style={{ ...glassPanelStyle, ...styles.card, gridColumn: 'span 2' }}>
                <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>System Health</h3>
                    <span style={styles.badge}>Live</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                    <HealthRing score={healthScore} size={140} label="Health Score" />
                </div>
            </div>

            {/* Memory Sparkline Card */}
            <div style={{ ...glassPanelStyle, ...styles.card, gridColumn: 'span 2' }}>
                <div style={styles.cardHeader}>
                    <h3 style={styles.cardTitle}>Memory Trend</h3>
                    <span style={styles.memoryValue}>
                        {memoryReport?.totalMB ? `${(memoryReport.totalMB / 1024).toFixed(1)}GB` : '--'}
                    </span>
                </div>
                <div style={{ padding: '16px 0' }}>
                    {memoryHistory.length > 1 ? (
                        <Sparkline
                            data={memoryHistory}
                            width={280}
                            height={60}
                            color={colorsPro.accentCyan}
                            fillGradient
                        />
                    ) : (
                        <div style={styles.emptyState}>Building history...</div>
                    )}
                </div>
            </div>

            {/* Quick Actions Grid */}
            <div style={{ gridColumn: 'span 4' }}>
                <h4 style={styles.sectionTitle}>Quick Actions</h4>
                <div style={styles.actionsGrid}>
                    <ActionButton
                        icon="🤖"
                        label="Auto Pilot"
                        description="AI Analysis"
                        onClick={onAutoPilot}
                        disabled={loading || !license?.paid}
                        pro={!license?.paid}
                    />
                    <ActionButton
                        icon="🗑️"
                        label="Purge Dupes"
                        description="Close Duplicates"
                        onClick={onPurgeDuplicates}
                        disabled={loading}
                    />
                    <ActionButton
                        icon="📦"
                        label="Smart Group"
                        description="AI Organize"
                        onClick={onSmartGroup}
                        disabled={loading}
                    />
                    <ActionButton
                        icon="🎯"
                        label="Focus Mode"
                        description="Close All Others"
                        onClick={onFocusMode}
                        disabled={loading}
                    />
                </div>
            </div>
        </div>
    );
};

// Action Button Component
const ActionButton: React.FC<{
    icon: string;
    label: string;
    description: string;
    onClick: () => void;
    disabled?: boolean;
    pro?: boolean;
}> = ({ icon, label, description, onClick, disabled, pro }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isActive, setIsActive] = useState(false);

    return (
        <button
            style={{
                ...glassPanelStyle,
                ...styles.actionButton,
                opacity: disabled ? 0.5 : 1,
                transform: isActive ? 'scale(0.96)' : isHovered ? 'scale(1.02)' : 'scale(1)',
                cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
            onMouseDown={() => setIsActive(true)}
            onMouseUp={() => setIsActive(false)}
        >
            <div style={styles.actionIcon}>{icon}</div>
            <div style={styles.actionLabel}>
                {label}
                {pro && <span style={styles.proBadge}>PRO</span>}
            </div>
            <div style={styles.actionDescription}>{description}</div>
        </button>
    );
};

// Placeholder views (to be expanded)
const TabsView = () => <div style={styles.placeholder}>Tabs View (Original content)</div>;
const AnalyticsView: React.FC<{ memoryReport: MemoryReport | null }> = ({ memoryReport }) => (
    <div style={styles.placeholder}>Analytics View (Charts)</div>
);
const SettingsView: React.FC<{ license: LicenseStatus | null }> = ({ license }) => (
    <div style={styles.placeholder}>Settings View (Upgrade)</div>
);

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
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: spacingPro.md,
        paddingBottom: 80, // Space for bottom nav
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
        marginBottom: spacingPro.md,
    },
    cardTitle: {
        margin: 0,
        fontSize: typographyPro.md,
        fontWeight: typographyPro.semibold,
        color: colorsPro.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    badge: {
        padding: '2px 8px',
        borderRadius: borderRadiusPro.sm,
        fontSize: typographyPro.xs,
        fontWeight: typographyPro.medium,
        background: colorsPro.glassAccent,
        color: colorsPro.primaryPurple,
        border: `1px solid ${colorsPro.primaryPurple}40`,
    },
    memoryValue: {
        fontSize: typographyPro.lg,
        fontWeight: typographyPro.bold,
        color: colorsPro.accentCyan,
        fontFamily: typographyPro.fontMono,
    },
    sectionTitle: {
        margin: 0,
        marginBottom: spacingPro.sm,
        fontSize: typographyPro.sm,
        fontWeight: typographyPro.medium,
        color: colorsPro.textMuted,
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
        transition: transitionsPro.normal,
    },
    actionIcon: {
        fontSize: '32px',
        marginBottom: spacingPro.xs,
    },
    actionLabel: {
        fontSize: typographyPro.md,
        fontWeight: typographyPro.semibold,
        color: colorsPro.textPrimary,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    actionDescription: {
        fontSize: typographyPro.xs,
        color: colorsPro.textDim,
    },
    proBadge: {
        fontSize: typographyPro.xs,
        padding: '2px 4px',
        borderRadius: borderRadiusPro.sm,
        background: colorsPro.proGold,
        color: colorsPro.bgDarkest,
        fontWeight: typographyPro.bold,
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
        fontWeight: typographyPro.medium,
    },
    emptyState: {
        textAlign: 'center',
        color: colorsPro.textDim,
        fontSize: typographyPro.sm,
        padding: '20px',
    },
    placeholder: {
        padding: '40px 20px',
        textAlign: 'center',
        color: colorsPro.textDim,
        fontSize: typographyPro.md,
    },
};

// Mount
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<DashboardPopup />);
}

export {};
