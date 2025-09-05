// DriveBridge Verbose Logging System
// Production-ready logging with downloadable verbose logs and full API

class Logger {
    constructor() {
        this.logs = [];
        this.config = this.getLoggingConfig();
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        this.maxLogEntries = 1000;
        this.rotationThreshold = 500;
        
        // Initialize with welcome message
        this.info('Logger initialized', { 
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            maxEntries: this.maxLogEntries 
        });
    }

    getLoggingConfig() {
        // Try to get config from global Config object, fallback to defaults
        if (typeof Config !== 'undefined' && Config.getLoggingConfig) {
            return Config.getLoggingConfig();
        }
        
        return {
            levels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4 },
            defaultLevel: 'INFO',
            enableConsoleLog: true,
            enableFileExport: true,
            timestampFormat: 'ISO',
            categoryColors: {
                ERROR: 'color: red',
                WARN: 'color: orange', 
                INFO: 'color: blue',
                DEBUG: 'color: gray',
                TRACE: 'color: purple'
            }
        };
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    log(level, message, data = {}, category = 'GENERAL') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            category: category.toUpperCase(),
            message: String(message || ''),
             this.sanitizeData(data),
            sessionId: this.sessionId,
            id: Date.now() + Math.random(),
            duration: Date.now() - this.startTime
        };

        // Add to logs array
        this.logs.push(logEntry);

        // Console output if enabled
        if (this.config.enableConsoleLog) {
            this.outputToConsole(logEntry);
        }

        // Rotate logs if needed
        this.rotateLogsIfNeeded();

        // Update UI if available
        this.updateUILogs();
    }

    sanitizeData(data) {
        try {
            // Deep clone and sanitize the data object
            return JSON.parse(JSON.stringify(data || {}));
        } catch (error) {
            return { error: 'Failed to serialize log data', original: String(data) };
        }
    }

    outputToConsole(entry) {
        const method = this.getConsoleMethod(entry.level);
        const style = this.config.categoryColors[entry.level] || '';
        
        method(
            `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}`,
            entry.data
        );
    }

    getConsoleMethod(level) {
        switch (level.toUpperCase()) {
            case 'ERROR': return console.error;
            case 'WARN': return console.warn;
            case 'DEBUG': return console.debug;
            case 'TRACE': return console.trace;
            default: return console.log;
        }
    }

    rotateLogsIfNeeded() {
        if (this.logs.length > this.maxLogEntries) {
            const removedCount = this.logs.length - this.rotationThreshold;
            this.logs = this.logs.slice(-this.rotationThreshold);
            this.warn(`Log rotation performed: removed ${removedCount} oldest entries`, {
                remainingEntries: this.logs.length,
                maxEntries: this.maxLogEntries
            });
        }
    }

    updateUILogs() {
        // Update UI manager logs if available
        if (typeof window !== 'undefined' && window.uiManager && window.uiManager.updateTransferLogs) {
            try {
                window.uiManager.updateTransferLogs(this.getRecentLogs(20));
            } catch (error) {
                // Silently handle UI update errors
            }
        }
    }

    // Core logging methods
    error(message, data = {}, category = 'ERROR') {
        this.log('ERROR', message, data, category);
    }

    warn(message, data = {}, category = 'WARNING') {
        this.log('WARN', message, data, category);
    }

    info(message, data = {}, category = 'INFO') {
        this.log('INFO', message, data, category);
    }

    debug(message, data = {}, category = 'DEBUG') {
        this.log('DEBUG', message, data, category);
    }

    trace(message, data = {}, category = 'TRACE') {
        this.log('TRACE', message, data, category);
    }

    // Transfer-specific logging methods
    transferStart(transferId, fileCount, sourceService, destinationService) {
        this.info('Transfer session started', {
            transferId,
            fileCount,
            sourceService,
            destinationService,
            timestamp: Date.now()
        }, 'TRANSFER');
    }

    transferComplete(transferId, results) {
        const duration = Date.now() - this.startTime;
        this.info('Transfer session completed', {
            transferId,
            results,
            duration: duration,
            timestamp: Date.now()
        }, 'TRANSFER');
    }

    fileTransferStart(fileId, fileName, fileSize, expectedChunks) {
        this.info(`File transfer started: ${fileName}`, {
            fileId,
            fileName,
            fileSize,
            expectedChunks,
            timestamp: Date.now()
        }, 'FILE_TRANSFER');
    }

    fileTransferComplete(fileId, fileName, success, error = null) {
        const level = success ? 'INFO' : 'ERROR';
        const message = success ? `File transfer completed: ${fileName}` : `File transfer failed: ${fileName}`;
        
        this.log(level, message, {
            fileId,
            fileName,
            success,
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : null,
            timestamp: Date.now()
        }, 'FILE_TRANSFER');
    }

    chunkTransfer(fileId, fileName, chunkIndex, totalChunks, success, error = null, retryCount = 0) {
        const level = success ? 'DEBUG' : 'WARN';
        const message = success 
            ? `Chunk ${chunkIndex + 1}/${totalChunks} transferred: ${fileName}`
            : `Chunk ${chunkIndex + 1}/${totalChunks} failed: ${fileName}`;

        this.log(level, message, {
            fileId,
            fileName,
            chunkIndex,
            totalChunks,
            success,
            retryCount,
            error: error ? {
                message: error.message,
                stack: error.stack
            } : null,
            timestamp: Date.now()
        }, 'CHUNK_TRANSFER');
    }

    apiCall(method, url, success, responseStatus, duration, error = null) {
        const level = success ? 'DEBUG' : 'ERROR';
        const message = `API ${method} ${success ? 'success' : 'failed'}: ${url}`;

        this.log(level, message, {
            method: method.toUpperCase(),
            url,
            responseStatus,
            duration,
            success,
            error: error ? {
                message: error.message,
                stack: error.stack
            } : null,
            timestamp: Date.now()
        }, 'API_CALL');
    }

    // Log retrieval methods
    getRecentLogs(count = 50) {
        return this.logs.slice(-count).map(log => ({
            timestamp: new Date(log.timestamp).toLocaleTimeString(),
            level: log.level,
            category: log.category,
            message: log.message,
            id: log.id
        }));
    }

    getFailedTransfers() {
        return this.logs
            .filter(log => log.category === 'FILE_TRANSFER' && log.data && log.data.success === false)
            .map(log => ({
                fileName: log.data.fileName || 'Unknown file',
                error: (log.data.error && log.data.error.message) || 'Unknown error',
                timestamp: log.timestamp,
                fileId: log.data.fileId
            }));
    }

    getLogsByCategory(category, count = 100) {
        return this.logs
            .filter(log => log.category.toUpperCase() === category.toUpperCase())
            .slice(-count);
    }

    getLogsByLevel(level, count = 100) {
        return this.logs
            .filter(log => log.level.toUpperCase() === level.toUpperCase())
            .slice(-count);
    }

    // Verbose log generation and download
    generateVerboseLog() {
        const header = [
            `# DriveBridge Transfer Log`,
            `# Session ID: ${this.sessionId}`,
            `# Generated: ${new Date().toISOString()}`,
            `# Total Entries: ${this.logs.length}`,
            `# Session Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
            `# Log Levels: ERROR, WARN, INFO, DEBUG, TRACE`,
            ``,
            `# === TRANSFER SUMMARY ===`
        ].join('\n');

        const summary = this.generateTransferSummary();
        
        const logEntries = this.logs.map(log => {
            const dataStr = Object.keys(log.data).length > 0 
                ? ` | Data: ${JSON.stringify(log.data)}`
                : '';
            return `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}${dataStr}`;
        }).join('\n');

        const footer = [
            ``,
            `# === END OF LOG ===`,
            `# Generated by DriveBridge v2.0`,
            `# Total processing time: ${Math.round((Date.now() - this.startTime) / 1000)}s`
        ].join('\n');

        return `${header}\n${summary}\n\n# === LOG ENTRIES ===\n${logEntries}\n${footer}`;
    }

    generateTransferSummary() {
        const transfers = this.logs.filter(log => log.category === 'FILE_TRANSFER');
        const successful = transfers.filter(log => log.data && log.data.success === true).length;
        const failed = transfers.filter(log => log.data && log.data.success === false).length;
        const apiCalls = this.logs.filter(log => log.category === 'API_CALL').length;
        const errors = this.logs.filter(log => log.level === 'ERROR').length;

        return [
            `# Total file transfers: ${transfers.length}`,
            `# Successful transfers: ${successful}`,
            `# Failed transfers: ${failed}`,
            `# Total API calls: ${apiCalls}`,
            `# Total errors: ${errors}`,
            `# Session start: ${new Date(this.startTime).toISOString()}`
        ].join('\n');
    }

    downloadLogFile() {
        try {
            const logContent = this.generateVerboseLog();
            const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            
            const downloadLink = document.createElement('a');
            downloadLink.style.display = 'none';
            downloadLink.href = url;
            downloadLink.download = `drivebridge-log-${this.sessionId}.txt`;
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            
            // Cleanup
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                if (document.body.contains(downloadLink)) {
                    document.body.removeChild(downloadLink);
                }
            }, 100);
            
            this.info('Verbose log file downloaded successfully', {
                fileName: `drivebridge-log-${this.sessionId}.txt`,
                entries: this.logs.length,
                fileSize: logContent.length
            });
            
            return true;
        } catch (error) {
            this.error('Failed to download log file', {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    // Log management
    clearLogs() {
        const oldCount = this.logs.length;
        const oldSessionId = this.sessionId;
        
        this.logs = [];
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        
        this.info('Logs cleared and new session started', {
            previousEntries: oldCount,
            previousSessionId: oldSessionId,
            newSessionId: this.sessionId
        });
    }

    exportLogsAsJSON() {
        try {
            const exportData = {
                sessionId: this.sessionId,
                generatedAt: new Date().toISOString(),
                totalEntries: this.logs.length,
                sessionDuration: Date.now() - this.startTime,
                logs: this.logs
            };

            const jsonContent = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `drivebridge-logs-${this.sessionId}.json`;
            downloadLink.click();
            
            setTimeout(() => window.URL.revokeObjectURL(url), 100);
            
            this.info('Logs exported as JSON', { entries: this.logs.length });
            return true;
        } catch (error) {
            this.error('Failed to export logs as JSON', { error: error.message });
            return false;
        }
    }

    // Performance and debugging
    startTimer(label) {
        const timerId = `timer_${label}_${Date.now()}`;
        this.debug(`Timer started: ${label}`, { timerId }, 'PERFORMANCE');
        return {
            timerId,
            startTime: Date.now(),
            end: () => {
                const duration = Date.now() - Date.now();
                this.debug(`Timer ended: ${label}`, { timerId, duration }, 'PERFORMANCE');
                return duration;
            }
        };
    }

    logPerformance(operation, duration, details = {}) {
        this.debug(`Performance: ${operation} took ${duration}ms`, {
            operation,
            duration,
            ...details
        }, 'PERFORMANCE');
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.Logger = Logger;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
}

// Console confirmation
console.log('📋 Logger.js loaded - Full API available including trace(), generateVerboseLog(), downloadLogFile()');
