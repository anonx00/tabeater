import React from 'react';
import { TabData } from '../../ai/prompts';

interface TabListProps {
    tabs: TabData[];
    analysis?: Record<number, { category?: string; priority?: string; reason?: string }>;
    onCloseTab?: (id: number) => void;
}

export const TabList: React.FC<TabListProps> = ({ tabs, analysis, onCloseTab }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tabs.map(tab => {
                const info = analysis?.[tab.id];
                const priorityColor = info?.priority === 'HIGH' ? 'var(--color-secondary)' :
                    info?.priority === 'MEDIUM' ? 'yellow' : 'var(--color-text-muted)';

                return (
                    <div key={tab.id} style={{
                        border: '1px solid var(--color-surface)',
                        padding: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)'
                    }}>
                        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1, marginRight: '1rem' }}>
                            <div style={{ color: priorityColor, fontSize: '0.8em', marginBottom: '0.2rem' }}>
                                [{info?.priority || 'UNK'}] {info?.category || 'ANALYZING...'}
                            </div>
                            <div title={tab.title}>{tab.title}</div>
                        </div>
                        {onCloseTab && (
                            <button
                                onClick={() => onCloseTab(tab.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '1.2em'
                                }}
                            >
                                ×
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
