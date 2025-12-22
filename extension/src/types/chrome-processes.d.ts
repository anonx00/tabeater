/**
 * Type definitions for Chrome Processes API
 * https://developer.chrome.com/docs/extensions/reference/processes/
 */

declare namespace chrome.processes {
    interface ProcessInfo {
        /** The type of process (browser, renderer, extension, notification, plugin, worker, nacl, utility, gpu, other) */
        type: string;
        /** The unique ID of the process, as provided by the OS */
        id: number;
        /** The ID of the profile which the process is associated with */
        profile: string;
        /** The debugging port for Native Client processes. Zero for other process types. */
        naclDebugPort: number;
        /** Array of Tab IDs that have a page rendered by this process */
        tabs: number[];
        /** The CPU usage of the process, in percent */
        cpu?: number;
        /** The network usage of the process, in bytes per second */
        network?: number;
        /** The private memory usage of the process, in bytes */
        privateMemory?: number;
        /** The JavaScript memory allocated to the process, in bytes */
        jsMemoryAllocated?: number;
        /** The JavaScript memory used by the process, in bytes */
        jsMemoryUsed?: number;
        /** The SQLite memory used by the process, in bytes */
        sqliteMemory?: number;
        /** The FPS of the process */
        fps?: number;
        /** The CSS memory cache of the process, in bytes */
        cssMemory?: number;
        /** The image cache memory usage of the process, in bytes */
        imageMemory?: number;
        /** The script memory usage of the process, in bytes */
        scriptMemory?: number;
    }

    interface ProcessInfoMap {
        [processId: number]: ProcessInfo;
    }

    /**
     * Returns information about currently running processes
     * @param processIds Optional array of process IDs to get info for. If empty/null, gets all processes
     * @param includeMemory Whether to include memory usage information
     * @param callback Called with process information
     */
    function getProcessInfo(
        processIds: number[],
        includeMemory: boolean,
        callback: (processes: ProcessInfoMap) => void
    ): void;

    /**
     * Returns the ID of the process that is hosting the tab
     * @param tabId The ID of the tab
     * @param callback Called with the process ID
     */
    function getProcessIdForTab(
        tabId: number,
        callback: (processId: number) => void
    ): void;

    /**
     * Terminates the specified process
     * @param processId The ID of the process to terminate
     * @param callback Called when the process has been terminated
     */
    function terminate(
        processId: number,
        callback?: (didTerminate: boolean) => void
    ): void;

    /**
     * Fired each time the Task Manager updates its process statistics
     */
    const onUpdated: chrome.events.Event<(processes: ProcessInfoMap) => void>;

    /**
     * Fired each time the Task Manager updates its process statistics with memory information
     */
    const onUpdatedWithMemory: chrome.events.Event<(processes: ProcessInfoMap) => void>;

    /**
     * Fired each time a process is created
     */
    const onCreated: chrome.events.Event<(process: ProcessInfo) => void>;

    /**
     * Fired each time a process becomes unresponsive
     */
    const onUnresponsive: chrome.events.Event<(process: ProcessInfo) => void>;

    /**
     * Fired each time a process is terminated
     */
    const onExited: chrome.events.Event<(processId: number, exitType: number, exitCode: number) => void>;
}
