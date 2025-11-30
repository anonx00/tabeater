const API_BASE = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api';

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    trialEndDate?: string;
    canUse: boolean;
}

interface UseResponse {
    allowed: boolean;
    remaining: number;
    reason?: string;
}

class LicenseService {
    private licenseKey: string | null = null;
    private cachedStatus: LicenseStatus | null = null;
    private lastCheck: number = 0;
    private readonly CACHE_TTL = 60000;

    async initialize(): Promise<void> {
        const stored = await chrome.storage.local.get(['licenseKey']);
        this.licenseKey = stored.licenseKey || null;

        if (!this.licenseKey) {
            await this.register();
        }
    }

    private async register(): Promise<void> {
        const deviceId = await this.getDeviceId();

        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });

        if (!response.ok) {
            throw new Error('Failed to register');
        }

        const data = await response.json();
        this.licenseKey = data.licenseKey;
        await chrome.storage.local.set({ licenseKey: data.licenseKey });
    }

    private async getDeviceId(): Promise<string> {
        const stored = await chrome.storage.local.get(['deviceId']);
        if (stored.deviceId) return stored.deviceId;

        const deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
        await chrome.storage.local.set({ deviceId });
        return deviceId;
    }

    async getStatus(forceRefresh = false): Promise<LicenseStatus> {
        if (!this.licenseKey) {
            await this.initialize();
        }

        const now = Date.now();
        if (!forceRefresh && this.cachedStatus && (now - this.lastCheck) < this.CACHE_TTL) {
            return this.cachedStatus;
        }

        try {
            const response = await fetch(`${API_BASE}/status`, {
                headers: { 'X-License-Key': this.licenseKey! }
            });

            if (!response.ok) {
                throw new Error('Failed to get status');
            }

            this.cachedStatus = await response.json();
            this.lastCheck = now;
            return this.cachedStatus!;
        } catch (err) {
            if (this.cachedStatus) return this.cachedStatus;
            return {
                status: 'none',
                paid: false,
                usageRemaining: 0,
                canUse: false
            };
        }
    }

    async checkAndUse(): Promise<UseResponse> {
        if (!this.licenseKey) {
            await this.initialize();
        }

        const response = await fetch(`${API_BASE}/use`, {
            method: 'POST',
            headers: { 'X-License-Key': this.licenseKey! }
        });

        if (!response.ok) {
            throw new Error('Failed to record usage');
        }

        const result = await response.json();

        if (result.allowed && this.cachedStatus) {
            this.cachedStatus.usageRemaining = result.remaining;
        }

        return result;
    }

    async getCheckoutUrl(): Promise<string> {
        if (!this.licenseKey) {
            await this.initialize();
        }

        const response = await fetch(`${API_BASE}/checkout`, {
            method: 'POST',
            headers: { 'X-License-Key': this.licenseKey! }
        });

        if (!response.ok) {
            throw new Error('Failed to create checkout');
        }

        const data = await response.json();
        return data.url;
    }

    getLicenseKey(): string | null {
        return this.licenseKey;
    }

    isPro(): boolean {
        return this.cachedStatus?.paid === true;
    }
}

export const licenseService = new LicenseService();
export type { LicenseStatus, UseResponse };
