import { useState, useCallback } from 'react';

interface MessageResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

export function useMessaging() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(async <T = any>(
        action: string,
        payload?: any
    ): Promise<T | null> => {
        setLoading(true);
        setError(null);

        try {
            const response: MessageResponse<T> = await chrome.runtime.sendMessage({
                action,
                payload
            });

            if (!response.success) {
                setError(response.error || 'Unknown error');
                return null;
            }

            return response.data ?? null;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return { sendMessage, loading, error };
}
