// Enhanced Minimalism Chat Interface
// Integrates with profiling system and provides context-aware coaching

class EnhancedMinimalismChat {
    constructor() {
        this.socket = io();
        this.userProfile = null;
        this.userProgress = null;
        this.conversationHistory = [];
        this.currentMode = 'general';
        this.isTyping = false;
        this.autoScrollEnabled = true;
        this.nearBottomThreshold = 80; // px
        this.suggestionSets = {
            general: [
                'Help me get started today',
                'How do I set a realistic item target?',
                'What should I declutter first?',
                'Give me a 15‑minute plan',
                'How can I stay motivated?',
                'Tips to reduce impulse buying',
                'Suggest a weekly routine',
                'How do I track progress effectively?'
            ],
            assessment: [
                'Assess my current items',
                'What’s my biggest blocker?',
                'Turn my goals into a plan',
                'Help me define my “enough”',
                'Estimate time to reach target',
                'How do I prioritize rooms?'
            ],
            decision: [
                'Help me decide: keep or donate',
                'How do I handle sentimental items?',
                'Create rules for future purchases',
                'What to do with duplicates?',
                'How do I sell items quickly?'
            ],
            emergency: [
                "I'm feeling completely overwhelmed by all my possessions",
                "I can't decide what to keep and it's causing me anxiety",
                'My family is fighting about the decluttering process',
                'I feel guilty about getting rid of sentimental items',
                "I'm paralyzed and don't know where to start",
                'I’m afraid of regretting my decisions',
                'I feel stuck—give me one tiny step',
                'Remind me why I started'
            ]
        };

        this.cacheDom();
        this.init();
    }

    cacheDom() {
        this.chatForm = document.getElementById('chat-form');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('chat-messages');
        this.emptyState = document.getElementById('emptyState');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.suggestionContainer = document.getElementById('suggestion-container');
        this.suggestionsToggleButton = document.getElementById('suggestions-toggle-button');
        this.modeToggleButton = document.getElementById('modeToggle');
        this.modePanel = document.getElementById('chatModes');
        this.modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
        this.jumpButton = document.getElementById('jumpToLatest');
        this.searchToggleButton = document.getElementById('searchToggle');
        this.closeSearchButton = document.getElementById('closeSearchPanel');
        this.searchPanel = document.getElementById('searchPanel');
        this.searchBackdrop = document.getElementById('searchPanelBackdrop');
        this.searchInput = document.getElementById('searchInput');
        this.searchResultsList = document.getElementById('searchResults');
        this.clearHistoryButton = document.getElementById('clear-history-button');
        this.emergencyButton = document.getElementById('emergencySupport');
        this.userInfoElement = document.getElementById('userInfo');
        this.celebrationBanner = document.getElementById('milestoneCelebration');
        this.celebrationMessage = document.getElementById('celebrationMessage');
    }

    init() {
        this.loadUserData();
        this.setupEventListeners();
        this.setupSocketEvents();
        this.updateUserInterface();
        this.loadConversationHistory();
        this.checkForMilestones();
    }

    loadUserData() {
        try {
            // Load user profile
            const profileData = localStorage.getItem('minimalism_user_profile');
            if (profileData) {
                this.userProfile = JSON.parse(profileData);
            }

            // Load progress data
            const progressData = localStorage.getItem('minimalism_progress');
            if (progressData) {
                this.userProgress = JSON.parse(progressData);
            }

            // Load conversation history
            const historyData = localStorage.getItem('minimalism_conversation_history');
            if (historyData) {
                this.conversationHistory = JSON.parse(historyData);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    setupEventListeners() {
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log('[Chat] Form submitted');
                this.sendMessage();
            });
        }

        if (this.messageInput) {
            const autoresize = () => {
                this.messageInput.style.height = 'auto';
                this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 160) + 'px';
            };

            this.messageInput.addEventListener('input', () => {
                autoresize();
                this.toggleSendAvailability();
            });
            autoresize();

            this.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.chatForm?.requestSubmit();
                }
            });
        }

        if (this.suggestionsToggleButton && this.suggestionContainer) {
            this.suggestionsToggleButton.addEventListener('click', () => {
                const willOpen = !this.suggestionContainer.classList.contains('open');
                this.suggestionContainer.classList.toggle('open', willOpen);
                this.suggestionsToggleButton.setAttribute('aria-expanded', String(willOpen));
                console.log('[UI] Suggestions toggled:', willOpen);
            });

            this.suggestionContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-suggestion]');
                if (!chip) return;
                const text = chip.getAttribute('data-suggestion');
                this.sendQuickMessage(text);
                this.closeSuggestionPanel();
                console.log('[UI] Suggestion used:', text);
            });
        }

        if (this.modeToggleButton && this.modePanel) {
            this.modeToggleButton.addEventListener('click', () => {
                const isHidden = this.modePanel.hasAttribute('hidden');
                if (isHidden) {
                    this.modePanel.removeAttribute('hidden');
                } else {
                    this.modePanel.setAttribute('hidden', '');
                }
                this.modeToggleButton.setAttribute('aria-expanded', String(isHidden));
            });
        }

        this.modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.switchMode(btn.dataset.mode);
                this.modeButtons.forEach(b => b.classList.toggle('active', b === btn));
                this.modeButtons.forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
            });
        });

        if (this.searchToggleButton) {
            this.searchToggleButton.addEventListener('click', () => this.openSearchPanel());
        }
        if (this.closeSearchButton) {
            this.closeSearchButton.addEventListener('click', () => this.closeSearchPanel());
        }
        if (this.searchBackdrop) {
            this.searchBackdrop.addEventListener('click', () => this.closeSearchPanel());
        }

        if (this.clearHistoryButton) {
            this.clearHistoryButton.addEventListener('click', () => {
                const ok = confirm('Clear the entire chat history? This action cannot be undone.');
                if (!ok) return;
                try {
                    localStorage.removeItem('minimalism_conversation_history');
                } catch (e) {
                    console.warn('Failed to clear history from storage', e);
                }
                this.conversationHistory = [];
                this.messagesContainer.innerHTML = '';
                this.addSystemMessage('History cleared. Start fresh with a new message or pick a suggestion.');
                this.scrollMessagesToBottom(true);
                this.showEmptyState();
            });
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchConversations(e.target.value);
            });
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.performSearch(e.target.value);
                }
            });
        }

        if (this.searchResultsList) {
            this.searchResultsList.addEventListener('click', (e) => {
                const result = e.target.closest('[data-search-index]');
                if (!result) return;
                const index = Number(result.getAttribute('data-search-index'));
                this.jumpToSearchResult(index);
            });
        }

        if (this.emergencyButton) {
            this.emergencyButton.addEventListener('click', () => {
                this.activateEmergencySupport();
                this.closeSuggestionPanel();
            });
        }

        window.addEventListener('beforeunload', () => {
            this.saveConversationHistory();
        });

        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('scroll', () => this.updateAutoScrollState());
        }
        window.addEventListener('resize', () => {
            if (this.autoScrollEnabled) this.scrollMessagesToBottom();
        });

        if (this.jumpButton) {
            this.jumpButton.addEventListener('click', () => {
                this.scrollMessagesToBottom(true);
                console.log('[UI] Jump to latest clicked');
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSearchPanel();
                this.closeSuggestionPanel();
                this.hideModesPanel();
            }
        });

        this.renderSuggestions();
        this.toggleSendAvailability();
    }

    toggleSendAvailability() {
        if (!this.sendButton || !this.messageInput) return;
        this.sendButton.disabled = this.messageInput.value.trim().length === 0;
    }

    closeSuggestionPanel() {
        if (!this.suggestionContainer || !this.suggestionsToggleButton) return;
        this.suggestionContainer.classList.remove('open');
        this.suggestionsToggleButton.setAttribute('aria-expanded', 'false');
    }

    hideModesPanel() {
        if (!this.modePanel || !this.modeToggleButton) return;
        this.modePanel.setAttribute('hidden', '');
        this.modeToggleButton.setAttribute('aria-expanded', 'false');
    }

    openSearchPanel() {
        if (!this.searchPanel) return;
        this.searchPanel.setAttribute('aria-hidden', 'false');
        this.searchBackdrop?.removeAttribute('hidden');
        setTimeout(() => this.searchInput?.focus(), 40);
    }

    closeSearchPanel() {
        if (!this.searchPanel) return;
        this.searchPanel.setAttribute('aria-hidden', 'true');
        this.searchBackdrop?.setAttribute('hidden', '');
    }

    updateAutoScrollState() {
        if (!this.messagesContainer) return;
        const distanceFromBottom = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop - this.messagesContainer.clientHeight;
        this.autoScrollEnabled = distanceFromBottom < this.nearBottomThreshold;
        if (this.jumpButton) {
            this.jumpButton.style.display = this.autoScrollEnabled ? 'none' : 'inline-flex';
        }
    }

    hideEmptyState() {
        if (this.emptyState) {
            this.emptyState.setAttribute('hidden', '');
        }
    }

    showEmptyState() {
        if (this.emptyState && this.messagesContainer?.children.length === 0) {
            this.emptyState.removeAttribute('hidden');
        }
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to minimalism coach');
            this.addSystemMessage('Your minimalism coach is ready to help.');
            
            // Send initial context if user has profile
            if (this.userProfile) {
                this.sendInitialContext();
            }
        });

        this.socket.on('chat message', (data) => {
            this.addMessage(data.user, data.message, false);
        });

        this.socket.on('chat message part', (data) => {
            this.setTypingIndicator(true);
            this.addMessagePart(data.user, data.message);
        });

        this.socket.on('chat message end', (data) => {
            this.finalizeMessage(data.user);
            this.setTypingIndicator(false);
        });

        this.socket.on('disconnect', () => {
            this.addSystemMessage('Connection lost. Trying to reconnect...');
        });
    }

    updateUserInterface() {
        if (!this.userInfoElement) return;

        if (this.userProfile) {
            const lifestyle = this.userProfile.lifestyle || 'Lifestyle TBD';
            this.userInfoElement.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">${this.getAvatarEmoji()}</div>
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
                        <span class="progress-label">Journey Progress</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-number">${this.formatTimeframeShort(this.userProfile.timeframe)}</span>
                        <span class="progress-label">Timeline</span>
                    </div>
                </div>
            `;
        } else {
            this.userInfoElement.innerHTML = `
                <div class="user-profile">
                    <div class="user-profile__avatar">MC</div>
                    <div class="user-profile__details">
                        <h3>Welcome to Minimalism Coaching</h3>
                        <p>Complete your assessment to unlock tailored plans and accountability.</p>
                    </div>
                </div>
                <a class="link-pill" href="assessment.html">Start assessment</a>
            `;
        }
    }

    getCurrentItemCount() {
        if (this.userProgress && this.userProgress.milestones.length > 0) {
            return this.userProgress.milestones[this.userProgress.milestones.length - 1].itemCount;
        }
        return this.userProfile?.currentItems || '---';
    }

    getImprovementPercentage() {
        if (!this.userProfile) return 0;
        
        const startItems = this.userProfile.currentItems;
        const currentItems = this.getCurrentItemCount();
        const targetItems = this.userProfile.targetItems || 50;
        
        if (currentItems === '---') return 0;
        
        const totalReduction = startItems - targetItems;
        if (!Number.isFinite(totalReduction) || totalReduction <= 0) return 0;
        if (typeof currentItems !== 'number') return 0;
        const currentReduction = startItems - currentItems;
        const percentage = (currentReduction / totalReduction) * 100;
        return Math.max(0, Math.min(100, Math.round(percentage)));
    }

    getAvatarEmoji() {
        // No emoji, just use initials or a generic icon
        if (!this.userProfile) return 'MC';
        const name = this.userProfile.name || '';
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
        return initials || 'MC';
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        if (this.modeButtons && this.modeButtons.length) {
            this.modeButtons.forEach((btn) => {
                const isActive = btn.dataset.mode === mode;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }
        
        // Add context message
        this.addModeContext(mode);

        // Refresh suggestions for the new mode
        this.renderSuggestions();
    }

    addModeContext(mode) {
        const contexts = {
            general: 'Ready for general minimalism coaching and guidance.',
            assessment: 'Assessment mode: I\'ll help you evaluate your current situation and plan next steps.',
            decision: 'Decision support mode: I\'ll help you decide what to keep, donate, or discard.',
            emergency: 'Emergency support mode: I\'m here to provide immediate emotional support and practical help.'
        };
        
        this.addContextMessage(contexts[mode]);
    }

    addContextMessage(message) {
        const contextDiv = document.createElement('div');
        contextDiv.className = 'conversation-context';
        contextDiv.textContent = message;

        if (this.messagesContainer) {
            this.hideEmptyState();
            this.messagesContainer.appendChild(contextDiv);
            this.afterMessageAppended();
        }
    }

    async sendMessage() {
        const message = this.messageInput?.value.trim();
        
        if (!message) return;
        
        // Clear input
        if (this.messageInput) {
            this.messageInput.value = '';
            this.messageInput.style.height = 'auto';
        }
        this.toggleSendAvailability();
        
        // Add user message to UI
        this.addMessage('User', message, true);
        // Persist immediately so refreshes keep the message
        this.addToHistory('user', message);
        // Immediate feedback: show typing indicator instantly
        this.setTypingIndicator(true);
        console.log('[Chat] Message sent, awaiting response...');
        
        // Build enhanced context
        const enhancedContext = this.buildEnhancedContext(message);
        
        try {
            // Prefer real-time streaming via Socket.IO if connected
            if (this.socket && this.socket.connected) {
                console.log('[Chat] Using Socket.IO streaming');
                this.socket.emit('chat message', message);
            } else {
                // Fallback to REST API
                console.log('[Chat] Socket not connected, using REST API');
                const payload = {
                    message: message,
                    userId: this.userProfile?.id || 'anonymous',
                    context: enhancedContext,
                    mode: this.currentMode,
                    profile: this.userProfile,
                    progress: this.userProgress,
                    goals: this.getGoals?.() || [],
                    recentChat: this.conversationHistory.slice(-8)
                };
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();
                    await this.addTypewriterMessage('AI Coach', data.response);
                    this.setTypingIndicator(false);
                    console.log('[Chat] AI response received (REST)');
                } else {
                    console.warn('[Chat] REST failed, falling back to Socket.IO');
                    this.socket.emit('chat message', message);
                }
            }
        } catch (error) {
            console.error('[Chat] Error sending message, using Socket.IO fallback:', error);
            this.socket.emit('chat message', message);
        }
        
        // Check for progress updates
        this.checkForProgressUpdates(message);
    }

    async addTypewriterMessage(user, fullText) {
        return new Promise((resolve) => {
            if (!this.messagesContainer) {
                resolve();
                return;
            }

            this.hideEmptyState();

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ai-message streaming';
            const timestamp = new Date().toLocaleTimeString();
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-user">${user}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-content"></div>
            `;
            const contentDiv = messageDiv.querySelector('.message-content');
            this.messagesContainer.appendChild(messageDiv);
            this.afterMessageAppended();

            const words = String(fullText).split(/(\s+)/); // keep spaces
            let i = 0;

            const step = () => {
                const chunkSize = 3;
                let appended = '';
                for (let c = 0; c < chunkSize && i < words.length; c++, i++) {
                    appended += words[i];
                }
                contentDiv.textContent += appended;
                this.scrollMessagesToBottom(false);

                if (i < words.length) {
                    setTimeout(step, 15);
                } else {
                    messageDiv.classList.remove('streaming');
                    messageDiv.classList.add('complete');
                    contentDiv.innerHTML = this.formatMessage(contentDiv.textContent);
                    this.addToHistory('assistant', contentDiv.textContent);
                    this.afterMessageAppended();
                    resolve();
                }
            };

            step();
        });
    }

    sendQuickMessage(message) {
        if (!this.messageInput) return;
        this.messageInput.value = message;
        this.toggleSendAvailability();
        this.sendMessage();
    }

    buildEnhancedContext(message) {
        let context = '';
        
        // Add user profile context
        if (this.userProfile) {
            context += `User Profile: ${this.userProfile.name}, ${this.userProfile.phase} phase, `;
            context += `${this.getCurrentItemCount()} current items, target: ${this.userProfile.targetItems}. `;
            context += `Motivation: ${this.userProfile.motivation}. `;
            
            if (this.userProfile.challenges && this.userProfile.challenges.length > 0) {
                context += `Main challenges: ${this.userProfile.challenges.join(', ')}. `;
            }
        }
        
        // Add current mode context
        context += `Current mode: ${this.currentMode}. `;
        
        // Add recent conversation context
        if (this.conversationHistory.length > 0) {
            const recentMessages = this.conversationHistory.slice(-3);
            context += 'Recent conversation: ';
            recentMessages.forEach(msg => {
                context += `${msg.role}: "${msg.content.substring(0, 100)}..." `;
            });
        }
        
        return context;
    }

    addMessage(user, message, isUser) {
        if (!this.messagesContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        const timestamp = new Date().toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-user">${user}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            <div class="message-content">${this.formatMessage(message)}</div>
        `;
        
        this.hideEmptyState();
        this.messagesContainer.appendChild(messageDiv);
        this.afterMessageAppended();
        
        // Save to conversation history
        if (!isUser && !this.isReplayingHistory) {
            this.addToHistory('assistant', message);
        }
    }

    addSystemMessage(message) {
        if (!this.messagesContainer) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.textContent = message;
        this.hideEmptyState();
        this.messagesContainer.appendChild(messageDiv);
        this.afterMessageAppended();
    }

    addMessagePart(user, messagePart) {
        if (!this.messagesContainer) return;
        let lastMessage = this.messagesContainer.lastElementChild;
        
        // Create new message if needed
        if (!lastMessage || !lastMessage.classList.contains('ai-message') || lastMessage.classList.contains('complete')) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ai-message streaming';
            
            const timestamp = new Date().toLocaleTimeString();
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-user">${user}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-content">${messagePart}</div>
            `;
            
            this.hideEmptyState();
            this.messagesContainer.appendChild(messageDiv);
            lastMessage = messageDiv;
        } else {
            // Append to existing message
            const contentDiv = lastMessage.querySelector('.message-content');
            contentDiv.textContent += messagePart;
        }
        
        this.afterMessageAppended();
    }

    finalizeMessage(user) {
        if (!this.messagesContainer) return;
        const lastMessage = this.messagesContainer.lastElementChild;
        
        if (lastMessage && lastMessage.classList.contains('streaming')) {
            lastMessage.classList.remove('streaming');
            lastMessage.classList.add('complete');
            
            // Format the final message
            const contentDiv = lastMessage.querySelector('.message-content');
            contentDiv.innerHTML = this.formatMessage(contentDiv.textContent);
            
            // Save to conversation history
            this.addToHistory('assistant', contentDiv.textContent);
            this.afterMessageAppended();
        }
    }

    formatMessage(message) {
        // Simple formatting for better readability
        return message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/(\d+\.)/g, '<br>$1');
    }

    addToHistory(role, content) {
        const entry = {
            role: role,
            content: content,
            timestamp: new Date().toISOString(),
            mode: this.currentMode
        };
        
        this.conversationHistory.push(entry);
        
        // Keep only last 50 messages
        if (this.conversationHistory.length > 50) {
            this.conversationHistory = this.conversationHistory.slice(-50);
        }
        
        this.saveConversationHistory();
    }

    saveConversationHistory() {
        localStorage.setItem('minimalism_conversation_history', JSON.stringify(this.conversationHistory));
    }

    loadConversationHistory() {
        if (this.conversationHistory.length === 0) {
            this.showEmptyState();
            return;
        }
        
        // Load last messages to provide context (show more for continuity)
        const recentMessages = this.conversationHistory.slice(-20);
        this.isReplayingHistory = true;
        
        recentMessages.forEach(entry => {
            const isUser = entry.role === 'user';
            const user = isUser ? 'User' : 'AI Coach';
            this.addMessage(user, entry.content, isUser);
        });
        this.isReplayingHistory = false;
        // Ensure we start at bottom
        this.scrollMessagesToBottom(true);
    }

    searchConversations(query) {
        if (!this.searchResultsList) return;
        const trimmed = (query || '').trim();

        if (!trimmed || trimmed.length < 2) {
            this.searchResultsList.innerHTML = '<p class="search-empty">Type at least two characters to search your conversation.</p>';
            this._searchState = { query: '', index: -1, matches: [] };
            return;
        }

        const normalized = trimmed.toLowerCase();
        const matches = this.conversationHistory
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.content.toLowerCase().includes(normalized));

        this._searchState = { query: trimmed, index: -1, matches };

        if (matches.length === 0) {
            this.searchResultsList.innerHTML = `<p class="search-empty">No messages found containing “${trimmed}”.</p>`;
            return;
        }

        const maxItems = 25;
        const startIndex = Math.max(0, matches.length - maxItems);
        const visibleMatches = matches.slice(startIndex);

        this.searchResultsList.innerHTML = visibleMatches.map((match, offset) => {
            const globalIndex = startIndex + offset;
            const snippet = match.entry.content.replace(/\s+/g, ' ').trim().slice(0, 140);
            const roleLabel = match.entry.role === 'user' ? 'You' : 'Coach';
            return `
                <button type="button" class="search-result" data-search-index="${globalIndex}">
                    <span class="search-result__meta">${roleLabel} • ${this.formatRelativeTime(match.entry.timestamp)}</span>
                    <span class="search-result__snippet">${this.highlightSnippet(snippet, trimmed)}</span>
                </button>
            `;
        }).join('');

        console.log(`[Search] ${matches.length} matches for "${trimmed}"`);
    }

    performSearch(query) {
        const trimmed = (query || '').trim();
        if (!trimmed || trimmed.length < 2) return;
        if (!this._searchState || this._searchState.query !== trimmed) {
            this.searchConversations(trimmed);
        }

        if (!this._searchState || this._searchState.matches.length === 0) {
            this.addSystemMessage(`No messages found mentioning “${trimmed}”.`);
            return;
        }

        this._searchState.index = (this._searchState.index + 1) % this._searchState.matches.length;
        this.jumpToSearchResult(this._searchState.index);
    }

    jumpToSearchResult(matchIndex) {
        if (!this._searchState || !this.messagesContainer) return;
        const match = this._searchState.matches[matchIndex];
        if (!match) return;

        this._searchState.index = matchIndex;

        const targetContent = match.entry.content;
        const bubbles = Array.from(this.messagesContainer.querySelectorAll('.message'));
        const found = bubbles.find(bubble => bubble.textContent.includes(targetContent.substring(0, 80)));

        if (found) {
            found.scrollIntoView({ behavior: 'smooth', block: 'center' });
            found.classList.add('highlighted');
            setTimeout(() => found.classList.remove('highlighted'), 2000);
            console.log('[Search] Jumped to match', matchIndex + 1, 'of', this._searchState.matches.length);
        } else {
            console.log('[Search] Could not locate DOM bubble for match');
        }
    }

    activateEmergencySupport() {
        this.switchMode('emergency');
        this.addSystemMessage('Emergency support activated. Choose your situation or type your own:');
        this.renderSuggestions();
        this.hideModesPanel();
    }

    checkForProgressUpdates(message) {
        // Check if user is reporting progress
        const progressKeywords = ['reduced to', 'now have', 'down to', 'items', 'decluttered', 'donated'];
        const hasProgressKeyword = progressKeywords.some(keyword => 
            message.toLowerCase().includes(keyword)
        );
        
        if (hasProgressKeyword) {
            // Try to extract item count
            const numbers = message.match(/\d+/g);
            if (numbers) {
                const potentialItemCount = parseInt(numbers[numbers.length - 1]);
                if (potentialItemCount > 0 && potentialItemCount < 3000) {
                    this.suggestProgressUpdate(potentialItemCount);
                }
            }
        }
    }

    renderSuggestions() {
        if (!this.suggestionContainer) return;
        const set = this.suggestionSets[this.currentMode] || this.suggestionSets.general;
        // Limit to 6–8 chips depending on mode
        const max = this.currentMode === 'general' ? 8 : 6;
        const items = set.slice(0, max);
        this.suggestionContainer.innerHTML = items.map(text => (
            `<button class="suggestion-chip" data-suggestion="${this.escapeAttr(text)}">
                <span class="dot"></span><span>${this.escapeHtml(text)}</span>
            </button>`
        )).join('');
        if (this.suggestionContainer.classList.contains('open') && items.length === 0) {
            this.closeSuggestionPanel();
        }
    }

    escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeAttr(s) { return this.escapeHtml(s); }

    formatRelativeTime(timestamp) {
        if (!timestamp) return 'Moments ago';
        const then = new Date(timestamp);
        const now = new Date();
        const diffMs = now - then;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        if (Number.isNaN(diffMinutes) || diffMinutes < 1) return 'Moments ago';
        if (diffMinutes < 60) return `${diffMinutes} min ago`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        return then.toLocaleDateString();
    }

    highlightSnippet(snippet, query) {
        if (!query) return this.escapeHtml(snippet);
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'ig');
        return this.escapeHtml(snippet).replace(regex, '<mark>$1</mark>');
    }

    formatTimeframeShort(timeframe) {
        const map = {
            '3-months': '3 mo plan',
            '6-months': '6 mo plan',
            '1-year': '1 yr plan',
            'flexible': 'Flexible'
        };
        return map[timeframe] || 'Flexible';
    }

    suggestProgressUpdate(itemCount) {
        setTimeout(() => {
            this.addContextMessage(`It sounds like you've made progress! Would you like me to update your item count to ${itemCount}? Type "yes" to confirm.`);
        }, 2000);
    }

    async checkForMilestones() {
        if (!this.userProgress) return;
        
        const currentItems = this.getCurrentItemCount();
        const startItems = this.userProfile?.currentItems || 1000;
        
        // Check for milestone achievements
        const milestones = [500, 300, 200, 100, 75, 50];
        
        milestones.forEach(milestone => {
            if (currentItems <= milestone && startItems > milestone) {
                const hasAchieved = this.userProgress.milestones.some(m => 
                    m.milestone && m.milestone.includes(milestone.toString())
                );
                
                if (!hasAchieved) {
                    this.celebrateMilestone(milestone);
                }
            }
        });
    }

    celebrateMilestone(milestone) {
        if (!this.celebrationBanner || !this.celebrationMessage) return;

        this.celebrationMessage.textContent = `Congratulations! You've reached ${milestone} items!`;
        this.celebrationBanner.removeAttribute('hidden');

        setTimeout(() => {
            this.closeCelebration();
        }, 5000);
    }

    closeCelebration() {
        if (!this.celebrationBanner) return;
        this.celebrationBanner.setAttribute('hidden', '');
    }

    sendInitialContext() {
        if (!this.userProfile) return;
        
        const context = `User ${this.userProfile.name} has returned. Phase: ${this.userProfile.phase}, `;
        context += `Current items: ${this.getCurrentItemCount()}, Target: ${this.userProfile.targetItems}.`;
        
        // Send context without displaying it
        this.socket.emit('user_context', context);
    }

    capitalizeFirst(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }
    
    setTypingIndicator(visible) {
        if (!this.typingIndicator) return;
        this.typingIndicator.style.display = visible ? 'flex' : 'none';
        this.typingIndicator.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    
    // Helpers for scroll behavior
    scrollMessagesToBottom(force = false) {
        if (!this.messagesContainer) return;
        if (force || this.autoScrollEnabled) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
        if (this.jumpButton) this.jumpButton.style.display = 'none';
        this.autoScrollEnabled = true;
    }

    afterMessageAppended() {
        if (this.messageInput) {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 160) + 'px';
        }
        this.scrollMessagesToBottom(false);
        this.updateAutoScrollState();
    }
}

// Global functions
function closeCelebration() {
    window.chatApp.closeCelebration();
}

// Initialize the enhanced chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new EnhancedMinimalismChat();
});