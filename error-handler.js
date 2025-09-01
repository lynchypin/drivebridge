// DriveBridge Error Handler
// Centralized error management and reporting

class ErrorHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        this.errorCounts = new Map();
        this.criticalErrors = [];
        
        // Set up global error handlers
        this.setupGlobalErrorHandlers();
        
        this.logger.info('Error Handler initialized', {}, 'ERROR_HANDLER');
    }
    
    setupGlobalErrorHandlers() {
        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleUnhandledRejection(event);
        });
        
        // Catch global JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event);
        });
    }
    
    handleUnhandledRejection(event) {
        const error = event.reason;
        this.logger.error('Unhandled promise rejection', {
            error: error?.message || 'Unknown error',
            stack: error?.stack,
            filename: event.filename || 'unknown',
            lineno: event.lineno || 0,
            colno: event.colno || 0
        }, 'UNHANDLED_REJECTION');
        
        this.recordError('UNHANDLED_REJECTION', error?.message || 'Unknown error');
        
        // Prevent the error from being logged to console again
        event.preventDefault();
    }
    
    handleGlobalError(event) {
        this.logger.error('Global JavaScript error', {
            message: event.message,
            filename: event.filename || 'unknown',
            lineno: event.lineno || 0,
            colno: event.colno || 0,
            stack: event.error?.stack
        }, 'GLOBAL_ERROR');
        
        this.recordError('GLOBAL_ERROR', event.message);
    }
    
    // Handle authentication errors
    handleAuthError(service, error, context = {}) {
        this.logger.error(`Authentication error for ${service}`, {
            service,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack
            },
            context
        }, 'AUTH_ERROR');
        
        const userMessage = this.getAuthErrorMessage(service, error);
        this.uiManager.showNotification(userMessage, 'error');
        
        this.recordError('AUTH_ERROR', `${service}: ${error.message}`);
        
        return {
            type: 'AUTH_ERROR',
            service,
            userMessage,
            recoverable: this.isAuthErrorRecoverable(error),
            suggestedAction: this.getAuthErrorAction(service, error)
        };
    }
    
    getAuthErrorMessage(service, error) {
        if (error.message.includes('popup_blocked')) {
            return `${service} authentication was blocked. Please allow popups and try again.`;
        }
        if (error.message.includes('cancelled') || error.message.includes('closed')) {
            return `${service} authentication was cancelled. Please try again.`;
        }
        if (error.message.includes('network')) {
            return `Network error during ${service} authentication. Please check your connection.`;
        }
        return `${service} authentication failed. Please try again.`;
    }
    
    isAuthErrorRecoverable(error) {
        const unrecoverableErrors = ['invalid_client', 'access_denied', 'unauthorized_client'];
        return !unrecoverableErrors.some(unrecoverable => 
            error.message.toLowerCase().includes(unrecoverable)
        );
    }
    
    getAuthErrorAction(service, error) {
        if (error.message.includes('popup_blocked')) {
            return 'ALLOW_POPUPS';
        }
        if (error.message.includes('network')) {
            return 'CHECK_CONNECTION';
        }
        return 'RETRY_AUTH';
    }
    
    // Handle transfer errors
    handleTransferError(fileInfo, error, context = {}) {
        const errorDetails = {
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            fileSize: fileInfo.size,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack,
                status: error.status,
                statusText: error.statusText
            },
            context
        };
        
        this.logger.error(`Transfer error: ${fileInfo.name}`, errorDetails, 'TRANSFER_ERROR');
        
        const userMessage = this.getTransferErrorMessage(error);
        const errorCategory = this.categorizeTransferError(error);
        
        this.recordError('TRANSFER_ERROR', `${fileInfo.name}: ${error.message}`);
        
        return {
            type: 'TRANSFER_ERROR',
            category: errorCategory,
            fileInfo,
            userMessage,
            recoverable: this.isTransferErrorRecoverable(error),
            suggestedAction: this.getTransferErrorAction(error),
            technicalDetails: error.message
        };
    }
    
    getTransferErrorMessage(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('size') && message.includes('limit')) {
            return 'File is too large for transfer. Try breaking it into smaller parts.';
        }
        if (message.includes('network') || message.includes('timeout')) {
            return 'Network error during transfer. The transfer will be retried automatically.';
        }
        if (message.includes('permission') || message.includes('unauthorized') || error.status === 403) {
            return 'Permission denied. You may not have access to this file or destination folder.';
        }
        if (message.includes('quota') || message.includes('storage')) {
            return 'Storage quota exceeded. Free up space in the destination and try again.';
        }
        if (message.includes('rate') || message.includes('throttle') || error.status === 429) {
            return 'Transfer rate limited. The system will automatically retry with delays.';
        }
        if (error.status === 401) {
            return 'Authentication expired. Please reconnect your account and try again.';
        }
        if (error.status === 404) {
            return 'File not found. It may have been moved or deleted.';
        }
        if (error.status === 500 || error.status === 502 || error.status === 503) {
            return 'Server error. The transfer will be retried automatically.';
        }
        
        return 'Transfer failed. Please try again or check the detailed logs for more information.';
    }
    
    categorizeTransferError(error) {
        const message = error.message.toLowerCase();
        const status = error.status;
        
        if (status === 401 || status === 403) return 'PERMISSION';
        if (status === 404) return 'NOT_FOUND';
        if (status === 429) return 'RATE_LIMIT';
        if (status >= 500) return 'SERVER_ERROR';
        if (message.includes('size') || message.includes('large')) return 'FILE_SIZE';
        if (message.includes('network') || message.includes('timeout')) return 'NETWORK';
        if (message.includes('quota') || message.includes('storage')) return 'STORAGE';
        if (message.includes('chunk')) return 'CHUNK_ERROR';
        
        return 'UNKNOWN';
    }
    
    isTransferErrorRecoverable(error) {
        const unrecoverableErrors = ['PERMISSION', 'NOT_FOUND', 'FILE_SIZE'];
        const category = this.categorizeTransferError(error);
        return !unrecoverableErrors.includes(category);
    }
    
    getTransferErrorAction(error) {
        const category = this.categorizeTransferError(error);
        
        switch (category) {
            case 'PERMISSION': return 'CHECK_PERMISSIONS';
            case 'NOT_FOUND': return 'VERIFY_FILE_EXISTS';
            case 'RATE_LIMIT': return 'WAIT_AND_RETRY';
            case 'SERVER_ERROR': return 'RETRY_LATER';
            case 'FILE_SIZE': return 'REDUCE_FILE_SIZE';
            case 'NETWORK': return 'CHECK_CONNECTION';
            case 'STORAGE': return 'FREE_SPACE';
            case 'CHUNK_ERROR': return 'RETRY_CHUNK';
            default: return 'RETRY_TRANSFER';
        }
    }
    
    // Handle chunk-specific errors
    handleChunkError(fileInfo, chunkIndex, totalChunks, error, context = {}) {
        const errorDetails = {
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            chunkIndex,
            totalChunks,
            error: {
                message: error.message,
                name: error.name,
                status: error.status,
                statusText: error.statusText
            },
            context
        };
        
        this.logger.warn(`Chunk error: ${fileInfo.name} chunk ${chunkIndex + 1}/${totalChunks}`, 
            errorDetails, 'CHUNK_ERROR');
        
        this.recordError('CHUNK_ERROR', `${fileInfo.name} chunk ${chunkIndex + 1}: ${error.message}`);
        
        return {
            type: 'CHUNK_ERROR',
            fileInfo,
            chunkIndex,
            totalChunks,
            recoverable: true, // Chunk errors are typically recoverable
            suggestedAction: 'RETRY_CHUNK',
            technicalDetails: error.message
        };
    }
    
    // Handle API errors
    handleAPIError(method, url, error, context = {}) {
        const errorDetails = {
            method,
            url: this.sanitizeUrl(url),
            error: {
                message: error.message,
                name: error.name,
                status: error.status,
                statusText: error.statusText
            },
            context
        };
        
        this.logger.error(`API error: ${method} ${url}`, errorDetails, 'API_ERROR');
        
        this.recordError('API_ERROR', `${method} ${this.sanitizeUrl(url)}: ${error.message}`);
        
        return {
            type: 'API_ERROR',
            method,
            url: this.sanitizeUrl(url),
            recoverable: this.isAPIErrorRecoverable(error),
            suggestedAction: this.getAPIErrorAction(error),
            technicalDetails: error.message
        };
    }
    
    isAPIErrorRecoverable(error) {
        const recoverableStatuses = [408, 429, 500, 502, 503, 504];
        return recoverableStatuses.includes(error.status);
    }
    
    getAPIErrorAction(error) {
        if (error.status === 401) return 'REFRESH_TOKEN';
        if (error.status === 403) return 'CHECK_PERMISSIONS';
        if (error.status === 429) return 'WAIT_AND_RETRY';
        if (error.status >= 500) return 'RETRY_LATER';
        return 'RETRY_REQUEST';
    }
    
    // Error recording and statistics
    recordError(type, message) {
        const key = `${type}:${message}`;
        const count = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, count + 1);
        
        // Track critical errors
        if (type === 'GLOBAL_ERROR' || type === 'UNHANDLED_REJECTION') {
            this.criticalErrors.push({
                type,
                message,
                timestamp: Date.now(),
                count: count + 1
            });
            
            // Keep only recent critical errors
            if (this.criticalErrors.length > 10) {
                this.criticalErrors = this.criticalErrors.slice(-10);
            }
        }
    }
    
    // Get error statistics
    getErrorStatistics() {
        const stats = {
            totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            errorTypes: {},
            criticalErrors: this.criticalErrors.length,
            mostCommonErrors: []
        };
        
        // Group by error type
        for (const [key, count] of this.errorCounts.entries()) {
            const [type] = key.split(':');
            stats.errorTypes[type] = (stats.errorTypes[type] || 0) + count;
        }
        
        // Get most common errors
        stats.mostCommonErrors = Array.from(this.errorCounts.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([key, count]) => ({ error: key, count }));
        
        return stats;
    }
    
    // Generate error report
    generateErrorReport() {
        const stats = this.getErrorStatistics();
        const failedTransfers = this.logger.getFailedTransfers();
        
        const report = [
            '# DriveBridge Error Report',
            `# Generated: ${new Date().toISOString()}`,
            `# Total Errors: ${stats.totalErrors}`,
            `# Critical Errors: ${stats.criticalErrors}`,
            `# Failed Transfers: ${failedTransfers.length}`,
            '#',
            '',
            '## Error Statistics',
            ''
        ];
        
        // Add error type breakdown
        for (const [type, count] of Object.entries(stats.errorTypes)) {
            report.push(`${type}: ${count} occurrences`);
        }
        
        report.push('', '## Most Common Errors', '');
        stats.mostCommonErrors.forEach(({ error, count }, index) => {
            report.push(`${index + 1}. ${error} (${count} times)`);
        });
        
        if (this.criticalErrors.length > 0) {
            report.push('', '## Critical Errors', '');
            this.criticalErrors.forEach((error, index) => {
                report.push(`${index + 1}. [${new Date(error.timestamp).toISOString()}] ${error.type}: ${error.message}`);
            });
        }
        
        if (failedTransfers.length > 0) {
            report.push('', '## Failed Transfers', '');
            failedTransfers.forEach((failure, index) => {
                report.push(`${index + 1}. ${failure.fileName}`);
                report.push(`   Time: ${new Date(failure.timestamp).toISOString()}`);
                report.push(`   Error: ${failure.error}`);
                report.push(`   File ID: ${failure.fileId}`);
                report.push('');
            });
        }
        
        return report.join('\n');
    }
    
    // Utility methods
    sanitizeUrl(url) {
        if (!url) return 'unknown';
        try {
            return url.replace(/access_token=[^&]+/g, 'access_token=***')
                     .replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer ***');
        } catch (e) {
            return 'sanitization_failed';
        }
    }
    
    // Show transfer completion summary with any errors
    showTransferSummary(results) {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const total = results.length;
        
        if (failed > 0) {
            const failedTransfers = results
                .filter(r => !r.success)
                .map(r => ({
                    fileName: r.fileName,
                    error: r.error?.message || 'Unknown error',
                    timestamp: new Date().toISOString(),
                    fileId: r.fileId
                }));
            
            this.uiManager.showErrorModal(failedTransfers);
        }
        
        const message = failed > 0 
            ? `Transfer completed: ${successful}/${total} successful, ${failed} failed`
            : `All ${total} transfers completed successfully!`;
        
        const type = failed > 0 ? 'warning' : 'success';
        this.uiManager.showNotification(message, type);
        
        this.logger.info('Transfer summary displayed', {
            total,
            successful,
            failed
        }, 'SUMMARY');
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}
