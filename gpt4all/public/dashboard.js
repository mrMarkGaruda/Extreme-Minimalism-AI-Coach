// Minimalism Progress Dashboard
// Interactive dashboard with visual progress tracking and goal setting

class MinimalismDashboard {
    constructor() {
        this.userProfile = null;
        this.userProgress = null;
        this.goals = [];
        this.decisionHistory = [];
        this.snapshot = null;
        this.computedProfile = null;
        
        this.init();
    }

    init() {
        this.loadUserData();
        this.updateSidebarProfile();
        this.updateAllVisuals();
        this.setupEventListeners();
    // Optional sections removed for minimal single-view layout
    // this.initializeCategories();
    // this.checkAchievements();
    // this.updateProgressChart();
    }

    loadUserData() {
        try {
            if (window.ProfileStore) {
                this.refreshSnapshot(true);
            } else {
                const profileData = localStorage.getItem('minimalism_user_profile');
                if (profileData) {
                    this.userProfile = JSON.parse(profileData);
                }

                const progressData = localStorage.getItem('minimalism_progress');
                if (progressData) {
                    this.userProgress = JSON.parse(progressData);
                }
            }

            // Load goals
            const goalsData = localStorage.getItem('minimalism_goals');
            if (goalsData) {
                this.goals = JSON.parse(goalsData);
            }

            // Load decision history
            const decisionsData = localStorage.getItem('minimalism_decisions');
            if (decisionsData) {
                this.decisionHistory = JSON.parse(decisionsData);
            }

            // If no data, redirect to assessment
            if (!this.userProfile) {
                this.showNoDataMessage();
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showErrorMessage();
        }
    }

    refreshSnapshot(force = false) {
        if (!window.ProfileStore) return null;
        const snapshot = ProfileStore.getSnapshot({ force });
        this.snapshot = snapshot;
        this.userProfile = snapshot.profile;
        this.userProgress = snapshot.progress;
        this.computedProfile = snapshot.computed;
        return snapshot;
    }

    updateSidebarProfile() {
        const container = document.getElementById('userInfo');
        if (!container) return;

        if (window.ProfileStore) {
            const snapshot = this.refreshSnapshot();
            const renderedSnapshot = ProfileStore.renderProfileCard(container, { snapshot });
            if (renderedSnapshot) {
                this.snapshot = renderedSnapshot;
                this.userProfile = renderedSnapshot.profile;
                this.userProgress = renderedSnapshot.progress;
                this.computedProfile = renderedSnapshot.computed;
            }
            return;
        }

        if (this.userProfile) {
            const lifestyle = this.userProfile.lifestyle || 'Lifestyle TBD';
            container.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">${this.getAvatarInitials()}</div>
                    <div class="user-profile__details">
                        <h3>${this.userProfile.name}</h3>
                        <p>${this.capitalizeFirst(this.userProfile.phase)} phase • ${lifestyle}</p>
                    </div>
                </div>
                <div class="progress-indicators">
                    <div class="progress-item">
                        <span class="progress-number">${this.getCurrentItemCount()}</span>
                        <span class="progress-label">Current Items</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.userProfile.targetItems || 50}</span>
                        <span class="progress-label">Target Items</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.getImprovementPercentage()}%</span>
                        <span class="progress-label">Progress</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.formatTimeframeShort(this.userProfile.timeframe)}</span>
                        <span class="progress-label">Timeline</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">MC</div>
                    <div class="user-profile__details">
                        <h3>Welcome!</h3>
                        <p>Complete the assessment to unlock personalized tracking.</p>
                    </div>
                </div>
                <a class="link-pill" href="assessment.html">Start assessment</a>
            `;
        }
    }

    setupEventListeners() {
        // Progress logging
        window.addProgress = () => this.showProgressModal();
        
        // Goal setting
        window.setGoal = () => this.setNewGoal();
        
        // Export functionality
        window.exportProgress = () => this.exportProgressData();
        
        // Enter key for goal setting (section may not exist)
        const goalInput = document.getElementById('goalInput');
        if (goalInput) {
            goalInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.setNewGoal();
            });
        }
    }

    updateAllVisuals() {
    if (window.ProfileStore) {
        this.refreshSnapshot();
    }
    this.updateSidebarProfile();
    this.updateProgressOverview();
    this.updateMilestones();
    this.updateStats();
    }

    updateProgressOverview() {
        if (!this.userProfile) return;

        const progressPercentage = typeof this.computedProfile?.improvementPercent === 'number'
            ? this.computedProfile.improvementPercent
            : this.getImprovementPercentage();

        this.updateProgressCircle(progressPercentage);

        // Update progress text
        const progressLabel = document.getElementById('progressPercentage');
        if (progressLabel) {
            progressLabel.textContent = `${Math.round(progressPercentage)}%`;
        }
    }

    getImprovementPercentage() {
        if (typeof this.computedProfile?.improvementPercent === 'number') {
            return this.computedProfile.improvementPercent;
        }
        if (!this.userProfile) return 0;
        const startItems = this.userProfile.currentItems;
        const currentItems = this.getCurrentItemCount();
        const targetItems = this.userProfile.targetItems || 50;
        const totalReduction = startItems - targetItems;
        if (totalReduction <= 0) return 0;
        const currentReduction = startItems - currentItems;
        return Math.max(0, Math.min(100, Math.round((currentReduction / totalReduction) * 100)));
    }

    updateProgressCircle(percentage) {
        const circle = document.getElementById('progressRing');
        const radius = 85;
        const circumference = 2 * Math.PI * radius;
        if (circle) {
            circle.style.strokeDasharray = circumference;
            circle.style.strokeDashoffset = circumference - (percentage / 100) * circumference;
        }
    }

    // updatePhaseProgression removed (phases section not present)

    updateMilestones() {
        const milestonesList = document.getElementById('milestonesList');
        
        if (!this.userProgress || !this.userProgress.milestones) {
            milestonesList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No milestones yet. Start your journey!</p>';
            return;
        }

        const milestones = [...this.userProgress.milestones].reverse().slice(0, 3); // Show most recent 3
        
        milestonesList.innerHTML = milestones.map(milestone => `
            <div class="milestone-item">
                <div class="milestone-icon">${this.getMilestoneIcon(milestone)}</div>
                <div class="milestone-details">
                    <h4>${milestone.milestone}</h4>
                    <p>${milestone.notes || 'Progress logged'}</p>
                </div>
                <div class="milestone-date">
                    ${this.formatDate(milestone.date)}
                </div>
            </div>
        `).join('');
    }

    updateStats() {
        if (!this.userProfile) return;

        const metrics = this.computedProfile?.metrics || {};
        const currentItems = typeof metrics.currentItems === 'number' ? metrics.currentItems : this.getCurrentItemCount();
        const startItems = typeof metrics.startItems === 'number' ? metrics.startItems : this.userProfile.currentItems;
        const targetItems = typeof metrics.targetItems === 'number' ? metrics.targetItems : (this.userProfile.targetItems || 50);
        const itemsReduced = startItems && typeof currentItems === 'number' ? startItems - currentItems : 0;
        
        // Calculate days on journey
        const startDate = new Date(this.userProfile.createdAt);
        const today = new Date();
        const daysOnJourney = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

        // Update stats
        const formatNumber = window.ProfileStore ? (value) => ProfileStore.formatNumber(value) : (value) => value;

        const currentItemsElement = document.getElementById('currentItems');
        const reducedElement = document.getElementById('itemsReduced');
        const targetElement = document.getElementById('targetItems');
        const daysElement = document.getElementById('daysOnJourney');

        if (currentItemsElement) currentItemsElement.textContent = formatNumber(currentItems);
        if (reducedElement) reducedElement.textContent = formatNumber(itemsReduced > 0 ? itemsReduced : 0);
        if (targetElement) targetElement.textContent = formatNumber(targetItems);
        if (daysElement) daysElement.textContent = daysOnJourney;
    }

    getCurrentItemCount() {
        const metrics = this.computedProfile?.metrics;
        if (metrics && typeof metrics.currentItems === 'number') {
            return metrics.currentItems;
        }
        if (this.userProgress && this.userProgress.milestones && this.userProgress.milestones.length > 0) {
            return this.userProgress.milestones[this.userProgress.milestones.length - 1].itemCount;
        }
        return typeof this.userProfile?.currentItems === 'number' ? this.userProfile.currentItems : 0;
    }

    getAvatarInitials() {
        if (!this.userProfile?.name) return 'MC';
        return this.userProfile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'MC';
    }

    capitalizeFirst(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    formatTimeframeShort(timeframe) {
        if (window.ProfileStore) {
            return ProfileStore.formatTimeframeShort(timeframe);
        }
        const map = {
            '3-months': '3 mo plan',
            '6-months': '6 mo plan',
            '1-year': '1 yr plan',
            'flexible': 'Flexible'
        };
        return map[timeframe] || 'Flexible';
    }

    initializeCategories() {
        const categoriesGrid = document.getElementById('categoriesGrid');
        
        const categories = [
            { name: 'Clothing', icon: 'C', count: this.getCategoryCount('clothing') },
            { name: 'Books', icon: 'B', count: this.getCategoryCount('books') },
            { name: 'Electronics', icon: 'E', count: this.getCategoryCount('electronics') },
            { name: 'Kitchen', icon: 'K', count: this.getCategoryCount('kitchen') },
            { name: 'Decorative', icon: 'D', count: this.getCategoryCount('decorative') },
            { name: 'Sentimental', icon: 'S', count: this.getCategoryCount('sentimental') },
            { name: 'Tools', icon: 'T', count: this.getCategoryCount('tools') },
            { name: 'Other', icon: 'O', count: this.getCategoryCount('other') }
        ];

        if (!categoriesGrid) return;
        categoriesGrid.innerHTML = categories.map(category => `
            <div class="category-card" onclick="viewCategory('${category.name.toLowerCase()}')">
                <div class="category-icon">${category.icon}</div>
                <div class="category-name">${category.name}</div>
                <div class="category-count">${category.count} items</div>
            </div>
        `).join('');
    }

    getCategoryCount(category) {
        // This would be enhanced with actual category tracking
        // For now, return estimated counts based on clutter areas
        if (!this.userProfile || !this.userProfile.clutterAreas) return '?';
        
        const estimates = {
            clothing: 150,
            books: 80,
            electronics: 25,
            kitchen: 100,
            decorative: 50,
            sentimental: 30,
            tools: 20,
            other: 45
        };

        const currentItems = this.getCurrentItemCount();
        const startItems = this.userProfile.currentItems;
        const reductionFactor = currentItems / startItems;

        return Math.round(estimates[category] * reductionFactor);
    }

    checkAchievements() {
        const achievements = [
            { id: 'starter', threshold: 1, name: 'Journey Starter' },
            { id: 'focused', threshold: 7, name: 'Focused' },
            { id: 'dedicated', threshold: 30, name: 'Dedicated' },
            { id: 'minimalist', threshold: 90, name: 'True Minimalist' }
        ];

        const daysOnJourney = this.getDaysOnJourney();

        achievements.forEach(achievement => {
            const element = document.getElementById(`badge-${achievement.id}`);
            if (element && daysOnJourney >= achievement.threshold) {
                element.classList.add('earned');
            }
        });
    }

    getDaysOnJourney() {
        if (!this.userProfile) return 0;
        
        const startDate = new Date(this.userProfile.createdAt);
        const today = new Date();
        return Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    }

    setNewGoal() {
        const goalInput = document.getElementById('goalInput');
        const targetCount = parseInt(goalInput.value);
        
        if (!targetCount || targetCount <= 0) {
            this.showNotification('Please enter a valid item count', 'warning');
            return;
        }

        const currentItems = this.getCurrentItemCount();
        
        if (targetCount >= currentItems) {
            this.showNotification('Goal should be less than your current item count', 'warning');
            return;
        }

        const goal = {
            id: Date.now(),
            targetCount: targetCount,
            currentCount: currentItems,
            dateSet: new Date().toISOString(),
            targetDate: this.calculateTargetDate(currentItems, targetCount),
            status: 'active'
        };

        this.goals.push(goal);
        this.saveGoals();
        
        goalInput.value = '';
        this.showNotification(`New goal set: Reduce to ${targetCount} items!`, 'success');
    }

    calculateTargetDate(current, target) {
        const itemsToReduce = current - target;
        const estimatedDays = Math.ceil(itemsToReduce / 5); // Estimate 5 items per day
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + estimatedDays);
        return targetDate.toISOString();
    }

    showProgressModal() {
        const currentItems = this.getCurrentItemCount();
        const newCount = prompt(`Current items: ${currentItems}\nEnter your new item count:`, currentItems - 10);
        
        if (newCount && parseInt(newCount) >= 0) {
            this.addProgressEntry(parseInt(newCount));
        }
    }

    async addProgressEntry(itemCount) {
        const milestone = {
            itemCount: itemCount,
            date: new Date().toISOString(),
            milestone: `Updated to ${itemCount} items`,
            notes: prompt('Add notes about this progress (optional):') || '',
            improvement: this.getCurrentItemCount() - itemCount
        };

        // Update local progress
        if (!this.userProgress) {
            this.userProgress = {
                userId: this.userProfile?.id || 'anonymous',
                milestones: [],
                currentPhase: 'initial',
                startDate: new Date().toISOString()
            };
        }

        this.userProgress.milestones.push(milestone);
        this.userProgress.lastUpdate = new Date().toISOString();
        this.userProgress.currentItemCount = itemCount;

        // Save locally
        localStorage.setItem('minimalism_progress', JSON.stringify(this.userProgress));
        if (window.ProfileStore) {
            ProfileStore.setProgress(this.userProgress);
            this.refreshSnapshot(true);
        }

        // Send to API
        try {
            const response = await fetch('/api/progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: this.userProfile?.id || 'anonymous',
                    itemCount: itemCount,
                    milestone: milestone.milestone,
                    notes: milestone.notes
                })
            });

            if (response.ok) {
                this.showNotification('Progress updated successfully!', 'success');
            }
        } catch (error) {
            console.error('Failed to sync progress:', error);
            this.showNotification('Progress saved locally', 'info');
        }

        // Refresh dashboard
        this.updateAllVisuals();
        this.checkForMilestones(itemCount);
    }

    checkForMilestones(newItemCount) {
        const milestones = [500, 300, 200, 150, 100, 75, 50];
        const currentItems = this.getCurrentItemCount();
        
        milestones.forEach(milestone => {
            if (newItemCount <= milestone && currentItems > milestone) {
                this.celebrateMilestone(milestone);
            }
        });
    }

    celebrateMilestone(milestone) {
        // Show celebration animation
        setTimeout(() => {
            this.showNotification(`Milestone achieved: ${milestone} items`, 'success');
        }, 1000);
    }

    exportProgressData() {
        const exportData = {
            profile: this.userProfile,
            progress: this.userProgress,
            goals: this.goals,
            decisions: this.decisionHistory,
            exportDate: new Date().toISOString()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `minimalism-progress-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showNotification('Progress data exported successfully!', 'success');
    }

    updateProgressChart() {
        // Placeholder for future chart implementation
        // Could integrate Chart.js or similar library here
        console.log('Progress chart update - ready for chart library integration');
    }

    saveGoals() {
        localStorage.setItem('minimalism_goals', JSON.stringify(this.goals));
    }

    getMilestoneIcon(milestone) {
    if (milestone.milestone.includes('Assessment')) return 'A';
    if (milestone.milestone.includes('500')) return '500';
    if (milestone.milestone.includes('300')) return '300';
    if (milestone.milestone.includes('200')) return '200';
    if (milestone.milestone.includes('100')) return '100';
    if (milestone.milestone.includes('50')) return '50';
    return '*';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return date.toLocaleDateString();
    }

    showNoDataMessage() {
        document.querySelector('.dashboard-content').innerHTML = `
            <div class="dashboard-card" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                <div style="font-size: 2em; margin-bottom: 20px;">Dashboard</div>
                <h2>Welcome to Your Minimalism Dashboard!</h2>
                <p style="margin: 20px 0; color: #666; font-size: 1.1em;">
                    To see your progress and get personalized insights, you'll need to complete your assessment first.
                </p>
                <a href="assessment.html" class="nav-btn" style="margin: 20px;">
                    Take Assessment
                </a>
                <a href="index.html" class="nav-btn">
                    Chat with Coach
                </a>
            </div>
        `;
    }

    showErrorMessage() {
        document.querySelector('.dashboard-content').innerHTML = `
            <div class="dashboard-card" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                <div style="font-size: 2em; margin-bottom: 20px;">Warning</div>
                <h2>Dashboard Error</h2>
                <p style="margin: 20px 0; color: #666;">
                    There was an error loading your dashboard data. Please try refreshing the page.
                </p>
                <button onclick="location.reload()" class="nav-btn">
                    Refresh Page
                </button>
            </div>
        `;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'warning' ? '#ff9800' : '#2196f3'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
            font-weight: 500;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
}

// Global functions for HTML onclick handlers
function viewCategory(category) {
    window.dashboardApp.showNotification(`Category breakdown for ${category} coming soon!`, 'info');
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new MinimalismDashboard();
});

// (Removed) Inline CSS injection; styles are centralized in minimal-design.css