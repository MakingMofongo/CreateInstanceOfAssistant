class BotDashboard {
    constructor() {
        this.refreshInterval = null;
        this.charts = new Map();
        this.currentBot = null;
    }

    async initialize() {
        await this.fetchAndDisplayBots();
        this.setupRefreshInterval();
        this.initializeEventListeners();
    }

    setupRefreshInterval() {
        // Refresh bot statuses every 30 seconds
        this.refreshInterval = setInterval(() => this.updateBotsStatus(), 30000);
    }

    initializeEventListeners() {
        // Global event listeners
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(this.refreshInterval);
            } else {
                this.setupRefreshInterval();
                this.updateBotsStatus();
            }
        });
    }

    async fetchAndDisplayBots() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = 'login.html';
                return;
            }

            const response = await fetch('/api/bots', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('token');
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error('Failed to fetch bots');
            }

            const bots = await response.json();
            this.renderBotsList(bots);
        } catch (error) {
            console.error('Error fetching bots:', error);
            this.showError('Failed to load bots');
        }
    }

    renderBotsList(bots) {
        const botList = document.getElementById('bot-list');
        if (!bots.length) {
            botList.innerHTML = this.getEmptyStateHTML();
            return;
        }

        botList.innerHTML = `
            <div class="bots-grid">
                ${bots.map(bot => this.getBotCardHTML(bot)).join('')}
            </div>
        `;

        // Initialize status indicators
        bots.forEach(bot => this.updateBotStatus(bot._id));
    }

    getBotCardHTML(bot) {
        return `
            <div class="bot-card" data-bot-id="${bot._id}">
                <div class="bot-card-header">
                    <div class="bot-status-indicator" id="status-${bot._id}">
                        <span class="status-dot"></span>
                        <span class="status-text">Checking...</span>
                    </div>
                    <h3>${bot.name}</h3>
                    <span class="bot-type">${bot.type}</span>
                </div>
                <div class="bot-card-body">
                    <div class="quick-stats">
                        <div class="stat">
                            <span class="stat-value" id="calls-${bot._id}">--</span>
                            <span class="stat-label">Calls Today</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value" id="uptime-${bot._id}">--</span>
                            <span class="stat-label">Uptime</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value" id="response-${bot._id}">--</span>
                            <span class="stat-label">Avg Response</span>
                        </div>
                    </div>
                    <div class="bot-info" id="info-${bot._id}"></div>
                    <button class="view-details-btn" onclick="dashboard.showBotDetails('${bot._id}')">
                        View Dashboard
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
    }

    async showBotDetails(botId) {
        try {
            if (!botId) {
                console.error('Invalid bot ID');
                this.showError('Invalid bot ID');
                return;
            }

            const bot = await this.fetchBotDetails(botId);
            if (!bot) {
                this.showError('Bot not found');
                return;
            }

            this.currentBot = bot;
            
            const modal = this.createDetailModal(bot);
            document.body.appendChild(modal);

            // Initialize tabs
            this.initializeTabs();
            
            try {
                // Initialize charts
                await this.initializeCharts(bot);
            } catch (chartError) {
                console.error('Error initializing charts:', chartError);
                // Don't throw here, allow the rest of the modal to load
            }
            
            // Fetch and display initial data
            await this.loadBotData(bot);

            // Add modal animations
            requestAnimationFrame(() => {
                modal.classList.add('modal-visible');
            });

        } catch (error) {
            console.error('Error showing bot details:', error);
            this.showError('Failed to load bot details');
        }
    }

    createDetailModal(bot) {
        const modal = document.createElement('div');
        modal.className = 'bot-detail-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="bot-info">
                        <h2>${bot.name || 'Unnamed Bot'}</h2>
                        <div class="bot-meta">
                            <span class="bot-type">${bot.type || 'Unknown Type'}</span>
                            <span class="bot-id">ID: ${bot._id || 'Unknown'}</span>
                        </div>
                    </div>
                    <button class="close-modal" onclick="dashboard.closeModal(this)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="modal-nav">
                    <button class="nav-tab active" data-tab="overview">Overview</button>
                    <button class="nav-tab" data-tab="calls">Calls</button>
                    <button class="nav-tab" data-tab="analytics">Analytics</button>
                    <button class="nav-tab" data-tab="settings">Settings</button>
                </div>

                <div class="modal-body">
                    <div class="tab-content active" id="overview">
                        <div class="overview-grid">
                            <div class="status-card">
                                <h3>Current Status</h3>
                                <div class="status-display">
                                    <div class="status-indicator"></div>
                                    <span class="status-text">Checking...</span>
                                </div>
                                <div class="uptime-info">
                                    <span>Uptime: --</span>
                                    <span>Last Incident: --</span>
                                </div>
                            </div>

                            <div class="quick-actions">
                                <h3>Quick Actions</h3>
                                <div class="action-buttons">
                                    <button onclick="dashboard.restartBot('${bot._id}')">
                                        <i class="fas fa-redo"></i> Restart
                                    </button>
                                    <button onclick="dashboard.showLogs('${bot._id}')">
                                        <i class="fas fa-list"></i> View Logs
                                    </button>
                                    <button onclick="dashboard.configureBot('${bot._id}')">
                                        <i class="fas fa-cog"></i> Configure
                                    </button>
                                </div>
                            </div>

                            <div class="chart-card">
                                <h3>Call Volume (24h)</h3>
                                <canvas id="callVolumeChart"></canvas>
                            </div>

                            <div class="chart-card">
                                <h3>Response Times</h3>
                                <canvas id="responseTimesChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="calls">
                        <div class="calls-list">
                            <div class="calls-header">
                                <h3>Recent Calls</h3>
                                <div class="calls-filter">
                                    <input type="text" placeholder="Search calls...">
                                    <select>
                                        <option>All Calls</option>
                                        <option>Completed</option>
                                        <option>Missed</option>
                                    </select>
                                </div>
                            </div>
                            <div class="calls-table-container">
                                <!-- Calls will be dynamically added here -->
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="analytics">
                        <div class="analytics-grid">
                            <div class="metric-card">
                                <h3>Key Metrics</h3>
                                <div class="metrics-grid">
                                    <!-- Metrics will be dynamically added here -->
                                </div>
                            </div>
                            <div class="chart-card full-width">
                                <h3>Conversation Analytics</h3>
                                <canvas id="conversationAnalyticsChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="settings">
                        <div class="settings-grid">
                            <div class="settings-card credentials-card">
                                <h3>Access Credentials</h3>
                                <div class="credential-item">
                                    <span>Username</span>
                                    <input type="text" value="${bot.username || 'Not available'}" readonly>
                                </div>
                                <div class="credential-item">
                                    <span>Password</span>
                                    <div class="password-container">
                                        <input type="password" value="${bot.password || 'Not available'}" readonly>
                                        <button onclick="dashboard.togglePassword(this)">Show</button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="settings-card endpoints-card">
                                <h3>Endpoints</h3>
                                <div class="endpoint-item">
                                    <span>Service URL</span>
                                    <input type="text" value="${bot.serviceUrl || 'Not available'}" readonly>
                                </div>
                                <div class="endpoint-item">
                                    <span>Phone Number</span>
                                    <input type="text" value="${bot.phoneNumber || 'Not available'}" readonly>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    // ... (continued in next message due to length)

    async updateBotStatus(botId) {
        try {
            if (!botId) {
                console.warn('Invalid bot ID:', botId);
                return;
            }

            const response = await fetch(`/api/bots/${botId}/status`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (!response.ok) throw new Error('Failed to fetch bot status');
            
            const status = await response.json();
            this.updateStatusIndicator(botId, status);
        } catch (error) {
            console.error('Error updating bot status:', error);
            this.updateStatusIndicator(botId, { state: 'ERROR' });
        }
    }

    updateStatusIndicator(botId, status) {
        const indicator = document.getElementById(`status-${botId}`);
        if (!indicator) return;

        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        const statusMap = {
            RUNNING: { class: 'status-success', text: 'Operational' },
            DEPLOYING: { class: 'status-warning', text: 'Deploying' },
            STOPPED: { class: 'status-error', text: 'Stopped' },
            NOT_FOUND: { class: 'status-error', text: 'Not Found' },
            MISMATCHED: { class: 'status-warning', text: 'Name Mismatch' },
            MOCK: { class: 'status-info', text: 'Mock Deployment' },
            ERROR: { class: 'status-error', text: 'Error' },
            UNKNOWN: { class: 'status-warning', text: 'Unknown' }
        };

        const statusInfo = statusMap[status.state] || statusMap.UNKNOWN;
        
        dot.className = `status-dot ${statusInfo.class}`;
        text.textContent = statusInfo.text;
        
        if (status.error) {
            indicator.title = status.error;
        }

        // Update additional info if available
        const infoElement = document.getElementById(`info-${botId}`);
        if (infoElement) {
            if (status.state === 'MISMATCHED') {
                infoElement.textContent = `Actual name: ${status.actualName}`;
            } else if (status.state === 'NOT_FOUND') {
                infoElement.textContent = 'Service may have been deleted';
            } else {
                infoElement.textContent = '';
            }
        }
    }

    async initializeCharts(bot) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js is not loaded. Charts will not be initialized.');
            return;
        }

        const callVolumeCtx = document.getElementById('callVolumeChart');
        const responseTimesCtx = document.getElementById('responseTimesChart');
        const analyticsCtx = document.getElementById('conversationAnalyticsChart');

        if (!callVolumeCtx || !responseTimesCtx || !analyticsCtx) {
            console.warn('One or more chart canvases are missing. Charts may not display correctly.');
            return;
        }

        // Sample data for now - will be replaced with real data later
        this.charts.set('callVolume', new Chart(callVolumeCtx.getContext('2d'), {
            type: 'line',
            data: this.getCallVolumeData(),
            options: this.getChartOptions('Call Volume')
        }));

        this.charts.set('responseTimes', new Chart(responseTimesCtx.getContext('2d'), {
            type: 'bar',
            data: this.getResponseTimesData(),
            options: this.getChartOptions('Response Times (ms)')
        }));

        this.charts.set('analytics', new Chart(analyticsCtx.getContext('2d'), {
            type: 'radar',
            data: this.getAnalyticsData(),
            options: this.getChartOptions('Conversation Metrics')
        }));
    }

    getChartOptions(title) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    }
                },
                title: {
                    display: true,
                    text: title,
                    color: 'rgba(255, 255, 255, 0.8)'
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    }
                }
            }
        };
    }

    // Sample data generators - will be replaced with real data
    getCallVolumeData() {
        return {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Calls',
                data: Array.from({length: 24}, () => Math.floor(Math.random() * 50)),
                borderColor: '#FF3E3E',
                backgroundColor: 'rgba(255, 62, 62, 0.2)',
                tension: 0.4
            }]
        };
    }

    getResponseTimesData() {
        return {
            labels: ['< 1s', '1-2s', '2-3s', '3-4s', '> 4s'],
            datasets: [{
                label: 'Response Distribution',
                data: [65, 59, 80, 81, 56],
                backgroundColor: 'rgba(255, 62, 62, 0.6)'
            }]
        };
    }

    getAnalyticsData() {
        return {
            labels: [
                'Understanding',
                'Response Time',
                'Task Completion',
                'User Satisfaction',
                'Call Resolution'
            ],
            datasets: [{
                label: 'Current Performance',
                data: [85, 90, 88, 87, 92],
                backgroundColor: 'rgba(255, 62, 62, 0.2)',
                borderColor: '#FF3E3E',
                pointBackgroundColor: '#FF3E3E'
            }]
        };
    }

    initializeTabs() {
        const tabs = document.querySelectorAll('.nav-tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(target).classList.add('active');

                // Refresh charts if they exist
                if (target === 'overview' || target === 'analytics') {
                    this.charts.forEach(chart => chart.update());
                }

                // Load specific content for each tab
                switch(target) {
                    case 'calls':
                        this.loadCallsData();
                        break;
                    case 'analytics':
                        this.loadAnalyticsData();
                        break;
                    case 'settings':
                        // Settings are static, no need to load data
                        break;
                }
            });
        });
    }

    // Add these placeholder methods
    loadCallsData() {
        console.log('Loading calls data...');
        // Implement this method to load and display calls data
    }

    loadAnalyticsData() {
        console.log('Loading analytics data...');
        // Implement this method to load and display analytics data
    }

    closeModal(button) {
        const modal = button.closest('.bot-detail-modal');
        modal.classList.remove('modal-visible');
        setTimeout(() => modal.remove(), 300);
    }

    togglePassword(button) {
        const input = button.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = 'Hide';
        } else {
            input.type = 'password';
            button.textContent = 'Show';
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    // Add this method to the BotDashboard class
    getEmptyStateHTML() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h3>No Bots Deployed Yet</h3>
                <p>Your deployed AI receptionists will appear here.</p>
                <button onclick="window.location.href='#create-bot'" class="create-bot-btn">
                    Create Your First Bot
                </button>
            </div>
        `;
    }

    async fetchBotDetails(botId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/bots/${botId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch bot details');
            }

            const botData = await response.json();
            console.log('Fetched bot details:', botData);  // Add this line
            return botData;
        } catch (error) {
            console.error('Error fetching bot details:', error);
            throw error;
        }
    }

    async loadBotData(bot) {
        // Placeholder for now - will be implemented later
        console.log('Loading data for bot:', bot.name);
        // Here you would typically fetch and display:
        // - Latest status
        // - Recent calls
        // - Analytics data
        // - Logs
    }
}

// Initialize the dashboard
const dashboard = new BotDashboard();
document.addEventListener('DOMContentLoaded', () => dashboard.initialize());

// Add this function for compatibility with the refresh call from script.js
window.fetchDeployedBots = () => {
    if (dashboard) {
        dashboard.fetchAndDisplayBots();
    }
};

