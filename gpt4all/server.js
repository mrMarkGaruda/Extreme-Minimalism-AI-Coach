import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createCompletionStream, loadModel } from 'gpt4all';
import { MINIMALISM_COACH_PROMPT } from './prompts/minimalism-coach.js';
import { ASSESSMENT_PROMPT } from './prompts/assessment-coach.js';
import { DECISION_SUPPORT_PROMPT } from './prompts/decision-support-coach.js';

const localModelPath = 'orca-mini-3b-gguf2-q4_0.gguf';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware for parsing JSON requests
app.use(express.json());
app.use(express.static('public'));

let model;

// Smart session management for personalized coaching
const userSessions = new Map();
const userProfiles = new Map();
const userProgress = new Map();

const APPROACH_ALIASES = {
    supportive: ['supportive', 'gentle', 'warm', 'empathic'],
    direct: ['direct', 'challenging', 'tough-love', 'firm'],
    question: ['questions', 'question', 'inquiry', 'coaching'],
    logical: ['logical', 'rational', 'analytical', 'evidence']
};

const EMOTION_KEYWORDS = {
    overwhelm: ['overwhelmed', 'stressed', 'anxious', 'burned out', 'burnt out', 'too much', "can't handle", 'exhausted'],
    resistance: ['stuck', 'resistant', "don't want", 'refuse', 'annoyed', 'frustrated'],
    excitement: ['excited', 'motivated', 'energized', 'pumped', 'ready'],
    celebration: ['celebrate', 'proud', 'happy', 'win', 'milestone']
};

const CRISIS_KEYWORDS = ['give up', 'quit', "can't go on", 'done with this', 'hopeless', 'panic', 'breakdown'];

function normalizeApproach(value = '') {
    const lower = String(value || '').toLowerCase();
    for (const [key, aliases] of Object.entries(APPROACH_ALIASES)) {
        if (aliases.some(alias => lower.includes(alias))) {
            return key;
        }
    }
    return 'supportive';
}

function detectEmotionalState(message = '') {
    const lower = String(message || '').toLowerCase();
    const detected = { state: null, directive: null, crisis: false };

    if (CRISIS_KEYWORDS.some(keyword => lower.includes(keyword))) {
        detected.state = 'crisis';
        detected.crisis = true;
        detected.directive = 'User is in crisis or considering quitting. Respond with grounding, validation, and immediate micro-steps. Encourage a short break, breathing exercise, and remind them of previous wins.';
        return detected;
    }

    for (const [state, keywords] of Object.entries(EMOTION_KEYWORDS)) {
        if (keywords.some(keyword => lower.includes(keyword))) {
            detected.state = state;
            switch (state) {
                case 'overwhelm':
                    detected.directive = 'User feels overwhelmed. Slow the pace, validate feelings, and offer one tiny actionable next step.';
                    break;
                case 'resistance':
                    detected.directive = 'User shows resistance. Explore the root gently, acknowledge the challenge, and negotiate a low-friction action.';
                    break;
                case 'excitement':
                    detected.directive = 'User is excited. Celebrate the momentum and channel it into a concrete milestone or stretch goal.';
                    break;
                case 'celebration':
                    detected.directive = 'User is celebrating. Mirror their enthusiasm, highlight progress, and suggest a way to lock in the win.';
                    break;
                default:
                    detected.directive = null;
            }
            return detected;
        }
    }

    return detected;
}

function determineCoachingApproach(message = '', contextObj = {}) {
    const normalizedMode = (contextObj.mode || '').toLowerCase();

    if (normalizedMode === 'assessment') return 'question';
    if (['decision', 'decision_support', 'decision-support'].includes(normalizedMode)) return 'direct';

    const profilePreference = contextObj.profile?.preferredApproach;
    if (profilePreference) return normalizeApproach(profilePreference);

    const computedPreference = contextObj.computed?.preferredApproach;
    if (computedPreference) return normalizeApproach(computedPreference);

    const text = String(message || '').toLowerCase();

    if (text.includes('hold me accountable') || text.includes('push me') || text.includes('challenge')) {
        return 'direct';
    }

    if (/(can you|could you|should i|what should|\?)$/.test(text) || text.includes('?')) {
        return 'question';
    }

    if (text.includes('data') || text.includes('metrics') || text.includes('numbers') || text.includes('plan')) {
        return 'logical';
    }

    if (text.includes('overwhelmed') || text.includes('stress') || text.includes('burned out') || text.includes('tired')) {
        return 'supportive';
    }

    return 'supportive';
}

function getApproachDirective(approach, emotionalState) {
    switch (approach) {
        case 'direct':
            return 'Adopt a firm, accountability-driven tone. Give clear directives, set deadlines, and highlight consequences of inaction.';
        case 'question':
            return 'Use a Socratic coaching style. Ask up to two focused questions before offering a concise recommendation.';
        case 'logical':
            return 'Lean on logical reasoning, data points, and cost-benefit framing. Minimize emotional language unless needed to validate.';
        default:
            return emotionalState === 'resistance'
                ? 'Stay gentle but confident. Normalize setbacks and co-create a very small next action to regain momentum.'
                : 'Lead with empathy and validation. Offer encouragement and break guidance into manageable steps.';
    }
}

function getGenerationSettings(mode, approach, emotionalState, crisis) {
    let temperature = 0.65;
    let maxTokens = 180;
    let topP = 0.9;

    switch ((mode || '').toLowerCase()) {
        case 'assessment':
            temperature = 0.6;
            maxTokens = 220;
            break;
        case 'decision':
        case 'decision_support':
        case 'decision-support':
            temperature = 0.55;
            maxTokens = 170;
            break;
        case 'emergency':
            temperature = 0.5;
            maxTokens = 210;
            break;
        default:
            temperature = 0.63;
            maxTokens = 190;
    }

    if (approach === 'direct') {
        temperature -= 0.05;
        topP = 0.88;
    } else if (approach === 'question') {
        temperature += 0.05;
        topP = 0.92;
    } else if (approach === 'logical') {
        temperature = Math.max(0.5, temperature - 0.08);
        topP = 0.87;
    }

    if (emotionalState === 'overwhelm') {
        temperature = Math.max(0.5, temperature - 0.05);
        maxTokens += 20;
    } else if (emotionalState === 'excitement' || emotionalState === 'celebration') {
        temperature = Math.min(0.75, temperature + 0.05);
    }

    if (crisis) {
        temperature = 0.45;
        topP = 0.85;
        maxTokens = Math.max(maxTokens, 220);
    }

    return {
        temperature: Number(temperature.toFixed(2)),
        max_tokens: Math.round(maxTokens),
        top_p: Number(topP.toFixed(2))
    };
}

// Pre-optimized prompt for lightning-fast responses
const SYSTEM_PROMPT = MINIMALISM_COACH_PROMPT.trim();
const ASSESSMENT_SYSTEM_PROMPT = ASSESSMENT_PROMPT.trim();
const DECISION_SUPPORT_SYSTEM_PROMPT = DECISION_SUPPORT_PROMPT.trim();

function getContextualPrompt(mode, contextObj = {}) {
    const normalized = (mode || '').toLowerCase();
    if (normalized === 'assessment') return ASSESSMENT_SYSTEM_PROMPT;
    if (['decision', 'decision_support', 'decision-support'].includes(normalized)) {
        return DECISION_SUPPORT_SYSTEM_PROMPT;
    }
    return SYSTEM_PROMPT;
}

// Efficient context builder for maintaining conversation flow
function buildOptimizedPrompt(userMessage, contextObj = {}, promptTemplate = SYSTEM_PROMPT) {
    // Clean, direct prompt structure to prevent self-conversation
    let prompt = `${promptTemplate}\n\n`;

    // Add user profile
    if (contextObj.profile || contextObj.computed) {
        const p = contextObj.profile || {};
        const metrics = contextObj.computed?.metrics || {};
        const name = p.name || p.userId || 'Minimalism client';
        const phase = p.phase || contextObj.computed?.phaseLabel || 'unspecified';
        const currentItems = p.currentItems ?? metrics.currentItems ?? 'unknown';
        const targetItems = p.targetItems ?? metrics.targetItems ?? '50';
        const lifestyle = p.lifestyle || contextObj.computed?.lifestyleLabel || 'not provided';
        const motivation = p.motivation || 'clarity and simplicity';
        const challenges = (p.challenges || contextObj.computed?.challenges || []).join(', ');
        prompt += `User Profile: ${name}, Phase: ${phase}, Current Items: ${currentItems}, Target: ${targetItems}, Lifestyle: ${lifestyle}, Motivation: ${motivation}`;
        if (challenges) {
            prompt += `, Challenges: ${challenges}`;
        }
        prompt += '\n';
    }
    // Add progress
    if (contextObj.progress) {
        const pr = contextObj.progress;
        const currentCount = pr.currentItemCount ?? pr.metrics?.currentItems;
        const progressBits = [];
        progressBits.push(`${pr.milestones?.length || 0} milestones tracked`);
        if (pr.currentPhase) progressBits.push(`phase ${pr.currentPhase}`);
        if (currentCount !== undefined) progressBits.push(`current items ${currentCount}`);
        if (pr.lastUpdate) progressBits.push(`last update ${pr.lastUpdate}`);
        prompt += `Progress: ${progressBits.join(', ')}\n`;
    }
    // Add computed summary / metrics
    if (contextObj.computed) {
        const comp = contextObj.computed;
        const metrics = comp.metrics || {};
        const metricParts = [];
        if (typeof comp.improvementPercent === 'number') {
            metricParts.push(`journey completion ${comp.improvementPercent}%`);
        }
        if (metrics.startItems !== undefined) {
            metricParts.push(`started with ${metrics.startItems} items`);
        }
        if (metrics.currentItems !== undefined) {
            metricParts.push(`currently ${metrics.currentItems} items`);
        }
        if (metrics.targetItems !== undefined) {
            metricParts.push(`target ${metrics.targetItems} items`);
        }
        if (metricParts.length > 0) {
            prompt += `Journey Metrics: ${metricParts.join(', ')}\n`;
        }
        if (comp.phaseLabel) {
            prompt += `Dashboard Phase Label: ${comp.phaseLabel}\n`;
        }
    }
    // Add goals
    if (contextObj.goals) {
        prompt += `Goals: ${(contextObj.goals||[]).map(g=>g.text).join('; ')}\n`;
    }
    if (contextObj.approachDirective) {
        prompt += `Preferred Coaching Approach: ${contextObj.approach}. ${contextObj.approachDirective}\n`;
    }
    if (contextObj.emotionDirective) {
        const label = contextObj.emotion || 'emotional context';
        prompt += `Emotional Focus: ${label}. ${contextObj.emotionDirective}\n`;
    }
    if (contextObj.crisis) {
        prompt += 'Crisis Protocol: Offer reassurance, ensure emotional safety, suggest one grounding action, and invite them to reach out for extra support. Avoid overwhelming tasks.\n';
    }
    // Add recent chat
    if (contextObj.recentChat && contextObj.recentChat.length > 0) {
        prompt += 'Recent Conversation: ' + contextObj.recentChat.map(e => `${e.role}: ${e.content.substring(0,80)}`).join(' | ') + '\n';
    }
    if (contextObj.mode) {
        prompt += `Engagement Mode: ${contextObj.mode}\n`;
    }
    // Add session context (last exchange)
    if (contextObj.sessionContext) {
        prompt += `Context: ${contextObj.sessionContext}\n`;
    }

    prompt += `Human: ${userMessage}\n\nRespond as the minimalism coach:`;
    return prompt;
}

// Smart context management - keeps last 2-3 exchanges for speed
function updateSessionContext(sessionKey, userMessage, aiResponse) {
    const session = userSessions.get(sessionKey) || { exchanges: [] };

    const normalize = (value) => {
        if (typeof value === 'string') return value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            if (typeof value.message === 'string') return value.message;
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    };

    const userText = normalize(userMessage).slice(0, 100);
    const aiText = normalize(aiResponse).slice(0, 100);

    // Keep only last 1 exchange for optimal speed and prevent confusion
    session.exchanges = [{ user: userText, ai: aiText }];

    userSessions.set(sessionKey, session);
    
    // Build compact context string - simple format
    return session.exchanges
    .map(ex => `Previous: User asked about ${ex.user}... You advised: ${ex.ai}...`)
        .join(' ');
}

// Load the GPT4All model from the local path

try {
    model = await loadModel(localModelPath);
    console.log('GPT4All Model Loaded from Local Path');
} catch (err) {
    console.error('Error loading GPT4All model:', err);
}

// ===========================================
// REST API ENDPOINTS
// ===========================================

// Enhanced Chat API with context awareness
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId = 'anonymous', context = null, profile, progress, goals, recentChat, computed = null, mode = 'general' } = req.body;
        console.log(`[API] /api/chat called by ${userId}. Message length: ${message ? message.length : 0}`);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!model) {
            return res.status(503).json({ error: 'AI model is not ready. Please try again in a moment.' });
        }

        // Get or create user session
        const sessionKey = userId;
        const session = userSessions.get(sessionKey) || { exchanges: [] };

        const approach = determineCoachingApproach(message, { mode, profile, computed });
        const emotionalSnapshot = detectEmotionalState(message);
        const approachDirective = getApproachDirective(approach, emotionalSnapshot.state);

        // Build context object
        const contextObj = {
            profile,
            progress,
            goals,
            recentChat,
            computed,
            mode,
            approach,
            approachDirective,
            emotion: emotionalSnapshot.state,
            emotionDirective: emotionalSnapshot.directive,
            crisis: emotionalSnapshot.crisis,
            sessionContext: context || (session.exchanges.length > 0 
                ? `Previous: User asked about ${session.exchanges[0].user}... You advised: ${session.exchanges[0].ai}...`
                : '')
        };

        const promptTemplate = getContextualPrompt(mode, contextObj);
        const coachingPrompt = buildOptimizedPrompt(message, contextObj, promptTemplate);
        const generationSettings = getGenerationSettings(mode, approach, emotionalSnapshot.state, emotionalSnapshot.crisis);

        // Generate response with streaming for speed
        const responseStream = createCompletionStream(model, coachingPrompt, {
            ...generationSettings,
            stop: ['\n\nHuman:', '\nUser:', '\nCoach:', 'Human:', 'User:', 'Coach:']
        });

        let fullResponse = '';

        // Collect streaming response
        for await (const chunk of responseStream.tokens) {
            fullResponse += chunk.toString();
        }

        // Clean response
        fullResponse = fullResponse.trim();

        // Update session context
        updateSessionContext(sessionKey, message, fullResponse);

        console.log(`[API] /api/chat response ready. Bytes: ${fullResponse.length}`);
        res.json({
            response: fullResponse,
            userId: sessionKey,
            timestamp: new Date().toISOString(),
            context: contextObj.sessionContext ? 'Used previous context' : 'Fresh conversation'
        });

    } catch (error) {
        console.error('Chat API error:', error);
        res.status(500).json({ 
            error: 'I encountered a technical issue. Let\'s continue your minimalism journey - what would you like to work on?' 
        });
    }
});

// User Assessment API for profiling
app.post('/api/assessment', async (req, res) => {
    try {
        const { currentItems, lifestyle, motivation, challenges, userId = 'anonymous' } = req.body;
        console.log(`[API] /api/assessment by ${userId}. currentItems=${currentItems}`);

        if (!currentItems) {
            return res.status(400).json({ error: 'currentItems count is required' });
        }

        // Determine phase based on current items
        let phase, recommendations = [];
        
        if (currentItems > 500) {
            phase = 'initial';
            recommendations = [
                'Start with obvious duplicates (multiple phone chargers, excess clothing)',
                'Focus on expired or broken items first',
                'Tackle one room at a time to avoid overwhelm'
            ];
        } else if (currentItems > 200) {
            phase = 'reduction';
            recommendations = [
                'Apply the "one year rule" - if unused for a year, consider removing',
                'Look for multi-use alternatives (phone as camera, clock, etc.)',
                'Focus on emotional attachments - address the psychology behind keeping items'
            ];
        } else if (currentItems > 100) {
            phase = 'refinement';
            recommendations = [
                'Evaluate each item\'s frequency of use and emotional value',
                'Consider quality over quantity for remaining items',
                'Start thinking about your ideal 50-item list'
            ];
        } else if (currentItems > 50) {
            phase = 'optimization';
            recommendations = [
                'Make hard choices about sentimental items',
                'Optimize for absolute essentials and joy-bringing items',
                'Create your final 50-item list and stick to it'
            ];
        } else {
            phase = 'maintenance';
            recommendations = [
                'Maintain your 50-item lifestyle with mindful consumption',
                'Share your journey to inspire others',
                'Focus on experiences over possessions'
            ];
        }

        // Create user profile
        const profile = {
            userId,
            currentItems,
            lifestyle: lifestyle || 'standard',
            motivation: motivation || 'simplicity',
            challenges: challenges || [],
            phase,
            assessmentDate: new Date().toISOString(),
            targetItems: phase === 'maintenance' ? 50 : Math.max(50, Math.floor(currentItems * 0.6))
        };

        // Store profile
        userProfiles.set(userId, profile);

        res.json({
            profile,
            recommendations,
            phase,
            nextSteps: recommendations.slice(0, 3),
            estimatedTimeframe: getEstimatedTimeframe(currentItems, phase)
        });

    } catch (error) {
        console.error('Assessment API error:', error);
        res.status(500).json({ error: 'Failed to process assessment' });
    }
});

// Progress Tracking API
app.get('/api/progress/:userId?', (req, res) => {
    try {
        const userId = req.params.userId || 'anonymous';
        console.log(`[API] GET /api/progress for ${userId}`);
        const progress = userProgress.get(userId) || {
            userId,
            milestones: [],
            currentPhase: 'initial',
            startDate: new Date().toISOString(),
            lastUpdate: new Date().toISOString()
        };

        res.json(progress);
    } catch (error) {
        console.error('Progress GET error:', error);
        res.status(500).json({ error: 'Failed to retrieve progress' });
    }
});

app.post('/api/progress', (req, res) => {
    try {
        const { userId = 'anonymous', itemCount, milestone, notes } = req.body;
        console.log(`[API] POST /api/progress by ${userId}. itemCount=${itemCount}`);

        if (!itemCount) {
            return res.status(400).json({ error: 'itemCount is required' });
        }

        // Get existing progress or create new
        const progress = userProgress.get(userId) || {
            userId,
            milestones: [],
            currentPhase: 'initial',
            startDate: new Date().toISOString()
        };

        // Add new milestone
        const newMilestone = {
            itemCount,
            date: new Date().toISOString(),
            milestone: milestone || `Reached ${itemCount} items`,
            notes: notes || '',
            improvement: progress.milestones.length > 0 
                ? progress.milestones[progress.milestones.length - 1].itemCount - itemCount 
                : 0
        };

        progress.milestones.push(newMilestone);
        progress.lastUpdate = new Date().toISOString();
        progress.currentItemCount = itemCount;

        // Update phase based on current item count
        if (itemCount <= 50) progress.currentPhase = 'maintenance';
        else if (itemCount <= 100) progress.currentPhase = 'optimization';
        else if (itemCount <= 200) progress.currentPhase = 'refinement';
        else if (itemCount <= 500) progress.currentPhase = 'reduction';
        else progress.currentPhase = 'initial';

        // Store updated progress
        userProgress.set(userId, progress);

        res.json({
            success: true,
            progress,
            latestMilestone: newMilestone,
            message: `Great progress! You've reduced to ${itemCount} items.`
        });

    } catch (error) {
        console.error('Progress POST error:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// Helper function for timeframe estimation
function getEstimatedTimeframe(currentItems, phase) {
    const timeframes = {
        initial: '2-3 months',
        reduction: '3-4 months', 
        refinement: '2-3 months',
        optimization: '1-2 months',
        maintenance: 'Ongoing'
    };
    return timeframes[phase] || '2-3 months';
}

// ===========================================
// SOCKET.IO REAL-TIME CHAT (Legacy support)
// ===========================================


io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    
    // Initialize session for this client
    userSessions.set(socket.id, { exchanges: [] });
    
    socket.on('chat message', async (msg) => {
        const payload = (msg && typeof msg === 'object') ? msg : { message: msg };
        const {
            message: rawMessage,
            userId = 'anonymous',
            profile = null,
            progress = null,
            goals = [],
            recentChat = [],
            mode = 'general',
            computed = null
        } = payload;

        const messageText = typeof rawMessage === 'string' ? rawMessage : (rawMessage == null ? '' : String(rawMessage));
        const sessionKey = userId || socket.id;

        console.log(`[Socket] chat message from ${socket.id}. Length=${messageText.length} (session=${sessionKey})`);

        if (!messageText) {
            return socket.emit('chat message part', {
                user: 'AI',
                message: 'I need a message to respond to. Please share what you would like to work on.'
            });
        }

        if (!model) {
            return socket.emit('chat message part', { 
                user: 'AI', 
                message: 'Minimalism coach is starting up. Please wait a moment...' 
            });
        }

        try {
            // Broadcast the user's message to other clients (avoid echo to sender)
            socket.broadcast.emit('chat message', { user: 'User', message: messageText });

            if (profile) {
                userProfiles.set(sessionKey, profile);
            }
            if (progress) {
                userProgress.set(sessionKey, progress);
            }

            // Get session context for personalized coaching
            const session = userSessions.get(sessionKey) || userSessions.get(socket.id) || { exchanges: [] };
            userSessions.set(sessionKey, session);

            const contextString = session.exchanges.length > 0 
                ? `Previous: User asked about ${session.exchanges[0].user}... You advised: ${session.exchanges[0].ai}...`
                : '';

            const approach = determineCoachingApproach(messageText, { mode, profile, computed });
            const emotionalSnapshot = detectEmotionalState(messageText);
            const approachDirective = getApproachDirective(approach, emotionalSnapshot.state);

            const contextObj = {
                profile: profile || userProfiles.get(sessionKey) || null,
                progress: progress || userProgress.get(sessionKey) || null,
                goals: Array.isArray(goals) ? goals : [],
                recentChat: Array.isArray(recentChat) ? recentChat : [],
                mode,
                approach,
                approachDirective,
                emotion: emotionalSnapshot.state,
                emotionDirective: emotionalSnapshot.directive,
                crisis: emotionalSnapshot.crisis,
                computed: computed || null,
                sessionContext: contextString
            };

            // Build optimized coaching prompt
            const promptTemplate = getContextualPrompt(mode, contextObj);
            const coachingPrompt = buildOptimizedPrompt(messageText, contextObj, promptTemplate);
            const generationSettings = getGenerationSettings(mode, approach, emotionalSnapshot.state, emotionalSnapshot.crisis);

            // Create streaming response with coaching context
            const responseStream = createCompletionStream(model, coachingPrompt, {
                ...generationSettings,
                stop: ['\n\nHuman:', '\nUser:', '\nCoach:', 'Human:', 'User:', 'Coach:'] // Prevent self-conversation
            });

            let fullResponse = '';

            responseStream.tokens.on("data", (data) => {
                const chunk = data.toString();
                fullResponse += chunk;
                socket.emit('chat message part', { user: 'AI', message: chunk });
            });

            responseStream.tokens.on("end", () => {
                // Update session context for next interaction
                updateSessionContext(sessionKey, messageText, fullResponse);
                socket.emit('chat message end', { user: 'AI' });
                console.log(`[Socket] Completed response to ${socket.id}. Bytes=${fullResponse.length}`);
            });

        } catch (error) {
            console.error('Error in minimalism coaching:', error);
            socket.emit('chat message part', { 
                user: 'AI', 
                message: 'I apologize, but I encountered a technical issue. Let\'s continue your minimalism journey - what would you like to work on?' 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
        // Clean up session to prevent memory leaks
        userSessions.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Extreme Minimalism AI Coach running on port ${PORT}`);
    console.log(`Server started. Coaching sessions ready.`);
});

