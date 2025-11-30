const API_BASE = 'https://api-5dab6ha67q-uc.a.run.app';

const DEV_MODE = false;

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
    private deviceId: string | null = null;
    private cachedStatus: LicenseStatus | null = null;
    private lastCheck: number = 0;
    private readonly CACHE_TTL = 60000;

    async initialize(): Promise<void> {
        // Use chrome.storage.sync to persist across reinstalls
        const stored = await chrome.storage.sync.get(['licenseKey', 'deviceId']);
        this.licenseKey = stored.licenseKey || null;
        this.deviceId = stored.deviceId || null;

        if (!this.deviceId) {
            // Create a persistent device ID based on browser fingerprint
            this.deviceId = await this.generateDeviceId();
            await chrome.storage.sync.set({ deviceId: this.deviceId });
        }

        if (!this.licenseKey) {
            await this.register();
        }
    }

    /**
     * Generate a persistent device ID based on browser characteristics
     * This prevents trial bypass by reinstalling the extension
     */
    private async generateDeviceId(): Promise<string> {
        try {
            // Get machine ID from chrome (persistent across extension installs)
            const info = await chrome.storage.local.get(['machineId']);

            if (info.machineId) {
                return info.machineId;
            }

            // Generate a fingerprint based on browser/system characteristics
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                new Date().getTimezoneOffset().toString(),
                screen.width + 'x' + screen.height,
                screen.colorDepth.toString()
            ].join('|');

            // Hash the fingerprint to create a unique device ID
            const encoder = new TextEncoder();
            const data = encoder.encode(fingerprint);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const machineId = 'device_' + hashHex.substring(0, 24);

            // Store in local storage as backup (persists even after sync storage is cleared)
            await chrome.storage.local.set({ machineId });

            return machineId;
        } catch (e) {
            // Fallback to random ID if fingerprinting fails
            return 'device_' + Math.random().toString(36).substring(2, 15) +
                   Math.random().toString(36).substring(2, 15);
        }
    }

    private async register(): Promise<void> {
        if (DEV_MODE) {
            this.licenseKey = 'DEV-MODE-KEY';
            return;
        }

        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: this.deviceId })
        });

        if (!response.ok) {
            throw new Error('Failed to register');
        }

        const data = await response.json();
        this.licenseKey = data.licenseKey;
        // Store in sync storage to persist across reinstalls
        await chrome.storage.sync.set({ licenseKey: data.licenseKey });
    }

    async getStatus(forceRefresh = false): Promise<LicenseStatus> {
        if (DEV_MODE) {
            return {
                status: 'pro',
                paid: true,
                usageRemaining: 999,
                canUse: true
            };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        const now = Date.now();
        if (!forceRefresh && this.cachedStatus && (now - this.lastCheck) < this.CACHE_TTL) {
            return this.cachedStatus;
        }

        try {
            const response = await fetch(`${API_BASE}/status`, {
                headers: {
                    'X-License-Key': this.licenseKey!,
                    'X-Device-Id': this.deviceId!
                }
            });

            if (!response.ok) {
                throw new Error('Failed to get status');
            }

            this.cachedStatus = await response.json();
            this.lastCheck = now;
            return this.cachedStatus!;
        } catch {
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
        if (DEV_MODE) {
            return { allowed: true, remaining: 999 };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        const response = await fetch(`${API_BASE}/use`, {
            method: 'POST',
            headers: {
                'X-License-Key': this.licenseKey!,
                'X-Device-Id': this.deviceId!
            }
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
        if (DEV_MODE) {
            return 'https://example.com/dev-checkout';
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        const response = await fetch(`${API_BASE}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-License-Key': this.licenseKey!,
                'X-Device-Id': this.deviceId!
            }
        });

        if (!response.ok) {
            throw new Error('Failed to create checkout');
        }

        const data = await response.json();
        return data.url;
    }

    clearCache(): void {
        this.cachedStatus = null;
        this.lastCheck = 0;
    }

    getLicenseKey(): string | null {
        return this.licenseKey;
    }

    getDeviceId(): string | null {
        return this.deviceId;
    }

    isPro(): boolean {
        if (DEV_MODE) return true;
        return this.cachedStatus?.paid === true;
    }

    isDevMode(): boolean {
        return DEV_MODE;
    }
}

export const licenseService = new LicenseService();
export type { LicenseStatus, UseResponse };
