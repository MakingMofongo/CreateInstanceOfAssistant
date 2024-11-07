class Dashboard {
    constructor() {
        this.refreshInterval = null;
        this.charts = new Map();
        this.currentBot = null;
    }

    async initialize() {
        const isAuthenticated = await this.checkAuth();
        if (!isAuthenticated) return;
        
        await this.fetchAndDisplayBots();
        this.setupRefreshInterval();
        this.initializeEventListeners();
    }

    async checkAuth() {
        if (ENV.IS_MOCK) {
            await this.updateUserDisplay();
            return true;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login';
            return false;
        }
        
        try {
            const response = await fetch('/api/user', {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to authenticate');
            }
            
            await this.updateUserDisplay();
            return true;
        } catch (error) {
            console.error('Authentication failed:', error);
            window.location.href = '/login';
            return false;
        }
    }

    async updateUserDisplay() {
        try {
            if (ENV.IS_MOCK) {
                const userSection = document.getElementById('userSection');
                const userName = document.getElementById('userName');
                if (userSection && userName) {
                    userSection.classList.remove('hidden');
                    userName.textContent = 'Demo User';
                }
                return;
            }

            const response = await fetch('/api/user', {
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Accept': 'application/json'
                }
            });
            const userData = await response.json();
            
            const userSection = document.getElementById('userSection');
            const userName = document.getElementById('userName');

            if (userSection && userName && userData) {
                userSection.classList.remove('hidden');
                userName.textContent = userData.name || 'Guest User';
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            this.showError('Failed to load user data');
        }
    }

    async fetchAndDisplayBots() {
        try {
            console.log('Fetching bots...');
            
            if (ENV.IS_MOCK) {
                const mockBots = [
                    {
                        _id: 'mock_1',
                        name: 'Hilton Demo Bot',
                        type: 'Hotel',
                        status: 'RUNNING',
                        createdAt: new Date(),
                        metrics: {
                            callCount: Math.floor(Math.random() * 100),
                            uptime: '99.9%',
                            responseTime: '2.5s'
                        }
                    },
                    {
                        _id: 'mock_2',
                        name: 'Hospital Demo Bot',
                        type: 'Hospital',
                        status: 'RUNNING',
                        createdAt: new Date(),
                        metrics: {
                            callCount: Math.floor(Math.random() * 100),
                            uptime: '99.9%',
                            responseTime: '2.5s'
                        }
                    }
                ];
                this.renderBotsList(mockBots);
                this.updateStats(mockBots);
                return;
            }

            const token = localStorage.getItem('token');
            const response = await fetch('/api/bots', {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch bots: ${response.status}`);
            }

            const bots = await response.json();
            console.log('Fetched bots:', bots);
            
            this.renderBotsList(bots);
            this.updateStats(bots);
        } catch (error) {
            console.error('Error fetching bots:', error);
            this.showError('Failed to load bots');
        }
    }

    renderBotsList(bots) {
        const botGrid = document.getElementById('botGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!bots || bots.length === 0) {
            botGrid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        botGrid.innerHTML = bots.map(bot => this.getBotCardHTML(bot)).join('');

        // Initialize status indicators and metrics
        bots.forEach(bot => {
            this.updateBotStatus(bot._id);
        });
    }

    getBotCardHTML(bot) {
        return `
            <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-purple-500 transition-all duration-300"
                 data-bot-id="${bot._id}">
                <div class="p-6">
                    <!-- Status and Type Badge -->
                    <div class="flex justify-between items-start mb-4">
                        <div class="status-indicator" id="status-${bot._id}">
                            <span class="status-dot"></span>
                            <span class="status-text">Checking...</span>
                        </div>
                        <span class="px-3 py-1 text-xs font-medium rounded-full 
                                 ${this.getTypeBadgeClass(bot.type)}">
                            ${bot.type}
                        </span>
                    </div>

                    <!-- Bot Name and Creation Date -->
                    <h3 class="text-xl font-semibold text-white mb-2">${bot.name}</h3>
                    <p class="text-sm text-gray-400 mb-4">
                        Created ${this.formatDate(bot.createdAt)}
                    </p>

                    <!-- Quick Stats -->
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div class="bg-gray-900 p-3 rounded-lg">
                            <div class="text-xl font-bold text-white" id="calls-${bot._id}">--</div>
                            <div class="text-xs text-gray-400">Calls Today</div>
                        </div>
                        <div class="bg-gray-900 p-3 rounded-lg">
                            <div class="text-xl font-bold text-white" id="uptime-${bot._id}">--</div>
                            <div class="text-xs text-gray-400">Uptime</div>
                        </div>
                        <div class="bg-gray-900 p-3 rounded-lg">
                            <div class="text-xl font-bold text-white" id="response-${bot._id}">--</div>
                            <div class="text-xs text-gray-400">Avg Response</div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-between items-center">
                        <button onclick="dashboard.showBotDetails('${bot._id}')"
                                class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                            <i class="fas fa-chart-line mr-2"></i>
                            View Analytics
                        </button>
                        <div class="flex space-x-2">
                            <button onclick="dashboard.restartBot('${bot._id}')"
                                    class="bg-gray-700 text-gray-300 p-2 rounded-lg hover:bg-gray-600" title="Restart Bot">
                                <i class="fas fa-redo"></i>
                            </button>
                            <button onclick="dashboard.showLogs('${bot._id}')"
                                    class="bg-gray-700 text-gray-300 p-2 rounded-lg hover:bg-gray-600" title="View Logs">
                                <i class="fas fa-list"></i>
                            </button>
                            <button onclick="dashboard.configureBot('${bot._id}')"
                                    class="bg-gray-700 text-gray-300 p-2 rounded-lg hover:bg-gray-600" title="Configure">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getTypeBadgeClass(type) {
        const classes = {
            'Hotel': 'bg-blue-900 text-blue-200',
            'Hospital': 'bg-green-900 text-green-200',
            'Custom': 'bg-purple-900 text-purple-200'
        };
        return classes[type] || 'bg-gray-900 text-gray-200';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    async updateBotStatus(botId) {
        try {
            const response = await fetch(`/api/bots/${botId}/status`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (!response.ok) throw new Error('Failed to fetch bot status');
            
            const data = await response.json();
            this.updateStatusIndicator(botId, data.status);
            if (data.metrics) {
                this.updateMetrics(botId, data.metrics);
            }
        } catch (error) {
            console.error('Error updating bot status:', error);
            this.updateStatusIndicator(botId, { state: 'ERROR' });
        }
    }

    updateStatusIndicator(botId, status) {
        const indicator = document.getElementById(`status-${botId}`);
        if (!indicator) return;

        const statusMap = {
            'RUNNING': { 
                class: 'bg-green-500', 
                text: 'Operational',
                icon: 'fa-check-circle',
                description: 'Bot is running normally'
            },
            'DEPLOYING': { 
                class: 'bg-yellow-500', 
                text: 'Deploying',
                icon: 'fa-spinner fa-spin',
                description: 'Deployment in progress'
            },
            'STOPPED': { 
                class: 'bg-red-500', 
                text: 'Stopped',
                icon: 'fa-stop-circle',
                description: 'Service is stopped'
            },
            'NOT_FOUND': { 
                class: 'bg-gray-400', 
                text: 'Archived',
                icon: 'fa-archive',
                description: 'Bot is archived and can be redeployed'
            },
            'MISMATCHED': { 
                class: 'bg-yellow-500', 
                text: 'Name Mismatch',
                icon: 'fa-exclamation-triangle',
                description: 'Service found with different name'
            },
            'MOCK': { 
                class: 'bg-purple-500', 
                text: 'Mock Mode',
                icon: 'fa-flask',
                description: 'Running in simulation mode'
            },
            'ERROR': { 
                class: 'bg-red-500', 
                text: 'Error',
                icon: 'fa-exclamation-circle',
                description: 'An error occurred'
            }
        };

        const statusInfo = statusMap[status.state] || { 
            class: 'bg-gray-500', 
            text: 'Unknown',
            icon: 'fa-question-circle',
            description: 'Status unknown'
        };

        // Update the status indicator with icon and description
        indicator.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="status-dot ${statusInfo.class} w-2 h-2 rounded-full"></span>
                <i class="fas ${statusInfo.icon} text-sm ${statusInfo.class.replace('bg-', 'text-')}"></i>
                <span class="text-sm font-medium">${statusInfo.text}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">
                ${status.error || statusInfo.description}
            </div>
        `;

        // Add tooltip if exists
        if (status.error) {
            indicator.setAttribute('title', status.error);
        }

        // Add additional info for certain statuses
        const infoElement = document.getElementById(`info-${botId}`);
        if (infoElement) {
            if (status.state === 'NOT_FOUND') {
                infoElement.innerHTML = `
                    <div class="mt-2 p-2 bg-gray-100 rounded-lg">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-info-circle mr-2"></i>
                            <span>This bot is archived. You can redeploy it from the dashboard.</span>
                        </div>
                        <button onclick="redeployBot('${botId}')" class="mt-2 text-sm text-purple-600 hover:text-purple-700">
                            <i class="fas fa-redo mr-1"></i>
                            Redeploy Bot
                        </button>
                    </div>
                `;
            } else if (status.state === 'MISMATCHED') {
                infoElement.innerHTML = `
                    <div class="mt-2 p-2 bg-yellow-50 rounded-lg">
                        <div class="flex items-center text-sm text-yellow-800">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            <span>Service found as: ${status.actualName}</span>
                        </div>
                    </div>
                `;
            } else {
                infoElement.innerHTML = '';
            }
        }
    }

    updateStats(bots) {
        const totalBots = bots.length;
        const activeBots = bots.filter(bot => bot.status === 'RUNNING').length;
        const totalCalls = bots.reduce((sum, bot) => sum + (bot.metrics?.callCount || 0), 0);

        document.getElementById('totalBots').textContent = totalBots;
        document.getElementById('activeBots').textContent = activeBots;
        document.getElementById('totalCalls').textContent = totalCalls;
    }

    setupRefreshInterval() {
        // Refresh bot statuses every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.fetchAndDisplayBots();
        }, 30000);
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    initializeEventListeners() {
        // Handle logout
        const logoutButton = document.querySelector('[onclick="handleLogout()"]');
        if (logoutButton) {
            logoutButton.onclick = () => {
                localStorage.removeItem('token');
                window.location.href = '/login';
            };
        }

        // Handle refresh
        const refreshButton = document.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.onclick = () => this.fetchAndDisplayBots();
        }
    }
}

// Initialize dashboard
const dashboard = new Dashboard();
document.addEventListener('DOMContentLoaded', () => dashboard.initialize());

// Add redeployBot function
async function redeployBot(botId) {
    try {
        const response = await fetch(`/api/bots/${botId}/redeploy`, {
            method: 'POST',
            headers: getRequestHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to redeploy bot');
        }

        showToast('Redeployment started successfully', 'success');
        // Refresh the bot's status after a short delay
        setTimeout(() => updateBotStatus(botId), 2000);
    } catch (error) {
        console.error('Error redeploying bot:', error);
        showToast('Failed to redeploy bot', 'error');
    }
}

// Add this helper function
function getRequestHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
}
