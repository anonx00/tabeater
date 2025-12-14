// Build-time constants injected by webpack DefinePlugin
// These are set during build and cannot be changed without recompiling
// For production builds, these are hardcoded into the bundle
const API_BASE = (process.env.API_BASE || 'https://api-5dab6ha67q-uc.a.run.app') as string;
const DEV_MODE = Boolean(process.env.DEV_MODE);

// Production constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

interface LicenseStatus {
    status: 'trial' | 'pro' | 'expired' | 'none';
    paid: boolean;
    usageRemaining: number;
    dailyLimit?: number;
    trialEndDate?: string;
    trialDaysRemaining?: number;
    canUse: boolean;
    // Pro user info
    email?: string;
    devicesUsed?: number;
    maxDevices?: number;
    purchaseDate?: string;
}

interface DeviceInfo {
    deviceId: string;
    lastActive: string;
    current: boolean;
}

interface UseResponse {
    allowed: boolean;
    remaining: number;
    reason?: string;
}

/**
 * Fetch with timeout and retry logic for production reliability
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        // Retry on 5xx errors
        if (response.status >= 500 && retries > 0) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            return fetchWithRetry(url, options, retries - 1);
        }

        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);

        // Retry on network errors
        if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            return fetchWithRetry(url, options, retries - 1);
        }

        throw error;
    }
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
     * Generate a stable, persistent device ID using UUID
     * Uses a random UUID stored in local storage - survives browser updates
     * This is more reliable than fingerprinting which changes with browser updates
     */
    private async generateDeviceId(): Promise<string> {
        try {
            // Check local storage first (most persistent - survives sync clear)
            const local = await chrome.storage.local.get(['machineId']);
            if (local.machineId) {
                return local.machineId;
            }

            // Generate a stable random UUID (not based on browser characteristics)
            const uuid = crypto.randomUUID();
            const machineId = 'device_' + uuid.replace(/-/g, '').substring(0, 24);

            // Store in local storage for persistence
            await chrome.storage.local.set({ machineId });

            return machineId;
        } catch (e) {
            // Fallback to random ID if crypto.randomUUID fails
            const fallbackId = 'device_' + Math.random().toString(36).substring(2, 15) +
                   Math.random().toString(36).substring(2, 15);
            await chrome.storage.local.set({ machineId: fallbackId });
            return fallbackId;
        }
    }

    private async register(): Promise<void> {
        if (DEV_MODE) {
            this.licenseKey = 'DEV-MODE-KEY';
            return;
        }

        const response = await fetchWithRetry(`${API_BASE}/register`, {
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
            // If force refresh is requested and user is not paid (or status unknown), try to verify payment first
            // This handles cases where webhook failed but user completed payment
            if (forceRefresh && (!this.cachedStatus || !this.cachedStatus.paid)) {
                await this.verifyPayment();
            }

            const response = await fetchWithRetry(`${API_BASE}/status`, {
                method: 'GET',
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

    /**
     * Verify payment with Stripe directly - fallback for when webhooks fail
     * This checks if user completed payment and activates their license
     */
    async verifyPayment(): Promise<{ verified: boolean; status: string }> {
        if (DEV_MODE) {
            return { verified: true, status: 'dev_mode' };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        try {
            const response = await fetchWithRetry(`${API_BASE}/verify-payment`, {
                method: 'POST',
                headers: {
                    'X-License-Key': this.licenseKey!,
                    'X-Device-Id': this.deviceId!
                }
            });

            if (!response.ok) {
                return { verified: false, status: 'error' };
            }

            const result = await response.json();

            // If payment was found and activated, clear cache to force status refresh
            if (result.verified && result.status === 'activated') {
                this.clearCache();
            }

            return result;
        } catch {
            return { verified: false, status: 'network_error' };
        }
    }

    /**
     * Verify payment by email - for users who paid on a different device
     */
    async verifyByEmail(email: string): Promise<{ verified: boolean; status: string }> {
        if (DEV_MODE) {
            return { verified: true, status: 'dev_mode' };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        try {
            const response = await fetchWithRetry(`${API_BASE}/verify-by-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-License-Key': this.licenseKey!,
                    'X-Device-Id': this.deviceId!
                },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                return { verified: false, status: 'error' };
            }

            const result = await response.json();

            if (result.verified && result.status === 'activated') {
                this.clearCache();
            }

            return result;
        } catch {
            return { verified: false, status: 'network_error' };
        }
    }

    async checkAndUse(): Promise<UseResponse> {
        if (DEV_MODE) {
            return { allowed: true, remaining: 999 };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        const response = await fetchWithRetry(`${API_BASE}/use`, {
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

        const response = await fetchWithRetry(`${API_BASE}/checkout`, {
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

    /**
     * Get list of devices for paid users
     */
    async getDevices(): Promise<{ devices: DeviceInfo[]; maxDevices: number } | null> {
        if (DEV_MODE) {
            return {
                devices: [{ deviceId: this.deviceId || 'dev', lastActive: new Date().toISOString(), current: true }],
                maxDevices: 3
            };
        }

        if (!this.licenseKey) {
            await this.initialize();
        }

        try {
            const response = await fetchWithRetry(`${API_BASE}/devices`, {
                method: 'GET',
                headers: {
                    'X-License-Key': this.licenseKey!,
                    'X-Device-Id': this.deviceId!
                }
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch {
            return null;
        }
    }

    /**
     * Remove a device from the license (for paid users)
     */
    async removeDevice(deviceIdToRemove: string): Promise<boolean> {
        if (DEV_MODE) return true;

        if (!this.licenseKey) {
            await this.initialize();
        }

        try {
            const response = await fetchWithRetry(`${API_BASE}/devices/${deviceIdToRemove}`, {
                method: 'DELETE',
                headers: {
                    'X-License-Key': this.licenseKey!,
                    'X-Device-Id': this.deviceId!
                }
            });

            if (response.ok) {
                this.clearCache();
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Get trial info with days remaining calculation
     */
    async getTrialInfo(): Promise<{ daysRemaining: number; startDate: string; endDate: string } | null> {
        // Check local storage for trial start date
        const stored = await chrome.storage.local.get(['trialStartDate']);

        if (!stored.trialStartDate) {
            // Start trial now
            const startDate = new Date().toISOString();
            await chrome.storage.local.set({ trialStartDate: startDate });
            return {
                daysRemaining: 7,
                startDate,
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
        }

        const startDate = new Date(stored.trialStartDate);
        const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

        return {
            daysRemaining,
            startDate: stored.trialStartDate,
            endDate: endDate.toISOString()
        };
    }
}

export const licenseService = new LicenseService();
export type { LicenseStatus, UseResponse };
