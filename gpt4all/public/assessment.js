// Extreme Minimalism Assessment Wizard
// Handles dynamic form processing, validation, and local storage

class MinimalismAssessment {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 5;
        this.formData = {};
        this.userProfile = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExistingProfile();
        this.loadExistingData();
        this.updateProgress();
        this.setupSliders();
        this.setupRadioButtons();
        this.setupCheckboxes();
        this.updateSidebarProfile();
    }

    loadExistingProfile() {
        try {
            const profileData = localStorage.getItem('minimalism_user_profile');
            if (profileData) {
                this.userProfile = JSON.parse(profileData);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    updateSidebarProfile() {
        const container = document.getElementById('userInfo');
        if (!container) return;

        if (this.userProfile) {
            const lifestyle = this.userProfile.lifestyle || 'Lifestyle TBD';
            container.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">${this.getAvatarInitials(this.userProfile.name)}</div>
                    <div class="user-profile__details">
                        <h3>${this.userProfile.name}</h3>
                        <p>${this.capitalizeFirst(this.userProfile.phase)} phase • ${lifestyle}</p>
                    </div>
                </div>
                <div class="progress-indicators">
                    <div class="progress-item">
                        <span class="progress-number">${this.userProfile.currentItems}</span>
                        <span class="progress-label">Current Items</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.userProfile.targetItems || 50}</span>
                        <span class="progress-label">Target Items</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.userProfile.timeframe ? this.formatTimeframeShort(this.userProfile.timeframe) : 'Flexible'}</span>
                        <span class="progress-label">Timeline</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">MC</div>
                    <div class="user-profile__details">
                        <h3>Let’s get started</h3>
                        <p>Your answers will shape a focused minimalism roadmap tailored to you.</p>
                    </div>
                </div>
            `;
        }
    }

    setupEventListeners() {
        // Form validation on input changes
        document.addEventListener('input', (e) => {
            if (e.target.matches('input, select, textarea')) {
                this.validateField(e.target);
                this.saveFormData();
            }
        });

        // Handle Enter key for navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.target.matches('textarea')) {
                e.preventDefault();
                this.changeStep(1);
            }
        });

        // Window beforeunload to save data
        window.addEventListener('beforeunload', () => {
            this.saveFormData();
        });
    }

    setupSliders() {
        // Current items slider
        const currentItemsSlider = document.getElementById('currentItems');
        const itemCountDisplay = document.getElementById('itemCountDisplay');
        
        if (currentItemsSlider) {
            currentItemsSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                itemCountDisplay.textContent = `${value} items`;
                
                // Update slider background for visual feedback
                const percentage = ((value - 100) / (2000 - 100)) * 100;
                e.target.style.background = `linear-gradient(to right, #4facfe 0%, #4facfe ${percentage}%, #e1e5e9 ${percentage}%, #e1e5e9 100%)`;
            });
            
            // Trigger initial update
            currentItemsSlider.dispatchEvent(new Event('input'));
        }

        // Attachment level slider
        const attachmentSlider = document.getElementById('attachmentLevel');
        const attachmentDisplay = document.getElementById('attachmentDisplay');
        
        if (attachmentSlider) {
            attachmentSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                attachmentDisplay.textContent = `${value}/10`;
                
                const percentage = ((value - 1) / 9) * 100;
                e.target.style.background = `linear-gradient(to right, #4facfe 0%, #4facfe ${percentage}%, #e1e5e9 ${percentage}%, #e1e5e9 100%)`;
            });
            
            attachmentSlider.dispatchEvent(new Event('input'));
        }
    }

    setupRadioButtons() {
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.option-card');
            if (card) {
                const radioInput = card.querySelector('input[type="radio"]');
                if (!radioInput) return;
                const radioGroup = radioInput.name;

                // Clear other selections in this group
                document.querySelectorAll(`input[name="${radioGroup}"]`).forEach(input => {
                    const parent = input.closest('.option-card');
                    if (parent) parent.classList.remove('selected');
                    input.checked = false;
                });

                // Select this option
                radioInput.checked = true;
                card.classList.add('selected');

                // Trigger validation
                this.validateField(radioInput);
            }
        });
    }

    setupCheckboxes() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.checkbox-item')) {
                const checkboxItem = e.target.closest('.checkbox-item');
                const checkbox = checkboxItem.querySelector('input[type="checkbox"]');
                
                // Toggle selection
                checkbox.checked = !checkbox.checked;
                checkboxItem.classList.toggle('selected', checkbox.checked);
                
                this.saveFormData();
            }
        });
    }

    validateField(field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return true;

        let isValid = true;
        const errorMessage = formGroup.querySelector('.error-message');

        // Clear previous error state
        formGroup.classList.remove('error');

        // Validation rules
        if (field.hasAttribute('required') && !field.value.trim()) {
            isValid = false;
        }

        // Special validation for radio groups
        if (field.type === 'radio') {
            const radioGroup = document.querySelectorAll(`input[name="${field.name}"]`);
            isValid = Array.from(radioGroup).some(radio => radio.checked);
        }

        // Update UI based on validation
        if (!isValid) {
            formGroup.classList.add('error');
        }

        return isValid;
    }

    validateCurrentStep() {
        const currentStepElement = document.getElementById(`step${this.currentStep}`);
        const requiredFields = currentStepElement.querySelectorAll('[required]');
        let allValid = true;

        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                allValid = false;
            }
        });

        // Special validation for radio groups in current step
        const radioGroups = {};
        currentStepElement.querySelectorAll('input[type="radio"][required]').forEach(radio => {
            if (!radioGroups[radio.name]) {
                radioGroups[radio.name] = [];
            }
            radioGroups[radio.name].push(radio);
        });

        Object.values(radioGroups).forEach(group => {
            if (!group.some(radio => radio.checked)) {
                allValid = false;
                group[0].closest('.form-group')?.classList.add('error');
            }
        });

        return allValid;
    }

    changeStep(direction) {
        // Validate current step before proceeding
        if (direction > 0 && !this.validateCurrentStep()) {
            this.showValidationErrors();
            return;
        }

        const newStep = this.currentStep + direction;
        
        if (newStep < 1 || newStep > this.totalSteps) return;

        // Hide current step
        document.getElementById(`step${this.currentStep}`).classList.remove('active');
        
        // Show new step
        this.currentStep = newStep;
        document.getElementById(`step${this.currentStep}`).classList.add('active');
        
        // Update navigation buttons
        this.updateNavigation();
        
        // Update progress bar
        this.updateProgress();
        
        // Save form data
        this.saveFormData();
        
        // Handle completion
        if (this.currentStep === this.totalSteps) {
            this.completeAssessment();
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showValidationErrors() {
        // Scroll to first error
        const firstError = document.querySelector('.form-group.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Show a gentle notification
        this.showNotification('Please fill in all required fields before continuing.', 'warning');
    }

    updateNavigation() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        prevBtn.disabled = this.currentStep === 1;
        
        if (this.currentStep === this.totalSteps) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'inline-block';
            nextBtn.textContent = this.currentStep === this.totalSteps - 1 ? 'Complete Assessment' : 'Next';
        }
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const percentage = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
        progressFill.style.width = `${percentage}%`;
    }

    saveFormData() {
        const formData = this.collectFormData();
        localStorage.setItem('minimalism_assessment_data', JSON.stringify(formData));
        localStorage.setItem('minimalism_assessment_step', this.currentStep.toString());
    }

    loadExistingData() {
        try {
            const savedData = localStorage.getItem('minimalism_assessment_data');
            const savedStep = localStorage.getItem('minimalism_assessment_step');
            
            if (savedData) {
                this.formData = JSON.parse(savedData);
                this.populateFormFromData(this.formData);
            }

            if (savedStep && parseInt(savedStep) < this.totalSteps) {
                this.currentStep = parseInt(savedStep);
                // Show the correct step
                document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
                document.getElementById(`step${this.currentStep}`).classList.add('active');
                this.updateNavigation();
                this.updateProgress();
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    collectFormData() {
        const data = {
            timestamp: new Date().toISOString(),
            step: this.currentStep
        };

        // Text inputs and selects
        document.querySelectorAll('input[type="text"], input[type="email"], select, textarea').forEach(field => {
            if (field.value && field.id) {
                data[field.id] = field.value;
            }
        });

        // Sliders
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            if (slider.id) {
                data[slider.id] = parseInt(slider.value);
            }
        });

        // Radio buttons
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            data[radio.name] = radio.value;
        });

        // Checkboxes
        const checkboxGroups = {};
        document.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            const group = this.getCheckboxGroup(checkbox);
            if (!checkboxGroups[group]) {
                checkboxGroups[group] = [];
            }
            checkboxGroups[group].push(checkbox.value);
        });
        Object.assign(data, checkboxGroups);

        return data;
    }

    getCheckboxGroup(checkbox) {
        // Determine checkbox group based on ID patterns
        const id = checkbox.id;
        if (id.includes('clutter-')) return 'clutterAreas';
        if (id.includes('challenge-')) return 'challenges';
        if (id.includes('hobby-')) return 'hobbies';
        return 'other';
    }

    populateFormFromData(data) {
        // Text inputs and selects
        Object.keys(data).forEach(key => {
            const field = document.getElementById(key);
            if (field && typeof data[key] === 'string') {
                field.value = data[key];
            }
        });

        // Sliders
        Object.keys(data).forEach(key => {
            const slider = document.querySelector(`input[type="range"]#${key}`);
            if (slider && typeof data[key] === 'number') {
                slider.value = data[key];
                slider.dispatchEvent(new Event('input'));
            }
        });

        // Radio buttons
        Object.keys(data).forEach(key => {
            const radio = document.querySelector(`input[type="radio"][name="${key}"][value="${data[key]}"]`);
            if (radio) {
                radio.checked = true;
                radio.closest('.option-card')?.classList.add('selected');
            }
        });

        // Checkboxes
        ['clutterAreas', 'challenges', 'hobbies'].forEach(group => {
            if (data[group] && Array.isArray(data[group])) {
                data[group].forEach(value => {
                    const checkbox = document.querySelector(`input[type="checkbox"][value="${value}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        checkbox.closest('.checkbox-item')?.classList.add('selected');
                    }
                });
            }
        });
    }

    async completeAssessment() {
        try {
            // Collect final form data
            const finalData = this.collectFormData();
            
            // Generate user profile
            const profile = this.generateUserProfile(finalData);
            
            // Save to local storage
            localStorage.setItem('minimalism_user_profile', JSON.stringify(profile));
            this.userProfile = profile;
            this.updateSidebarProfile();
            
            // Send to API for enhanced recommendations
            const apiResponse = await this.sendToAPI(profile);
            
            // Update profile with API recommendations
            if (apiResponse) {
                profile.apiRecommendations = apiResponse.recommendations;
                profile.phase = apiResponse.phase;
                profile.estimatedTimeframe = apiResponse.estimatedTimeframe;
                localStorage.setItem('minimalism_user_profile', JSON.stringify(profile));
                this.userProfile = profile;
                this.updateSidebarProfile();
            }
            
            // Display profile summary
            this.displayProfileSummary(profile);
            
            // Initialize progress tracking
            this.initializeProgress(profile);
            
            this.showNotification('Assessment completed successfully! Your personalized profile has been created.', 'success');
        } catch (error) {
            console.error('Error completing assessment:', error);
            this.showNotification('Assessment completed locally. Online features may be limited.', 'info');
        }
    }

    generateUserProfile(data) {
        const profile = {
            id: this.generateUserId(),
            name: data.userName || 'Anonymous',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            
            // Basic Info
            age: data.userAge,
            livingSpace: data.livingSpace,
            lifestyle: data.lifestyle,
            
            // Current State
            currentItems: data.currentItems || 500,
            clutterAreas: data.clutterAreas || [],
            
            // Psychology
            motivation: data.motivation,
            decisionStyle: data['decision-style'],
            attachmentLevel: data.attachmentLevel || 5,
            challenges: data.challenges || [],
            
            // Practical
            budget: data.budget,
            timeframe: data.timeframe,
            hobbies: data.hobbies || [],
            workRequirements: data.workRequirements,
            specialConsiderations: data.specialConsiderations,
            
            // Generated insights
            phase: this.determinePhase(data.currentItems),
            targetItems: this.calculateTargetItems(data.currentItems, data.timeframe),
            personalityType: this.determinePersonalityType(data),
            coachingStyle: this.determineCoachingStyle(data)
        };

        return profile;
    }

    determinePhase(itemCount) {
        if (itemCount > 500) return 'initial';
        if (itemCount > 200) return 'reduction';
        if (itemCount > 100) return 'refinement';
        if (itemCount > 50) return 'optimization';
        return 'maintenance';
    }

    calculateTargetItems(currentItems, timeframe) {
        const reductionRates = {
            '3-months': 0.4,  // Aggressive
            '6-months': 0.6,  // Steady
            '1-year': 0.75,   // Gradual
            'flexible': 0.8   // Very gradual
        };
        
        const rate = reductionRates[timeframe] || 0.6;
        return Math.max(50, Math.floor(currentItems * rate));
    }

    determinePersonalityType(data) {
        const types = [];
        
        if (data.attachmentLevel <= 3) types.push('practical');
        if (data.attachmentLevel >= 7) types.push('sentimental');
        
        if (data['decision-style'] === 'analytical') types.push('methodical');
        if (data['decision-style'] === 'intuitive') types.push('intuitive');
        
        if (data.challenges?.includes('perfectionism')) types.push('perfectionist');
        if (data.challenges?.includes('decision-paralysis')) types.push('overthinker');
        
        return types.length > 0 ? types : ['balanced'];
    }

    determineCoachingStyle(data) {
        const styles = [];
        
        if (data.motivation === 'stress-reduction') styles.push('supportive');
        if (data.motivation === 'focus') styles.push('systematic');
        if (data.motivation === 'environmental') styles.push('value-driven');
        
        if (data.challenges?.includes('sentimental-attachment')) styles.push('gentle');
        if (data.timeframe === '3-months') styles.push('intensive');
        
        return styles.length > 0 ? styles[0] : 'balanced';
    }

    async sendToAPI(profile) {
        try {
            const response = await fetch('/api/assessment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentItems: profile.currentItems,
                    lifestyle: profile.lifestyle,
                    motivation: profile.motivation,
                    challenges: profile.challenges,
                    userId: profile.id
                })
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('API call failed:', error);
        }
        return null;
    }

    displayProfileSummary(profile) {
        const summaryElement = document.getElementById('profileSummary');
        
        summaryElement.innerHTML = `
            <h3>Your Minimalism Profile</h3>
            <div class="stat">
                <span><strong>Name:</strong></span>
                <span>${profile.name}</span>
            </div>
            <div class="stat">
                <span><strong>Current Items:</strong></span>
                <span>${profile.currentItems} items</span>
            </div>
            <div class="stat">
                <span><strong>Target Items:</strong></span>
                <span>${profile.targetItems} items</span>
            </div>
            <div class="stat">
                <span><strong>Phase:</strong></span>
                <span>${this.capitalizeFirst(profile.phase)}</span>
            </div>
            <div class="stat">
                <span><strong>Primary Motivation:</strong></span>
                <span>${this.formatMotivation(profile.motivation)}</span>
            </div>
            <div class="stat">
                <span><strong>Coaching Style:</strong></span>
                <span>${this.capitalizeFirst(profile.coachingStyle)}</span>
            </div>
            <div class="stat">
                <span><strong>Timeframe:</strong></span>
                <span>${this.formatTimeframe(profile.timeframe)}</span>
            </div>
        `;
    }

    initializeProgress(profile) {
        const initialProgress = {
            userId: profile.id,
            milestones: [{
                itemCount: profile.currentItems,
                date: new Date().toISOString(),
                milestone: 'Assessment completed',
                notes: 'Starting minimalism journey',
                improvement: 0
            }],
            currentPhase: profile.phase,
            startDate: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            currentItemCount: profile.currentItems,
            targetItemCount: profile.targetItems
        };

        localStorage.setItem('minimalism_progress', JSON.stringify(initialProgress));
    }

    generateUserId() {
        return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    capitalizeFirst(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    getAvatarInitials(name) {
        if (!name) return 'MC';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'MC';
    }

    formatMotivation(motivation) {
        const motivations = {
            'stress-reduction': 'Reduce Stress',
            'financial': 'Save Money',
            'environmental': 'Environmental Impact',
            'freedom': 'Freedom & Flexibility',
            'focus': 'Focus & Clarity',
            'aesthetics': 'Clean Aesthetics'
        };
        return motivations[motivation] || motivation;
    }

    formatTimeframe(timeframe) {
        const timeframes = {
            '3-months': '3 Months (Intensive)',
            '6-months': '6 Months (Steady)',
            '1-year': '1 Year (Gradual)',
            'flexible': 'Flexible Pace'
        };
        return timeframes[timeframe] || timeframe;
    }

    formatTimeframeShort(timeframe) {
        const timeframes = {
            '3-months': '3 mo plan',
            '6-months': '6 mo plan',
            '1-year': '1 yr plan',
            'flexible': 'Flexible'
        };
        return timeframes[timeframe] || 'Flexible';
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'warning' ? '#ff9800' : '#2196f3'};
            color: white;
            border-radius: 5px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
}

// Global functions for HTML onclick handlers
function changeStep(direction) {
    window.assessmentApp.changeStep(direction);
}

// Initialize the assessment when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.assessmentApp = new MinimalismAssessment();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MinimalismAssessment;
}