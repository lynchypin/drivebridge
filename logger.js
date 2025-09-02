class Logger {
    constructor() {
        this.logs = [];
        this.sessionId = 'session_' + Date.now();
        console.log('✅ Logger initialized successfully');
    }

    log(level, message, data, category) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
             data || {},
            category: category || 'GENERAL'
        };
        this.logs.push(entry);
        console.log('[' + level + '] ' + message, data);
    }

    error(message, data, category) {
        this.log('ERROR', message, data, category);
    }

    warn(message, data, category) {
        this.log('WARN', message, data, category);
    }

    info(message, data, category) {
        this.log('INFO', message, data, category);
    }

    debug(message, data, category) {
        this.log('DEBUG', message, data, category);
    }

    transferStart(transferId, fileCount, source, destination) {
        this.info('Transfer started', { transferId: transferId, fileCount: fileCount });
    }

    transferComplete(transferId, results) {
        this.info('Transfer completed', { transferId: transferId, results: results });
    }

    fileTransferStart(fileId, fileName, fileSize, chunkCount) {
        this.info('File transfer started: ' + fileName);
    }

    fileTransferComplete(fileId, fileName, success, error) {
        if (success) {
            this.info('File transfer completed: ' + fileName);
        } else {
            this.error('File transfer failed: ' + fileName, { error: error });
        }
    }

    chunkTransfer(fileId, fileName, chunkIndex, totalChunks, success, error, retryCount) {
        this.debug('Chunk ' + (chunkIndex + 1) + '/' + totalChunks + ' ' + (success ? 'success' : 'failed'));
    }

    apiCall(method, url, success, responseStatus, duration, error) {
        this.debug('API ' + method + ' ' + (success ? 'success' : 'failed'));
    }

    getRecentLogs(count) {
        return this.logs.slice(-(count || 10));
    }

    getFailedTransfers() {
        return [];
    }

    downloadLogFile() {
        return false;
    }

    clearLogs() {
        this.logs = [];
        console.log('Logs cleared');
    }
}

window.Logger = Logger;
