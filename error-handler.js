// DriveBridge Error Handler
// Production-ready error handling and user feedback system

class ErrorHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        this.errorCounts = new Map();
        this.lastErrors = [];
        this.maxLastErrors = 50;

        // Set up global error handlers
        this.setupGlobalErrorHandlers();

        this.logger.info('Error Handler initialized', {}, 'ERROR_HANDLER');
    }

    setupGlobalErrorHandlers() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError({
                message: event.reason?.message || 'Unhandled promise rejection',
                error: event.reason,
                type: 'unhandledrejection'
            });
            event.preventDefault();
        });

        // Handle JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleGlobalError({
                message: event.message || 'JavaScript error',
                error: {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    stack: event.error?.stack
                },
                type: 'javascript'
            });
        });

        this.logger.debug('Global error handlers configured', {}, 'ERROR_HANDLER');
    }

    // Handle global application errors
    handleGlobalError(errorInfo) {
        const errorKey = this.generateErrorKey(errorInfo.message);
        const count = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, count + 1);

        const errorRecord = {
            timestamp: Date.now(),
            message: errorInfo.message,
            type: errorInfo.type || 'unknown',
            error: errorInfo.error,
            count: count + 1,
            id: Date.now() + Math.random()
        };

        this.lastErrors.push(errorRecord);
        if (this.lastErrors.length > this.maxLastErrors) {
            this.lastErrors = this.lastErrors.slice(-this.maxLastErrors);
        }

        this.logger.error('Global error occurred', {
            message: errorInfo.message,
            type: errorInfo.type,
            count: count + 1,
            error: errorInfo.error
        }, 'GLOBAL_ERROR');

        // Show user notification for critical errors
        if (count < 3) { // Don't spam user with repeated errors
            this.uiManager.showNotification(
                `Application error: ${this.simplifyErrorMessage(errorInfo.message)}`,
                'error',
                8000
            );
        }

        // For repeated errors, suggest page refresh
        if (count >= 3) {
            this.suggestPageRefresh(errorInfo.message);
        }
    }

    // Handle authentication errors
    handleAuthError(serviceName, error, responseData = null) {
        this.logger.error(`Authentication error for ${serviceName}`, {
            serviceName,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack
            },
            responseData
        }, 'AUTH_ERROR');

        let userMessage = '';
        let suggestions = [];

        if (error.message?.includes('popup')) {
            userMessage = `${serviceName} authentication popup was blocked or closed`;
            suggestions = [
                'Please allow popups for this site',
                'Try disabling popup blockers',
                'Ensure you complete the sign-in process'
            ];
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
            userMessage = `Network error connecting to ${serviceName}`;
            suggestions = [
                'Check your internet connection',
                'Try refreshing the page',
                'Disable VPN if active'
            ];
        } else if (error.message?.includes('permission') || error.message?.includes('scope')) {
            userMessage = `${serviceName} permission error`;
            suggestions = [
                'Please grant all requested permissions',
                'Try disconnecting and reconnecting',
                'Check your account permissions'
            ];
        } else {
            userMessage = `Failed to connect to ${serviceName}`;
            suggestions = [
                'Please try again',
                'Check your internet connection',
                'Refresh the page if the problem persists'
            ];
        }

        this.showDetailedError(userMessage, suggestions, error);
    }

    // Handle transfer errors with detailed feedback
    handleTransferError(fileInfo, error, phase = 'unknown') {
        this.logger.error(`Transfer error during ${phase}`, {
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            fileSize: fileInfo.size,
            phase,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack,
                status: error.status,
                statusText: error.statusText
            }
        }, 'TRANSFER_ERROR');

        const errorAnalysis = this.analyzeTransferError(error, phase);
        
        return {
            success: false,
            error: errorAnalysis.userMessage,
            suggestions: errorAnalysis.suggestions,
            retryable: errorAnalysis.retryable,
            technical: error.message
        };
    }

    // Analyze transfer errors and provide user-friendly explanations
    analyzeTransferError(error, phase) {
        let userMessage = '';
        let suggestions = [];
        let retryable = true;

        const errorMessage = error.message?.toLowerCase() || '';
        const statusCode = error.status;

        // Network-related errors
        if (errorMessage.includes('network') || errorMessage.includes('fetch') || 
            errorMessage.includes('connection') || error.name === 'TypeError') {
            userMessage = 'Network connection error during transfer';
            suggestions = [
                'Check your internet connection',
                'Try the transfer again',
                'Ensure stable network connection for large files'
            ];
        }
        // Timeout errors
        else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
            userMessage = 'Transfer timed out due to slow connection or large file size';
            suggestions = [
                'Try again with a faster internet connection',
                'Break large transfers into smaller batches',
                'Check your network stability'
            ];
        }
        // Authentication errors
        else if (statusCode === 401 || errorMessage.includes('unauthorized') || 
                 errorMessage.includes('token') || errorMessage.includes('auth')) {
            userMessage = 'Authentication expired during transfer';
            suggestions = [
                'Please reconnect your accounts',
                'Refresh the page and sign in again',
                'Check that your session hasn\'t expired'
            ];
        }
        // Permission errors
        else if (statusCode === 403 || errorMessage.includes('permission') || 
                 errorMessage.includes('forbidden')) {
            userMessage = 'Insufficient permissions for this operation';
            suggestions = [
                'Check file/folder permissions',
                'Ensure you have write access to the destination',
                'Try reconnecting with full permissions'
            ];
            retryable = false;
        }
        // Rate limiting
        else if (statusCode === 429 || errorMessage.includes('rate limit') || 
                 errorMessage.includes('quota')) {
            userMessage = 'Too many requests - rate limit exceeded';
            suggestions = [
                'Wait a few minutes before trying again',
                'Reduce the number of concurrent transfers',
                'Try during off-peak hours'
            ];
        }
        // Storage full
        else if (statusCode === 507 || errorMessage.includes('storage') || 
                 errorMessage.includes('space') || errorMessage.includes('quota exceeded')) {
            userMessage = 'Insufficient storage space';
            suggestions = [
                'Free up space in your destination drive',
                'Check your storage quota',
                'Try uploading to a different location'
            ];
            retryable = false;
        }
        // File size errors
        else if (errorMessage.includes('size') || errorMessage.includes('too large')) {
            userMessage = 'File too large for transfer';
            suggestions = [
                'Try with smaller files',
                'Check file size limits for your account',
                'Use alternative transfer methods for very large files'
            ];
            retryable = false;
        }
        // Server errors
        else if (statusCode >= 500 || errorMessage.includes('server error') || 
                 errorMessage.includes('internal error')) {
            userMessage = 'Server error - the service is temporarily unavailable';
            suggestions = [
                'Try again in a few minutes',
                'Check service status pages',
                'Contact support if the problem persists'
            ];
        }
        // Generic errors
        else {
            userMessage = `Transfer failed during ${phase}`;
            suggestions = [
                'Try the operation again',
                'Check your internet connection',
                'Refresh the page if problems persist'
            ];
        }

        return { userMessage, suggestions, retryable };
    }

    // Show transfer summary with detailed results
    showTransferSummary(results) {
        const totalFiles = results.length;
        const successfulFiles = results.filter(r => r.success).length;
        const failedFiles = results.filter(r => !r.success);

        this.logger.info('Transfer summary', {
            total: totalFiles,
            successful: successfulFiles,
            failed: failedFiles.length
        }, 'TRANSFER_SUMMARY');

        if (failedFiles.length === 0) {
            this.uiManager.showNotification(
                `✅ All ${totalFiles} file(s) transferred successfully!`,
                'success',
                5000
            );
        } else {
            const message = successfulFiles > 0 
                ? `⚠️ ${successfulFiles}/${totalFiles} files transferred successfully. ${failedFiles.length} failed.`
                : `❌ All ${totalFiles} file(s) failed to transfer.`;

            this.uiManager.showNotification(message, 'warning', 8000);

            // Show detailed error modal for failures
            setTimeout(() => {
                this.showTransferErrorsModal(failedFiles);
            }, 1000);
        }
    }

    // Show detailed error modal for failed transfers
    showTransferErrorsModal(failedTransfers) {
        if (!failedTransfers || failedTransfers.length === 0) return;

        const modal = this.uiManager.createModal('transfer-errors-modal', 'Transfer Errors');
        const content = modal.querySelector('.modal-content');

        const failuresWithSuggestions = failedTransfers.map(failure => {
            const errorAnalysis = this.analyzeTransferError(failure.error, 'transfer');
            return {
                ...failure,
                userMessage: errorAnalysis.userMessage,
                suggestions: errorAnalysis.suggestions,
                retryable: errorAnalysis.retryable
            };
        });

        const errorHTML = `
            <div class="error-summary">
                <p><strong>${failedTransfers.length} file(s) failed to transfer:</strong></p>
                <p class="error-help">Review the errors below for solutions:</p>
            </div>
            
            <div class="error-list">
                ${failuresWithSuggestions.map((failure, index) => `
                    <div class="error-item">
                        <div class="error-header">
                            <div class="error-file-name">📄 ${this.escapeHtml(failure.fileName)}</div>
                            <div class="error-status ${failure.retryable ? 'error-retryable' : 'error-permanent'}">
                                ${failure.retryable ? '🔄 Retryable' : '⚠️ Manual Fix Needed'}
                            </div>
                        </div>
                        
                        <div class="error-message">${this.escapeHtml(failure.userMessage)}</div>
                        
                        <div class="error-suggestions">
                            <strong>Suggestions:</strong>
                            <ul>
                                ${failure.suggestions.map(suggestion => 
                                    `<li>${this.escapeHtml(suggestion)}</li>`
                                ).join('')}
                            </ul>
                        </div>
                        
                        <details class="error-technical">
                            <summary>Technical Details</summary>
                            <code>${this.escapeHtml(failure.error?.message || 'No technical details available')}</code>
                        </details>
                    </div>
                `).join('')}
            </div>
            
            <div class="error-actions">
                <button class="btn btn--primary" onclick="window.location.reload()">
                    🔄 Retry Failed Transfers
                </button>
                <button class="btn btn--secondary" onclick="uiManager.downloadErrorReport()">
                    📄 Download Error Report
                </button>
                <button class="btn btn--ghost" onclick="uiManager.closeModal('transfer-errors-modal')">
                    Close
                </button>
            </div>
        `;

        content.innerHTML = errorHTML;
        this.uiManager.showModal('transfer-errors-modal');
    }

    // Show detailed error with suggestions
    showDetailedError(message, suggestions = [], error = null) {
        const modal = this.uiManager.createModal('detailed-error-modal', 'Error Details');
        const content = modal.querySelector('.modal-content');

        const errorHTML = `
            <div class="detailed-error">
                <div class="error-icon">❌</div>
                <div class="error-message">${this.escapeHtml(message)}</div>
                
                ${suggestions.length > 0 ? `
                    <div class="error-suggestions">
                        <h4>How to fix this:</h4>
                        <ul>
                            ${suggestions.map(suggestion => 
                                `<li>${this.escapeHtml(suggestion)}</li>`
                            ).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${error ? `
                    <details class="error-technical">
                        <summary>Technical Details</summary>
                        <pre><code>${this.escapeHtml(error.stack || error.message || 'No details available')}</code></pre>
                    </details>
                ` : ''}
                
                <div class="error-actions">
                    <button class="btn btn--primary" onclick="window.location.reload()">
                        🔄 Refresh Page
                    </button>
                    <button class="btn btn--secondary" onclick="uiManager.closeModal('detailed-error-modal')">
                        Close
                    </button>
                </div>
            </div>
        `;

        content.innerHTML = errorHTML;
        this.uiManager.showModal('detailed-error-modal');
    }

    // Suggest page refresh for persistent errors
    suggestPageRefresh(errorMessage) {
        const modal = this.uiManager.createModal('refresh-suggestion-modal', 'Persistent Error Detected');
        const content = modal.querySelector('.modal-content');

        const refreshHTML = `
            <div class="refresh-suggestion">
                <div class="error-icon">⚠️</div>
                <h3>Multiple errors detected</h3>
                <p>The application has encountered repeated errors. This usually indicates:</p>
                <ul>
                    <li>Network connectivity issues</li>
                    <li>Browser cache problems</li>
                    <li>Temporary service issues</li>
                </ul>
                
                <div class="refresh-actions">
                    <button class="btn btn--primary" onclick="window.location.reload()">
                        🔄 Refresh Page Now
                    </button>
                    <button class="btn btn--secondary" onclick="uiManager.closeModal('refresh-suggestion-modal')">
                        Continue Anyway
                    </button>
                </div>
            </div>
        `;

        content.innerHTML = refreshHTML;
        this.uiManager.showModal('refresh-suggestion-modal');
    }

    // Utility methods
    generateErrorKey(message) {
        return message?.substring(0, 50).toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';
    }

    simplifyErrorMessage(message) {
        if (!message) return 'Unknown error';
        
        // Simplify common error messages for users
        if (message.includes('Failed to fetch')) return 'Network connection error';
        if (message.includes('NetworkError')) return 'Network error';
        if (message.includes('popup')) return 'Popup blocked';
        if (message.includes('CORS')) return 'Security restriction';
        if (message.includes('timeout')) return 'Request timed out';
        
        // Return first sentence or first 100 characters
        const firstSentence = message.split('.')[0];
        return firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Get error statistics for diagnostics
    getErrorStatistics() {
        return {
            totalUniqueErrors: this.errorCounts.size,
            totalErrorCount: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            recentErrors: this.lastErrors.slice(-10),
            topErrors: Array.from(this.errorCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
        };
    }

    // Clear error history
    clearErrorHistory() {
        this.errorCounts.clear();
        this.lastErrors = [];
        this.logger.info('Error history cleared', {}, 'ERROR_HANDLER');
    }
}

if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}
