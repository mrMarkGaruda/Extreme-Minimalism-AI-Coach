import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { createCompletionStream, loadModel } from 'gpt4all';
import { MINIMALISM_COACH_PROMPT } from './prompts/minimalism-coach.js';
import { ASSESSMENT_PROMPT } from './prompts/assessment-coach.js';
import { DECISION_SUPPORT_PROMPT } from './prompts/decision-support-coach.js';

const localModelPath = 'orca-mini-3b-gguf2-q4_0.gguf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_VAULT_DIR = path.join(DATA_DIR, 'vaults');

const PBKDF2_ITERATIONS = Number(process.env.PBKDF2_ITERATIONS || 120_000);
const KEY_LENGTH = 32;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const MAX_VAULT_SIZE_BYTES = Number(process.env.MAX_VAULT_SIZE_BYTES || 512_000);

const pbkdf2Async = promisify(crypto.pbkdf2);

const JWT_SECRET = process.env.JWT_SECRET || 'replace-me-with-secure-secret';
if (!process.env.JWT_SECRET) {
    console.warn('[Auth] JWT_SECRET not set. Using fallback development secret.');
}

const SESSION_SECRET = process.env.SESSION_SECRET || JWT_SECRET;
const TOKEN_EXPIRATION = process.env.JWT_EXPIRES_IN || '1h';
const TOKEN_AUDIENCE = 'minimalism-app';
const TOKEN_ISSUER = 'extreme-minimalism-ai-coach';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

const DEFAULT_ROLE = 'user';

const revokedTokens = new Map();

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(USER_VAULT_DIR, { recursive: true });

const chatLimiter = rateLimit({
    windowMs: Number(process.env.CHAT_RATE_WINDOW_MS || 60_000),
    max: Number(process.env.CHAT_RATE_LIMIT || 45),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        error: 'Too many requests. Please slow down before sending another message.'
    }
});

async function readUsersFromDisk() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map(user => ({
            ...user,
            role: user.role || DEFAULT_ROLE
        }));
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(USERS_FILE, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

async function writeUsersToDisk(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function removeUserById(userId) {
    const users = await readUsersFromDisk();
    const index = users.findIndex(user => user.id === userId);
    if (index === -1) {
        return null;
    }
    const [removed] = users.splice(index, 1);
    await writeUsersToDisk(users);
    return removed;
}

function sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, encryptionSalt, ...safe } = user;
    safe.role = user.role || DEFAULT_ROLE;
    if (safe.profile && Object.keys(safe.profile).length === 0) {
        delete safe.profile;
    }
    return safe;
}

async function findUserById(userId) {
    const users = await readUsersFromDisk();
    return users.find(user => user.id === userId) || null;
}

async function deriveEncryptionKey(password, saltBase64) {
    if (typeof password !== 'string' || !password) {
        throw new Error('Password is required to derive encryption key');
    }
    const salt = Buffer.from(saltBase64, 'base64');
    if (salt.length === 0) {
        throw new Error('Invalid encryption salt');
    }
    return pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

function createDefaultVault(userId, displayName = '') {
    const now = new Date().toISOString();
    const profile = displayName
        ? {
            userId,
            name: displayName,
            createdAt: now,
            updatedAt: now,
            phase: 'initial',
            motivation: 'simplicity'
        }
        : null;

    return {
        profile,
        progress: {
            userId,
            milestones: [],
            currentPhase: 'initial',
            startDate: now,
            lastUpdate: null,
            currentItemCount: null,
            targetItemCount: 50
        },
        goals: [],
        decisions: [],
        stories: [],
        conversationHistory: []
    };
}

function encryptVault(key, data) {
    const serialized = JSON.stringify(data);
    const payloadSize = Buffer.byteLength(serialized, 'utf8');
    if (payloadSize > MAX_VAULT_SIZE_BYTES) {
        throw new Error(`Vault size ${payloadSize} exceeds limit of ${MAX_VAULT_SIZE_BYTES} bytes`);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(serialized, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return {
        version: 1,
        algorithm: ENCRYPTION_ALGORITHM,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        updatedAt: new Date().toISOString(),
        iterations: PBKDF2_ITERATIONS
    };
}

function decryptVault(key, payload) {
    if (!payload || !payload.ciphertext) {
        return null;
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
}

async function readUserVault(userId) {
    const filePath = path.join(USER_VAULT_DIR, `${userId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function writeUserVault(userId, payload) {
    const filePath = path.join(USER_VAULT_DIR, `${userId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function deleteUserVaultFile(userId) {
    const filePath = path.join(USER_VAULT_DIR, `${userId}.json`);
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function loadVault(userId, key) {
    const encrypted = await readUserVault(userId);
    if (!encrypted) {
        return null;
    }
    return decryptVault(key, encrypted);
}

async function ensureVault(user, key, displayName = '') {
    let vault = null;
    try {
        vault = await loadVault(user.id, key);
    } catch (error) {
        console.warn('[Vault] Failed to decrypt existing vault. Reinitializing.', error.message);
    }

    if (!vault) {
        vault = createDefaultVault(user.id, displayName);
        const encrypted = encryptVault(key, vault);
        await writeUserVault(user.id, encrypted);
    }

    return vault;
}

function getEncryptionKeyFromSession(req) {
    const base64Key = req.session?.encryptionKey;
    if (!base64Key) return null;
    try {
        const key = Buffer.from(base64Key, 'base64');
        return key.length === KEY_LENGTH ? key : null;
    } catch {
        return null;
    }
}

async function saveVaultForUser(userId, key, vault) {
    const encrypted = encryptVault(key, vault);
    await writeUserVault(userId, encrypted);
}

async function loadVaultForRequest(req) {
    const key = getEncryptionKeyFromSession(req);
    if (!key) {
        throw new Error('No encryption key available in session');
    }

    const userId = req.user?.id;
    if (!userId) {
        throw new Error('Authenticated user id not found');
    }

    let vault = null;
    try {
        vault = await loadVault(userId, key);
    } catch (error) {
        console.warn('[Vault] Failed to load vault for request:', error.message);
    }

    if (!vault) {
        vault = createDefaultVault(userId);
        await saveVaultForUser(userId, key, vault);
    }

    return { vault, key };
}

function determineRoleForEmail(email, existingUsersCount) {
    if (ADMIN_EMAILS.includes(email)) {
        return 'admin';
    }
    if (existingUsersCount === 0 && !ADMIN_EMAILS.length) {
        return 'admin';
    }
    return DEFAULT_ROLE;
}

function createJwtToken(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, role: user.role || DEFAULT_ROLE },
        JWT_SECRET,
        {
            expiresIn: TOKEN_EXPIRATION,
            audience: TOKEN_AUDIENCE,
            issuer: TOKEN_ISSUER
        }
    );
}

function pruneRevokedTokens() {
    if (revokedTokens.size === 0) return;
    const now = Date.now();
    for (const [token, expiry] of revokedTokens.entries()) {
        if (expiry <= now) {
            revokedTokens.delete(token);
        }
    }
}

function revokeToken(token) {
    if (!token) return;
    const decoded = jwt.decode(token);
    const expiry = decoded?.exp ? decoded.exp * 1000 : Date.now() + 1000 * 60 * 60;
    revokedTokens.set(token, expiry);
}

function getAuthToken(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    if (req.session?.jwt) {
        return req.session.jwt;
    }
    return null;
}

function authenticateRequest(req, res, next) {
    try {
        const token = getAuthToken(req);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        pruneRevokedTokens();
        if (revokedTokens.has(token)) {
            return res.status(401).json({ error: 'Session has been revoked. Please log in again.' });
        }

        const payload = jwt.verify(token, JWT_SECRET, {
            audience: TOKEN_AUDIENCE,
            issuer: TOKEN_ISSUER
        });

        req.user = { id: payload.sub, email: payload.email, role: payload.role || DEFAULT_ROLE };
        req.token = token;
        return next();
    } catch (error) {
        console.error('[Auth] Authentication failed:', error.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function attachUserIfPresent(req, _res, next) {
    try {
        const token = getAuthToken(req);
        if (!token) {
            return next();
        }

        pruneRevokedTokens();
        if (revokedTokens.has(token)) {
            req.session?.destroy?.(() => {});
            return next();
        }

        const payload = jwt.verify(token, JWT_SECRET, {
            audience: TOKEN_AUDIENCE,
            issuer: TOKEN_ISSUER
        });

        req.user = { id: payload.sub, email: payload.email, role: payload.role || DEFAULT_ROLE };
        req.token = token;
    } catch (error) {
        console.warn('[Auth] Optional authentication skipped:', error.message);
        if (req.session) {
            req.session.jwt = undefined;
            req.session.userId = undefined;
            req.session.userRole = undefined;
        }
    } finally {
        next();
    }
}

function authorizeRoles(...roles) {
    const allowed = roles.map(role => role.toLowerCase());
    return (req, res, next) => {
        const currentRole = (req.user?.role || DEFAULT_ROLE).toLowerCase();
        if (!allowed.includes(currentRole)) {
            return res.status(403).json({ error: 'Insufficient permissions for this action.' });
        }
        return next();
    };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware for parsing JSON requests
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
    name: 'minimalism.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));
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

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name } = req.body || {};
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const trimmedName = typeof name === 'string' ? name.trim() : '';

        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ error: 'A valid email address is required.' });
        }

        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }

        const users = await readUsersFromDisk();
        if (users.some(user => user.email === normalizedEmail)) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const encryptionSalt = crypto.randomBytes(16).toString('base64');
        const encryptionKey = await deriveEncryptionKey(password, encryptionSalt);
        const role = determineRoleForEmail(normalizedEmail, users.length);
        const newUser = {
            id: crypto.randomUUID(),
            email: normalizedEmail,
            passwordHash,
            createdAt: new Date().toISOString(),
            profile: trimmedName ? { name: trimmedName } : {},
            role,
            encryptionSalt
        };

        users.push(newUser);
        await writeUsersToDisk(users);

        const vault = await ensureVault(newUser, encryptionKey, trimmedName);
        if (vault.profile) {
            userProfiles.set(newUser.id, vault.profile);
        }
        if (vault.progress) {
            userProgress.set(newUser.id, vault.progress);
        }

        const token = createJwtToken(newUser);
        req.session.jwt = token;
        req.session.userId = newUser.id;
        req.session.userRole = newUser.role;
        req.session.encryptionKey = encryptionKey.toString('base64');

        res.status(201).json({
            token,
            user: sanitizeUser(newUser),
            vault
        });
    } catch (error) {
        console.error('[Auth] Registration failed:', error);
        res.status(500).json({ error: 'Unable to register user at this time.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!normalizedEmail || typeof password !== 'string') {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const users = await readUsersFromDisk();
        const userIndex = users.findIndex(user => user.email === normalizedEmail);

        if (userIndex === -1) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = users[userIndex];
        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        let { encryptionSalt } = user;
        let userRecordNeedsUpdate = false;
        if (!encryptionSalt) {
            encryptionSalt = crypto.randomBytes(16).toString('base64');
            user.encryptionSalt = encryptionSalt;
            userRecordNeedsUpdate = true;
        }

        const encryptionKey = await deriveEncryptionKey(password, encryptionSalt);
        const vault = await ensureVault(user, encryptionKey, user.profile?.name || '');

        if (vault.profile) {
            userProfiles.set(user.id, vault.profile);
        }
        if (vault.progress) {
            userProgress.set(user.id, vault.progress);
        }

        const updatedUser = {
            ...user,
            lastLoginAt: new Date().toISOString(),
            role: user.role || DEFAULT_ROLE
        };

        users[userIndex] = updatedUser;
        await writeUsersToDisk(users);

        const token = createJwtToken(updatedUser);
        req.session.jwt = token;
        req.session.userId = updatedUser.id;
        req.session.userRole = updatedUser.role;
        req.session.encryptionKey = encryptionKey.toString('base64');

        res.json({
            token,
            user: sanitizeUser(updatedUser),
            vault
        });
    } catch (error) {
        console.error('[Auth] Login failed:', error);
        res.status(500).json({ error: 'Unable to log in at this time.' });
    }
});

app.post('/api/logout', authenticateRequest, (req, res) => {
    const token = req.token || getAuthToken(req);
    revokeToken(token);

    if (!req.session) {
        return res.json({ success: true });
    }

    req.session.userRole = undefined;
    req.session.encryptionKey = undefined;

    req.session.destroy(err => {
        if (err) {
            console.error('[Auth] Session destruction failed:', err);
            return res.status(500).json({ error: 'Unable to log out at this time.' });
        }
        res.clearCookie('minimalism.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });
        return res.json({ success: true });
    });
});

app.get('/api/account/me', authenticateRequest, async (req, res) => {
    try {
        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        const { vault } = await loadVaultForRequest(req);
        res.json({
            user: sanitizeUser(user),
            vault
        });
    } catch (error) {
        console.error('[Account] Failed to load account:', error);
        if (error.message?.includes('encryption key')) {
            return res.status(401).json({ error: 'Please log in again to unlock your account data.' });
        }
        res.status(500).json({ error: 'Unable to load account.' });
    }
});

app.get('/api/account/vault', authenticateRequest, async (req, res) => {
    try {
        const { vault } = await loadVaultForRequest(req);
        res.json({ vault });
    } catch (error) {
        console.error('[Account] Vault retrieval failed:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Unable to load vault data.' });
    }
});

app.put('/api/account/vault', authenticateRequest, async (req, res) => {
    try {
        const payload = req.body?.vault;
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'Vault payload is required.' });
        }

        const { key } = await loadVaultForRequest(req);
        await saveVaultForUser(req.user.id, key, payload);

        if (payload.profile) {
            userProfiles.set(req.user.id, payload.profile);
        } else {
            userProfiles.delete(req.user.id);
        }

        if (payload.progress) {
            userProgress.set(req.user.id, payload.progress);
        } else {
            userProgress.delete(req.user.id);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Account] Vault save failed:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Unable to save vault data.' });
    }
});

app.post('/api/account/export', authenticateRequest, async (req, res) => {
    try {
        const { vault } = await loadVaultForRequest(req);
        const exportPayload = {
            generatedAt: new Date().toISOString(),
            user: sanitizeUser(await findUserById(req.user.id)),
            vault
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="minimalism-export.json"');
        res.send(JSON.stringify(exportPayload, null, 2));
    } catch (error) {
        console.error('[Account] Export failed:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Unable to export data.' });
    }
});

app.delete('/api/account/conversations', authenticateRequest, async (req, res) => {
    try {
        const { vault, key } = await loadVaultForRequest(req);
        vault.conversationHistory = [];
        await saveVaultForUser(req.user.id, key, vault);
        if (vault.progress) {
            userProgress.set(req.user.id, vault.progress);
        } else {
            userProgress.delete(req.user.id);
        }
        userSessions.delete(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[Account] Conversation deletion failed:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Unable to delete conversations.' });
    }
});

app.delete('/api/account', authenticateRequest, async (req, res) => {
    try {
        const { password } = req.body || {};
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password confirmation is required.' });
        }

        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        await deleteUserVaultFile(req.user.id);
        await removeUserById(req.user.id);
        userProfiles.delete(req.user.id);
        userProgress.delete(req.user.id);
        userSessions.delete(req.user.id);
        revokeToken(req.token || getAuthToken(req));

        if (req.session) {
            req.session.userId = undefined;
            req.session.jwt = undefined;
            req.session.userRole = undefined;
            req.session.encryptionKey = undefined;
            req.session.destroy(() => {});
        }

        res.json({ success: true, message: 'Account deleted successfully.' });
    } catch (error) {
        console.error('[Account] Account deletion failed:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Unable to delete account.' });
    }
});

// Enhanced Chat API with context awareness
app.post('/api/chat', chatLimiter, attachUserIfPresent, async (req, res) => {
    try {
    const { message, userId: requestUserId = 'anonymous', context = null, profile, progress, goals, recentChat, computed = null, mode = 'general' } = req.body;
    const resolvedUserId = req.user?.id || requestUserId || 'anonymous';
        const messageText = typeof message === 'string' ? message.trim() : '';
        console.log(`[API] /api/chat called by ${resolvedUserId}. Message length: ${messageText.length}`);

        if (!messageText) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (messageText.length > 2000) {
            return res.status(400).json({ error: 'Message is too long. Please keep requests under 2000 characters.' });
        }

        if (!model) {
            return res.status(503).json({ error: 'AI model is not ready. Please try again in a moment.' });
        }

        // Get or create user session
    const sessionKey = resolvedUserId;
        const session = userSessions.get(sessionKey) || { exchanges: [] };

        const approach = determineCoachingApproach(messageText, { mode, profile, computed });
        const emotionalSnapshot = detectEmotionalState(messageText);
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
    const coachingPrompt = buildOptimizedPrompt(messageText, contextObj, promptTemplate);
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
        updateSessionContext(sessionKey, messageText, fullResponse);

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
app.post('/api/assessment', authenticateRequest, async (req, res) => {
    try {
        const { currentItems, lifestyle, motivation, challenges } = req.body || {};
        const resolvedUserId = req.user.id;
        const parsedCurrentItems = Number(currentItems);
        console.log(`[API] /api/assessment by ${resolvedUserId}. currentItems=${parsedCurrentItems}`);

        if (!Number.isFinite(parsedCurrentItems) || parsedCurrentItems <= 0) {
            return res.status(400).json({ error: 'currentItems must be a positive number.' });
        }

        const challengeList = Array.isArray(challenges)
            ? challenges.slice(0, 10).map(item => String(item).trim()).filter(Boolean)
            : [];

        // Determine phase based on current items
        let phase, recommendations = [];
        
        if (parsedCurrentItems > 500) {
            phase = 'initial';
            recommendations = [
                'Start with obvious duplicates (multiple phone chargers, excess clothing)',
                'Focus on expired or broken items first',
                'Tackle one room at a time to avoid overwhelm'
            ];
        } else if (parsedCurrentItems > 200) {
            phase = 'reduction';
            recommendations = [
                'Apply the "one year rule" - if unused for a year, consider removing',
                'Look for multi-use alternatives (phone as camera, clock, etc.)',
                'Focus on emotional attachments - address the psychology behind keeping items'
            ];
        } else if (parsedCurrentItems > 100) {
            phase = 'refinement';
            recommendations = [
                'Evaluate each item\'s frequency of use and emotional value',
                'Consider quality over quantity for remaining items',
                'Start thinking about your ideal 50-item list'
            ];
        } else if (parsedCurrentItems > 50) {
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
        const now = new Date().toISOString();
        const profile = {
            userId: resolvedUserId,
            currentItems: parsedCurrentItems,
            lifestyle: lifestyle || 'standard',
            motivation: motivation || 'simplicity',
            challenges: challengeList,
            phase,
            assessmentDate: now,
            targetItems: phase === 'maintenance' ? 50 : Math.max(50, Math.floor(parsedCurrentItems * 0.6))
        };

        const { vault, key } = await loadVaultForRequest(req);
        const existingProfile = vault.profile || {};
        vault.profile = {
            ...existingProfile,
            ...profile,
            name: existingProfile.name || profile.name,
            updatedAt: now
        };

        if (!vault.progress || typeof vault.progress !== 'object') {
            vault.progress = {
                userId: resolvedUserId,
                milestones: [],
                currentPhase: phase,
                startDate: now,
                lastUpdate: now,
                currentItemCount: parsedCurrentItems,
                targetItemCount: profile.targetItems
            };
        }

        vault.progress.currentPhase = phase;
        vault.progress.currentItemCount = parsedCurrentItems;
        vault.progress.targetItemCount = profile.targetItems;
        vault.progress.lastUpdate = now;

        await saveVaultForUser(resolvedUserId, key, vault);

        userProfiles.set(resolvedUserId, vault.profile);
        userProgress.set(resolvedUserId, vault.progress);

        res.json({
            profile: vault.profile,
            recommendations,
            phase,
            nextSteps: recommendations.slice(0, 3),
            estimatedTimeframe: getEstimatedTimeframe(parsedCurrentItems, phase)
        });

    } catch (error) {
        console.error('Assessment API error:', error);
        res.status(500).json({ error: 'Failed to process assessment' });
    }
});

// Progress Tracking API
app.get('/api/progress', authenticateRequest, async (req, res) => {
    try {
        console.log(`[API] GET /api/progress for ${req.user.id}`);
        const { vault } = await loadVaultForRequest(req);
        const progress = vault.progress || {
            userId: req.user.id,
            milestones: [],
            currentPhase: 'initial',
            startDate: new Date().toISOString(),
            lastUpdate: null,
            currentItemCount: null,
            targetItemCount: 50
        };

        userProgress.set(req.user.id, progress);
        res.json(progress);
    } catch (error) {
        console.error('Progress GET error:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Failed to retrieve progress' });
    }
});

app.post('/api/progress', authenticateRequest, async (req, res) => {
    try {
        const { itemCount, milestone, notes } = req.body || {};
        const userId = req.user.id;
        const parsedItemCount = Number(itemCount);
        console.log(`[API] POST /api/progress by ${userId}. itemCount=${parsedItemCount}`);

        if (!Number.isFinite(parsedItemCount) || parsedItemCount <= 0) {
            return res.status(400).json({ error: 'itemCount must be a positive number.' });
        }

        const trimmedMilestone = typeof milestone === 'string' ? milestone.trim().slice(0, 160) : '';
        const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 400) : '';

        const { vault, key } = await loadVaultForRequest(req);

        if (!vault.progress || typeof vault.progress !== 'object') {
            vault.progress = {
                userId,
                milestones: [],
                currentPhase: 'initial',
                startDate: new Date().toISOString()
            };
        }

        const previousMilestone = vault.progress.milestones?.[vault.progress.milestones.length - 1];
        const improvement = previousMilestone
            ? previousMilestone.itemCount - parsedItemCount
            : 0;

        const newMilestone = {
            itemCount: parsedItemCount,
            date: new Date().toISOString(),
            milestone: trimmedMilestone || `Reached ${parsedItemCount} items`,
            notes: trimmedNotes,
            improvement
        };

        vault.progress.milestones = Array.isArray(vault.progress.milestones)
            ? [...vault.progress.milestones, newMilestone]
            : [newMilestone];
        vault.progress.lastUpdate = new Date().toISOString();
        vault.progress.currentItemCount = parsedItemCount;

        if (parsedItemCount <= 50) vault.progress.currentPhase = 'maintenance';
        else if (parsedItemCount <= 100) vault.progress.currentPhase = 'optimization';
        else if (parsedItemCount <= 200) vault.progress.currentPhase = 'refinement';
        else if (parsedItemCount <= 500) vault.progress.currentPhase = 'reduction';
        else vault.progress.currentPhase = 'initial';

        if (typeof vault.progress.targetItemCount !== 'number') {
            vault.progress.targetItemCount = 50;
        }

        await saveVaultForUser(userId, key, vault);

        userProgress.set(userId, vault.progress);

        res.json({
            success: true,
            progress: vault.progress,
            latestMilestone: newMilestone,
            message: `Great progress! You've reduced to ${parsedItemCount} items.`
        });

    } catch (error) {
        console.error('Progress POST error:', error);
        const status = error.message?.includes('encryption key') ? 401 : 500;
        res.status(status).json({ error: status === 401 ? 'Re-authentication required.' : 'Failed to update progress' });
    }
});

app.get('/api/admin/progress-summary', authenticateRequest, authorizeRoles('admin'), (_req, res) => {
    const allProgress = Array.from(userProgress.values());
    const totalTrackedUsers = new Set(allProgress.map(p => p.userId)).size;
    const totalMilestones = allProgress.reduce((acc, p) => acc + (p.milestones?.length || 0), 0);
    const totalItemsReduced = allProgress.reduce((acc, p) => {
        const milestones = p.milestones || [];
        if (!milestones.length) return acc;
        return acc + milestones.reduce((sum, entry) => sum + Math.max(0, entry.improvement || 0), 0);
    }, 0);

    const phaseDistribution = allProgress.reduce((distribution, p) => {
        const phase = (p.currentPhase || 'unknown').toLowerCase();
        distribution[phase] = (distribution[phase] || 0) + 1;
        return distribution;
    }, {});

    const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
    const activeUsers = allProgress.filter(p => {
        const lastUpdate = new Date(p.lastUpdate || 0).getTime();
        return !Number.isNaN(lastUpdate) && Date.now() - lastUpdate <= THIRTY_DAYS_MS;
    }).length;

    res.json({
        summary: {
            totalTrackedUsers,
            profileCount: userProfiles.size,
            totalMilestones,
            totalItemsReduced,
            activeUsers,
            phaseDistribution,
            generatedAt: new Date().toISOString()
        }
    });
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

        const messageText = typeof rawMessage === 'string'
            ? rawMessage.trim()
            : (rawMessage == null ? '' : String(rawMessage).trim());
        const sessionKey = userId || socket.id;

        console.log(`[Socket] chat message from ${socket.id}. Length=${messageText.length} (session=${sessionKey})`);

        if (!messageText) {
            return socket.emit('chat message part', {
                user: 'AI',
                message: 'I need a message to respond to. Please share what you would like to work on.'
            });
        }

        if (messageText.length > 2000) {
            return socket.emit('chat message part', {
                user: 'AI',
                message: 'Message is too long. Please keep updates under 2000 characters.'
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

