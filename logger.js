// DriveBridge Verbose Logging System
// Production-ready logging with downloadable verbose logs

class Logger {
    constructor() {
        this.logs = [];
        this.config = Config.getLoggingConfig();
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();

        this.info('Logger initialized', { sessionId: this.sessionId });
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    log(level, message, data = {}, category = 'GENERAL') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            category,
            message,
             JSON.parse(JSON.stringify(data)), // Deep clone to prevent mutations
            sessionId: this.sessionId,
            id: Date.now() + Math.random()
        };

        this.logs.push(logEntry);

        // Console logging
        if (this.config.enableConsoleLog) {
            const consoleMethod = this.getConsoleMethod(level);
            consoleMethod(`[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`, data);
        }

        // Prevent memory overflow
        if (this.logs.length > this.config.maxLogSize) {
            this.logs = this.logs.slice(-this.config.logRotationSize);
            this.warn('Log rotation performed - keeping last ' + this.config.logRotationSize + ' entries');
        }

        // Trigger UI update
        if (typeof window !== 'undefined' && window.uiManager) {
            window.uiManager.updateTransferLogs(this.getRecentLogs(20));
        }
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

    // Convenience methods
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
    transferStart(transferId, fileCount, source, destination) {
        this.info('Transfer session started', {
            transferId,
            fileCount,
            source,
            destination,
            timestamp: Date.now()
        }, 'TRANSFER');
    }

    transferComplete(transferId, results) {
        this.info('Transfer session completed', {
            transferId,
            results,
            duration: Date.now() - this.startTime
        }, 'TRANSFER');
    }

    fileTransferStart(fileId, fileName, fileSize, chunkCount = 1) {
        this.info(`File transfer started: ${fileName}`, {
            fileId,
            fileName,
            fileSize,
            chunkCount,
            timestamp: Date.now()
        }, 'FILE_TRANSFER');
    }

    fileTransferComplete(fileId, fileName, success, error = null) {
        const level = success ? 'info' : 'error';
        const message = success ?
            `File transfer completed: ${fileName}` :
            `File transfer failed: ${fileName}`;

        this[level](message, {
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
        const level = success ? 'debug' : 'warn';
        const message = success ?
            `Chunk ${chunkIndex + 1}/${totalChunks} transferred: ${fileName}` :
            `Chunk ${chunkIndex + 1}/${totalChunks} failed: ${fileName}`;

        this[level](message, {
            fileId,
            fileName,
            chunkIndex,
            totalChunks,
            success,
            retryCount,
            error: error ? {
                message: error.message,
                status: error.status || 'unknown',
                statusText: error.statusText || 'unknown'
            } : null,
            timestamp: Date.now()
        }, 'CHUNK_TRANSFER');
    }

    apiCall(method, url, success, responseStatus, duration, error = null) {
        const level = success ? 'debug' : 'error';
        const message = `API ${method} ${success ? 'success' : 'failed'}: ${url}`;

        this[level](message, {
            method,
            url: this.sanitizeUrl(url),
            success,
            responseStatus,
            duration,
            error: error ? {
                message: error.message,
                status: error.status || responseStatus,
                statusText: error.statusText || 'unknown'
            } : null,
            timestamp: Date.now()
        }, 'API_CALL');
    }

    sanitizeUrl(url) {
        // Remove sensitive tokens from URLs for logging
        if (!url) return 'unknown';
        try {
            return url.replace(/access_token=[^&]+/g, 'access_token=***')
                .replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer ***');
        } catch (e) {
            return 'sanitization_failed';
        }
    }

    // Get logs for UI display
    getRecentLogs(count = 50) {
        return this.logs.slice(-count).map(log => ({
            timestamp: new Date(log.timestamp).toLocaleTimeString(),
            level: log.level,
            category: log.category,
            message: log.message,
            id: log.id
        }));
    }

    // Get failed transfers for error modal
    getFailedTransfers() {
        return this.logs
            .filter(log => log.category === 'FILE_TRANSFER' && log.data.success === false)
            .map(log => ({
                fileName: log.data.fileName,
                error: log.data.error?.message || 'Unknown error',
                timestamp: log.timestamp,
                fileId: log.data.fileId
            }));
    }

    // Generate verbose log file content
    generateVerboseLog() {
        const header = [
            '# DriveBridge Transfer Log',
            `# Session ID: ${this.sessionId}`,
            `# Generated: ${new Date().toISOString()}`,
            `# Total Entries: ${this.logs.length}`,
            `# Session Duration: ${this.formatDuration(Date.now() - this.startTime)}`,
            '# ',
            '# Legend:',
            '# [TIMESTAMP] [LEVEL] [CATEGORY] MESSAGE',
            '# Additional data follows each entry when available',
            '#',
            ''
        ].join('\n');

        const logContent = this.logs.map(log => {
            let entry = `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}`;
            if (Object.keys(log.data).length > 0) {
                entry += '\n  Data: ' + JSON.stringify(log.data, null, 2)
                    .split('\n')
                    .map(line => '    ' + line)
                    .join('\n');
            }
            return entry;
        }).join('\n\n');

        const footer = [
            '',
            '# End of Log',
            `# Session completed: ${new Date().toISOString()}`,
            `# Total duration: ${this.formatDuration(Date.now() - this.startTime)}`
        ].join('\n');

        return header + logContent + footer;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    // Download log file
    downloadLogFile() {
        try {
            const logContent = this.generateVerboseLog();
            const blob = new Blob([logContent], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `drivebridge-log-${this.sessionId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
            }, 100);

            this.info('Log file downloaded', {
                filename: a.download,
                size: logContent.length,
                entries: this.logs.length
            });

            return true;
        } catch (error) {
            this.error('Failed to download log file', { error: error.message });
            return false;
        }
    }

    // Clear logs (start fresh session)
    clearLogs() {
        const oldSessionId = this.sessionId;
        const logCount = this.logs.length;

        this.logs = [];
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();

        this.info('New logging session started', {
            previousSessionId: oldSessionId,
            clearedLogCount: logCount
        });
    }

    // Get statistics
    getStatistics() {
        const stats = {
            totalEntries: this.logs.length,
            sessionDuration: Date.now() - this.startTime,
            entriesByLevel: {},
            entriesByCategory: {},
            errors: 0,
            warnings: 0
        };

        this.logs.forEach(log => {
            stats.entriesByLevel[log.level] = (stats.entriesByLevel[log.level] || 0) + 1;
            stats.entriesByCategory[log.category] = (stats.entriesByCategory[log.category] || 0) + 1;
            if (log.level === 'ERROR') stats.errors++;
            if (log.level === 'WARN') stats.warnings++;
        });

        return stats;
    }
}

if (typeof window !== 'undefined') {
    window.Logger = Logger;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
}
