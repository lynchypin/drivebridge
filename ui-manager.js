// DriveBridge UI Manager
// Handles all UI updates, progress bars, modals, and user interactions

class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.progressBars = new Map();
        this.activeModals = new Set();
        
        this.logger.info('UI Manager initialized', {}, 'UI');
    }
    
    // Progress bar management
    createProgressBar(fileId, fileName, totalChunks) {
        const progressContainer = document.getElementById('transfer-list');
        if (!progressContainer) return;
        
        const progressElement = document.createElement('div');
        progressElement.id = `progress-${fileId}`;
        progressElement.className = 'transfer-progress-item';
        progressElement.innerHTML = `
            <div class="transfer-file-info">
                <span class="file-name">${this.escapeHtml(fileName)}</span>
                <span class="transfer-status">Preparing...</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">0%</span>
            </div>
            <div class="transfer-details">
                <span class="chunk-progress">0 / ${totalChunks} chunks</span>
                <span class="transfer-speed">--</span>
                <span class="eta">--</span>
            </div>
        `;
        
        progressContainer.appendChild(progressElement);
        
        this.progressBars.set(fileId, {
            element: progressElement,
            fileName,
            totalChunks,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            bytesTransferred: 0
        });
        
        this.logger.debug(`Progress bar created for: ${fileName}`, {
            fileId,
            totalChunks
        }, 'UI');
    }
    
    updateProgressBar(fileId, progressData) {
        const progressInfo = this.progressBars.get(fileId);
        if (!progressInfo) return;
        
        const { element, startTime, totalChunks } = progressInfo;
        const { phase, progress, completedChunks, fileName, uploadedBytes, totalSize } = progressData;
        
        // Update progress bar
        const progressFill = element.querySelector('.progress-fill');
        const progressText = element.querySelector('.progress-text');
        const transferStatus = element.querySelector('.transfer-status');
        const chunkProgress = element.querySelector('.chunk-progress');
        const transferSpeed = element.querySelector('.transfer-speed');
        const eta = element.querySelector('.eta');
        
        if (progressFill) progressFill.style.width = `${Math.round(progress)}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
        if (transferStatus) transferStatus.textContent = phase === 'download' ? 'Downloading...' : 'Uploading...';
        if (chunkProgress) chunkProgress.textContent = `${completedChunks} / ${totalChunks} chunks`;
        
        // Calculate transfer speed and ETA
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        const bytesTransferred = uploadedBytes || (totalSize * (progress / 100));
        
        if (elapsed > 1000 && bytesTransferred > 0) { // Only calculate after 1 second
            const speed = (bytesTransferred / elapsed) * 1000; // bytes per second
            const remainingBytes = totalSize - bytesTransferred;
            const etaSeconds = remainingBytes / speed;
            
            if (transferSpeed) transferSpeed.textContent = this.formatSpeed(speed);
            if (eta && etaSeconds > 0 && etaSeconds < 86400) { // Less than 24 hours
                eta.textContent = `ETA: ${this.formatDuration(etaSeconds * 1000)}`;
            }
        }
        
        progressInfo.lastUpdate = currentTime;
        progressInfo.bytesTransferred = bytesTransferred;
        
        this.logger.trace(`Progress updated for: ${fileName}`, {
            fileId,
            phase,
            progress: Math.round(progress),
            completedChunks,
            totalChunks
        }, 'UI');
    }
    
    completeProgressBar(fileId, success) {
        const progressInfo = this.progressBars.get(fileId);
        if (!progressInfo) return;
        
        const { element, fileName, startTime } = progressInfo;
        const transferStatus = element.querySelector('.transfer-status');
        const progressFill = element.querySelector('.progress-fill');
        const progressText = element.querySelector('.progress-text');
        
        const duration = Date.now() - startTime;
        
        if (success) {
            if (transferStatus) transferStatus.textContent = '✅ Completed';
            if (progressFill) {
                progressFill.style.width = '100%';
                progressFill.classList.add('success');
            }
            if (progressText) progressText.textContent = '100%';
            
            this.logger.info(`Transfer completed: ${fileName}`, {
                fileId,
                duration,
                success: true
            }, 'UI');
        } else {
            if (transferStatus) transferStatus.textContent = '❌ Failed';
            if (progressFill) {
                progressFill.classList.add('error');
            }
            
            this.logger.warn(`Transfer failed: ${fileName}`, {
                fileId,
                duration,
                success: false
            }, 'UI');
        }
        
        // Keep completed transfers visible for 30 seconds, then remove
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
                this.progressBars.delete(fileId);
            }
        }, 30000);
    }
    
    // Update transfer logs in the UI
    updateTransferLogs(recentLogs) {
        const logContainer = document.getElementById('transfer-list');
        if (!logContainer) return;
        
        // Find or create log display section
        let logDisplay = document.getElementById('transfer-logs-display');
        if (!logDisplay) {
            logDisplay = document.createElement('div');
            logDisplay.id = 'transfer-logs-display';
            logDisplay.className = 'transfer-logs-display';
            logDisplay.innerHTML = '<h4>Recent Activity</h4><div class="log-entries"></div>';
            logContainer.appendChild(logDisplay);
        }
        
        const logEntries = logDisplay.querySelector('.log-entries');
        if (!logEntries) return;
        
        // Render recent logs
        const logsHTML = recentLogs.slice(-10).map(log => `
            <div class="log-entry log-entry--${log.level.toLowerCase()}">
                <span class="log-timestamp">${log.timestamp}</span>
                <span class="log-category">[${log.category}]</span>
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `).join('');
        
        logEntries.innerHTML = logsHTML;
        
        // Auto-scroll to bottom
        logEntries.scrollTop = logEntries.scrollHeight;
    }
    
    // Show error modal with failed transfers
    showErrorModal(failedTransfers) {
        if (!failedTransfers || failedTransfers.length === 0) return;
        
        this.logger.info(`Showing error modal with ${failedTransfers.length} failed transfers`, {
            failedCount: failedTransfers.length
        }, 'UI');
        
        const modal = this.createModal('transfer-errors-modal', 'Transfer Errors');
        const content = modal.querySelector('.modal-content');
        
        const errorHTML = `
            <p class="error-summary">The following ${failedTransfers.length} file(s) failed to transfer:</p>
            <div class="error-list">
                ${failedTransfers.map(failure => `
                    <div class="error-item">
                        <div class="error-file-name">📄 ${this.escapeHtml(failure.fileName)}</div>
                        <div class="error-reason">${this.escapeHtml(failure.error)}</div>
                        <div class="error-timestamp">${new Date(failure.timestamp).toLocaleString()}</div>
                    </div>
                `).join('')}
            </div>
            <div class="error-actions">
                <button class="btn btn--primary" onclick="uiManager.downloadErrorReport()">Download Error Report</button>
                <button class="btn btn--secondary" onclick="uiManager.closeModal('transfer-errors-modal')">Close</button>
            </div>
        `;
        
        content.innerHTML = errorHTML;
        this.showModal('transfer-errors-modal');
    }
    
    // Download error report
    downloadErrorReport() {
        const failedTransfers = this.logger.getFailedTransfers();
        
        const reportContent = [
            '# DriveBridge Transfer Error Report',
            `# Generated: ${new Date().toISOString()}`,
            `# Failed Transfers: ${failedTransfers.length}`,
            '#',
            ''
        ];
        
        failedTransfers.forEach((failure, index) => {
            reportContent.push(`## Error ${index + 1}`);
            reportContent.push(`File: ${failure.fileName}`);
            reportContent.push(`Time: ${new Date(failure.timestamp).toLocaleString()}`);
            reportContent.push(`Error: ${failure.error}`);
            reportContent.push(`File ID: ${failure.fileId}`);
            reportContent.push('');
        });
        
        const blob = new Blob([reportContent.join('\n')], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `drivebridge-error-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            if (document.body.contains(a)) {
                document.body.removeChild(a);
            }
        }, 100);
        
        this.logger.info('Error report downloaded', {
            failedTransfers: failedTransfers.length,
            filename: a.download
        }, 'UI');
    }
    
    // Show export format selection modal
    showExportFormatModal(fileInfo, formats, onSelect, onCancel) {
        const modal = this.createModal('export-format-modal', 'Choose Export Format');
        const content = modal.querySelector('.modal-content');
        
        const formatHTML = `
            <p class="export-info">Select format to export "${this.escapeHtml(fileInfo.name)}":</p>
            <div class="export-format-grid">
                ${Object.entries(formats).map(([mimeType, formatInfo]) => `
                    <div class="export-format-option" data-mime-type="${mimeType}" onclick="uiManager.selectExportFormat(this, '${mimeType}')">
                        <div class="format-icon">${this.getFormatIcon(mimeType)}</div>
                        <div class="format-name">${this.escapeHtml(formatInfo.name)}</div>
                        <div class="format-description">${this.getFormatDescription(mimeType)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="modal-actions">
                <button class="btn btn--primary" onclick="uiManager.confirmExportFormat('${fileInfo.id}')">Export & Transfer</button>
                <button class="btn btn--secondary" onclick="uiManager.cancelExportFormat()">Cancel</button>
            </div>
        `;
        
        content.innerHTML = formatHTML;
        
        // Store callbacks
        this.exportFormatCallbacks = { onSelect, onCancel };
        this.exportFileInfo = fileInfo;
        this.selectedExportFormat = null;
        
        this.showModal('export-format-modal');
        
        // Auto-select first format
        const firstOption = content.querySelector('.export-format-option');
        if (firstOption) {
            this.selectExportFormat(firstOption, firstOption.dataset.mimeType);
        }
    }
    
    selectExportFormat(element, mimeType) {
        // Clear previous selection
        document.querySelectorAll('.export-format-option').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select current
        element.classList.add('selected');
        this.selectedExportFormat = mimeType;
        
        this.logger.debug(`Export format selected`, {
            mimeType,
            fileName: this.exportFileInfo?.name
        }, 'UI');
    }
    
    confirmExportFormat(fileId) {
        if (this.selectedExportFormat && this.exportFormatCallbacks) {
            this.exportFormatCallbacks.onSelect(this.selectedExportFormat);
            this.closeModal('export-format-modal');
        }
    }
    
    cancelExportFormat() {
        if (this.exportFormatCallbacks) {
            this.exportFormatCallbacks.onCancel();
            this.closeModal('export-format-modal');
        }
    }
    
    // Generic modal management - UPDATED WITH FIXES
    createModal(modalId, title) {
        // Remove existing modal if present
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const overlay = this.getOrCreateOverlay();
        
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>${this.escapeHtml(title)}</h3>
                    <button class="modal-close" onclick="uiManager.closeModal('${modalId}')" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-content"></div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.activeModals.add(modalId);
        
        return modal;
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = this.getOrCreateOverlay();
        
        if (modal && overlay) {
            // Clear any existing modal states first
            this.clearModalState();
            
            // Show the modal and overlay
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            modal.style.display = 'flex';
            overlay.style.display = 'block';
            
            // Add body class to prevent scrolling
            document.body.classList.add('modal-open');
            
            this.logger.debug(`Modal shown: ${modalId}`, {}, 'UI');
        }
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        
        this.activeModals.delete(modalId);
        
        // Always clear overlay when closing any modal
        this.clearOverlay();
        
        this.logger.debug(`Modal closed: ${modalId}`, {}, 'UI');
    }
    
    clearOverlay() {
        const overlay = document.getElementById('modal-overlay');
        
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            
            // Remove backdrop filter
            overlay.style.backdropFilter = '';
            overlay.style.webkitBackdropFilter = '';
        }
        
        // Remove body classes that might affect interaction
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        
        // Clear any remaining modal states
        this.clearModalState();
    }
    
    clearModalState() {
        // Remove any blur effects from body/html
        document.body.style.filter = '';
        document.documentElement.style.filter = '';
        
        // Ensure body can be interacted with
        document.body.style.pointerEvents = '';
        document.body.style.userSelect = '';
        
        // Clear any transform effects
        document.body.style.transform = '';
        
        // Reset overflow
        document.body.style.overflow = '';
    }
    
    getOrCreateOverlay() {
        let overlay = document.getElementById('modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-overlay';
            overlay.className = 'modal-overlay hidden';
            overlay.setAttribute('role', 'presentation');
            overlay.onclick = (e) => {
                // Only close if clicking the overlay itself, not its children
                if (e.target === overlay) {
                    this.closeAllModals();
                }
            };
            document.body.appendChild(overlay);
        }
        return overlay;
    }
    
    // Close all active modals
    closeAllModals() {
        // Close all active modals
        this.activeModals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        });
        
        // Clear the active modals set
        this.activeModals.clear();
        
        // Always clear overlay
        this.clearOverlay();
        
        this.logger.debug('All modals closed', {}, 'UI');
    }
    
    // Export format modal with proper cleanup
    hideExportFormatModal() {
        this.closeModal('export-format-modal');
        
        // Clean up export state
        if (window.app && window.app.currentExportFile && window.app.currentExportFile.reject) {
            window.app.currentExportFile.reject(new Error('Export cancelled by user'));
            window.app.currentExportFile = null;
            window.app.selectedExportFormat = null;
        }
    }
    
    // Show notification
    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notifications') || this.createNotificationContainer();
        
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${this.getNotificationIcon(type)}</span>
            <span class="notification-message">${this.escapeHtml(message)}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
        
        this.logger.debug(`Notification shown: ${message}`, { type, duration }, 'UI');
    }
    
    createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notifications';
        container.className = 'notifications';
        document.body.appendChild(container);
        return container;
    }
    
    // Utility methods
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
        if (bytesPerSecond < 1024 * 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`;
        if (bytesPerSecond < 1024 * 1024 * 1024) return `${Math.round(bytesPerSecond / (1024 * 1024))} MB/s`;
        return `${Math.round(bytesPerSecond / (1024 * 1024 * 1024))} GB/s`;
    }
    
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
    
    getNotificationIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    }
    
    getFormatIcon(mimeType) {
        const icons = Config.getFileTypeIcons();
        for (const [key, icon] of Object.entries(icons)) {
            if (mimeType.includes(key)) return icon;
        }
        return icons.default;
    }
    
    getFormatDescription(mimeType) {
        const descriptions = {
            'application/pdf': 'Best for sharing and printing',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Best for Microsoft Word editing',
            'text/html': 'Best for web publishing',
            'text/csv': 'Best for data analysis',
            'image/png': 'High quality image format',
            'image/jpeg': 'Compressed image format'
        };
        return descriptions[mimeType] || 'Standard format';
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
