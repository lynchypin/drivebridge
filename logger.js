function Logger() {
    this.logs = [];
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.maxLogEntries = 1000;
    this.rotationThreshold = 500;
    
    this.config = {
        levels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4 },
        defaultLevel: 'INFO',
        enableConsoleLog: true,
        enableFileExport: true
    };
    
    this.info('Logger initialized', { sessionId: this.sessionId });
}

Logger.prototype.generateSessionId = function() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

Logger.prototype.log = function(level, message, data, category) {
    if (!data) data = {};
    if (!category) category = 'GENERAL';
    
    var timestamp = new Date().toISOString();
    var logEntry = {
        timestamp: timestamp,
        level: level.toUpperCase(),
        category: category.toUpperCase(),
        message: String(message || ''),
         JSON.parse(JSON.stringify(data || {})),
        sessionId: this.sessionId,
        id: Date.now() + Math.random()
    };

    this.logs.push(logEntry);

    if (this.config.enableConsoleLog) {
        var method = this.getConsoleMethod(level);
        method('[' + timestamp + '] [' + level.toUpperCase() + '] [' + category + '] ' + message, data);
    }

    if (this.logs.length > this.maxLogEntries) {
        this.logs = this.logs.slice(-this.rotationThreshold);
    }
};

Logger.prototype.getConsoleMethod = function(level) {
    switch (level.toUpperCase()) {
        case 'ERROR': 
            return console.error;
        case 'WARN': 
            return console.warn;
        case 'DEBUG': 
            return console.debug;
        case 'TRACE': 
            return console.trace;
        default: 
            return console.log;
    }
};

Logger.prototype.error = function(message, data, category) {
    this.log('ERROR', message, data, category || 'ERROR');
};

Logger.prototype.warn = function(message, data, category) {
    this.log('WARN', message, data, category || 'WARNING');
};

Logger.prototype.info = function(message, data, category) {
    this.log('INFO', message, data, category || 'INFO');
};

Logger.prototype.debug = function(message, data, category) {
    this.log('DEBUG', message, data, category || 'DEBUG');
};

Logger.prototype.trace = function(message, data, category) {
    this.log('TRACE', message, data, category || 'TRACE');
};

Logger.prototype.transferStart = function(transferId, fileCount, sourceService, destinationService) {
    this.info('Transfer session started', {
        transferId: transferId,
        fileCount: fileCount,
        sourceService: sourceService,
        destinationService: destinationService
    }, 'TRANSFER');
};

Logger.prototype.transferComplete = function(transferId, results) {
    this.info('Transfer session completed', {
        transferId: transferId,
        results: results
    }, 'TRANSFER');
};

Logger.prototype.fileTransferStart = function(fileId, fileName, fileSize, expectedChunks) {
    this.info('File transfer started: ' + fileName, {
        fileId: fileId,
        fileName: fileName,
        fileSize: fileSize,
        expectedChunks: expectedChunks
    }, 'FILE_TRANSFER');
};

Logger.prototype.fileTransferComplete = function(fileId, fileName, success, error) {
    var level = success ? 'INFO' : 'ERROR';
    var message = success ? 'File transfer completed: ' + fileName : 'File transfer failed: ' + fileName;
    
    this.log(level, message, {
        fileId: fileId,
        fileName: fileName,
        success: success,
        error: error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : null
    }, 'FILE_TRANSFER');
};

Logger.prototype.chunkTransfer = function(fileId, fileName, chunkIndex, totalChunks, success, error, retryCount) {
    var level = success ? 'DEBUG' : 'WARN';
    var message = success 
        ? 'Chunk ' + (chunkIndex + 1) + '/' + totalChunks + ' transferred: ' + fileName
        : 'Chunk ' + (chunkIndex + 1) + '/' + totalChunks + ' failed: ' + fileName;

    this.log(level, message, {
        fileId: fileId,
        fileName: fileName,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        success: success,
        retryCount: retryCount || 0,
        error: error ? { message: error.message } : null
    }, 'CHUNK_TRANSFER');
};

Logger.prototype.apiCall = function(method, url, success, responseStatus, duration, error) {
    var level = success ? 'DEBUG' : 'ERROR';
    var message = 'API ' + method + ' ' + (success ? 'success' : 'failed') + ': ' + url;

    this.log(level, message, {
        method: method,
        url: url,
        responseStatus: responseStatus,
        duration: duration,
        success: success,
        error: error ? { message: error.message } : null
    }, 'API_CALL');
};

Logger.prototype.getRecentLogs = function(count) {
    if (!count) count = 50;
    var recent = this.logs.slice(-count);
    var result = [];
    for (var i = 0; i < recent.length; i++) {
        var log = recent[i];
        result.push({
            timestamp: new Date(log.timestamp).toLocaleTimeString(),
            level: log.level,
            category: log.category,
            message: log.message,
            id: log.id
        });
    }
    return result;
};

Logger.prototype.getFailedTransfers = function() {
    var failed = [];
    for (var i = 0; i < this.logs.length; i++) {
        var log = this.logs[i];
        if (log.category === 'FILE_TRANSFER' && log.data && log.data.success === false) {
            failed.push({
                fileName: log.data.fileName || 'Unknown file',
                error: (log.data.error && log.data.error.message) || 'Unknown error',
                timestamp: log.timestamp,
                fileId: log.data.fileId
            });
        }
    }
    return failed;
};

Logger.prototype.generateVerboseLog = function() {
    var header = '# DriveBridge Transfer Log\n' +
                '# Session ID: ' + this.sessionId + '\n' +
                '# Generated: ' + new Date().toISOString() + '\n' +
                '# Total Entries: ' + this.logs.length + '\n\n';

    var logEntries = [];
    for (var i = 0; i < this.logs.length; i++) {
        var log = this.logs[i];
        var dataStr = Object.keys(log.data).length > 0 ? ' | Data: ' + JSON.stringify(log.data) : '';
        logEntries.push('[' + log.timestamp + '] [' + log.level + '] [' + log.category + '] ' + log.message + dataStr);
    }

    return header + logEntries.join('\n') + '\n\n# === END OF LOG ===';
};

Logger.prototype.downloadLogFile = function() {
    try {
        var logContent = this.generateVerboseLog();
        var blob = new Blob([logContent], { type: 'text/plain' });
        var url = window.URL.createObjectURL(blob);
        
        var downloadLink = document.createElement('a');
        downloadLink.style.display = 'none';
        downloadLink.href = url;
        downloadLink.download = 'drivebridge-log-' + this.sessionId + '.txt';
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        var self = this;
        setTimeout(function() {
            window.URL.revokeObjectURL(url);
            if (document.body.contains(downloadLink)) {
                document.body.removeChild(downloadLink);
            }
        }, 100);
        
        this.info('Log file downloaded successfully');
        return true;
    } catch (error) {
        this.error('Failed to download log file', { error: error.message });
        return false;
    }
};

Logger.prototype.clearLogs = function() {
    var oldCount = this.logs.length;
    this.logs = [];
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.info('Logs cleared, new session started', { previousEntries: oldCount });
};

if (typeof window !== 'undefined') {
    window.Logger = Logger;
}

console.log('Logger.js loaded successfully');
