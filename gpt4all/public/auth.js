(function () {
    const state = {
        token: sessionStorage.getItem('minimalism_auth_token') || null,
        user: null,
        vault: null,
        ready: false,
        listeners: []
    };

    let overlayElement = null;
    let overlayMessage = null;
    let loginForm = null;
    let registerForm = null;
    let loginSubmit = null;
    let registerSubmit = null;
    let toggleButtons = null;
    let activeView = 'login';

    const deepClone = (value) => {
        if (value == null) return value;
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (error) {
                console.warn('[Auth] structuredClone failed, falling back to JSON clone', error);
            }
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            console.warn('[Auth] JSON clone failed', error);
            return value;
        }
    };

    const dispatch = (eventName, detail) => {
        document.dispatchEvent(new CustomEvent(eventName, { detail }));
    };

    const setToken = (token) => {
        state.token = token || null;
        if (token) {
            sessionStorage.setItem('minimalism_auth_token', token);
        } else {
            sessionStorage.removeItem('minimalism_auth_token');
        }
    };

    const showOverlay = (message) => {
        if (!overlayElement) return;
        overlayElement.removeAttribute('hidden');
        overlayElement.setAttribute('aria-hidden', 'false');
        document.body.classList.add('account-overlay-open');
        if (message && overlayMessage) {
            overlayMessage.textContent = message;
            overlayMessage.removeAttribute('hidden');
        } else if (overlayMessage) {
            overlayMessage.setAttribute('hidden', '');
        }
    };

    const hideOverlay = () => {
        if (!overlayElement) return;
        overlayElement.setAttribute('hidden', '');
        overlayElement.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('account-overlay-open');
    };

    const setOverlayStatus = (type, message) => {
        if (!overlayMessage) return;
        overlayMessage.textContent = message;
        overlayMessage.dataset.type = type || 'info';
        if (message) {
            overlayMessage.removeAttribute('hidden');
        } else {
            overlayMessage.setAttribute('hidden', '');
        }
    };

    const toggleView = (view) => {
        if (activeView === view) return;
        activeView = view;
        if (!toggleButtons) return;
        toggleButtons.forEach((button) => {
            const targetView = button.getAttribute('data-view');
            const isActive = targetView === view;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        if (loginForm && registerForm) {
            loginForm.classList.toggle('account-form--active', view === 'login');
            registerForm.classList.toggle('account-form--active', view === 'register');
        }
    };

    const createOverlay = () => {
        overlayElement = document.createElement('div');
        overlayElement.id = 'accountOverlay';
        overlayElement.className = 'account-overlay';
        overlayElement.setAttribute('hidden', '');
        overlayElement.setAttribute('aria-hidden', 'true');
        overlayElement.innerHTML = `
            <div class="account-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="accountOverlayTitle">
                <header class="account-overlay__header">
                    <div>
                        <h1 id="accountOverlayTitle">Secure your journey</h1>
                        <p>Unlock your encrypted minimalism vault to continue.</p>
                    </div>
                    <div class="account-overlay__toggle" role="tablist">
                        <button type="button" class="account-overlay__toggle-btn active" data-view="login" aria-pressed="true">Log in</button>
                        <button type="button" class="account-overlay__toggle-btn" data-view="register" aria-pressed="false">Create account</button>
                    </div>
                </header>
                <div class="account-overlay__message" hidden></div>
                <section class="account-overlay__body">
                    <form id="loginForm" class="account-form account-form--active" autocomplete="on">
                        <fieldset>
                            <legend class="sr-only">Log in to your account</legend>
                            <label for="loginEmail">Email</label>
                            <input id="loginEmail" type="email" name="email" autocomplete="email" required />
                            <label for="loginPassword">Password</label>
                            <input id="loginPassword" type="password" name="password" autocomplete="current-password" required minlength="8" />
                            <p class="account-form__hint">Your password unlocks your encrypted coaching data.</p>
                        </fieldset>
                        <button type="submit" class="primary-button" id="loginSubmit">Log in</button>
                    </form>
                    <form id="registerForm" class="account-form" autocomplete="on">
                        <fieldset>
                            <legend class="sr-only">Create a new account</legend>
                            <label for="registerName">Preferred name</label>
                            <input id="registerName" type="text" name="name" autocomplete="name" placeholder="e.g., Sam" />
                            <label for="registerEmail">Email</label>
                            <input id="registerEmail" type="email" name="email" autocomplete="email" required />
                            <label for="registerPassword">Create password</label>
                            <input id="registerPassword" type="password" name="password" autocomplete="new-password" required minlength="8" />
                            <p class="account-form__hint">This password is used to encrypt and decrypt your vault locally. Only you can unlock it.</p>
                        </fieldset>
                        <button type="submit" class="primary-button" id="registerSubmit">Create & unlock</button>
                    </form>
                </section>
            </div>
        `;
        document.body.appendChild(overlayElement);

        overlayMessage = overlayElement.querySelector('.account-overlay__message');
        loginForm = overlayElement.querySelector('#loginForm');
        registerForm = overlayElement.querySelector('#registerForm');
        loginSubmit = overlayElement.querySelector('#loginSubmit');
        registerSubmit = overlayElement.querySelector('#registerSubmit');
        toggleButtons = Array.from(overlayElement.querySelectorAll('.account-overlay__toggle-btn'));

        toggleButtons.forEach((button) => {
            button.addEventListener('click', () => toggleView(button.getAttribute('data-view')));
        });

        loginForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(loginForm);
            await authenticate('login', formData);
        });

        registerForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(registerForm);
            await authenticate('register', formData);
        });
    };

    const defaultVault = () => ({
        profile: null,
        progress: {
            userId: state.user?.id || null,
            milestones: [],
            currentPhase: 'initial',
            startDate: new Date().toISOString(),
            lastUpdate: null,
            currentItemCount: null,
            targetItemCount: 50
        },
        goals: [],
        decisions: [],
        stories: [],
        conversationHistory: []
    });

    const persistState = (payload) => {
        if (payload?.token) {
            setToken(payload.token);
        }
        state.user = payload?.user || null;
        state.vault = payload?.vault ? deepClone(payload.vault) : defaultVault();
        state.ready = true;
        hideOverlay();
        dispatch('auth:changed', { user: deepClone(state.user) });
        dispatch('vault:updated', { vault: deepClone(state.vault) });
        flushListeners();
    };

    const handleUnauthenticated = (message) => {
        setToken(null);
        state.user = null;
        state.vault = null;
        showOverlay(message || 'Session expired. Please log in again to unlock your data.');
        dispatch('auth:changed', { user: null });
    };

    const apiFetch = async (url, options = {}) => {
        const config = { ...options };
        config.credentials = 'same-origin';
        config.headers = new Headers(options.headers || {});
        if (state.token && !config.headers.has('Authorization')) {
            config.headers.set('Authorization', `Bearer ${state.token}`);
        }
        if (config.body && !config.headers.has('Content-Type')) {
            config.headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(url, config);
        if (response.status === 401) {
            handleUnauthenticated();
            throw new Error('Not authenticated');
        }
        return response;
    };

    const authenticate = async (mode, formData) => {
        try {
            if (mode === 'login' && loginSubmit) loginSubmit.disabled = true;
            if (mode === 'register' && registerSubmit) registerSubmit.disabled = true;
            setOverlayStatus('info', mode === 'login' ? 'Unlocking your vault…' : 'Creating and securing your vault…');

            const payload = {
                email: String(formData.get('email') || '').trim().toLowerCase(),
                password: String(formData.get('password') || '')
            };

            if (mode === 'register') {
                payload.name = String(formData.get('name') || '').trim();
            }

            const endpoint = mode === 'login' ? '/api/login' : '/api/register';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Unable to authenticate.');
            }

            persistState(data);
            setOverlayStatus('success', 'Vault unlocked. Enjoy your minimalism journey.');
        } catch (error) {
            console.error('[Auth] Authentication failed:', error);
            const message = error?.message || 'Unable to authenticate. Please try again.';
            setOverlayStatus('error', message);
            showOverlay(message);
        } finally {
            if (mode === 'login' && loginSubmit) loginSubmit.disabled = false;
            if (mode === 'register' && registerSubmit) registerSubmit.disabled = false;
        }
    };

    const refreshAccount = async () => {
        try {
            const response = await apiFetch('/api/account/me');
            if (!response.ok) {
                if (response.status === 401) {
                    handleUnauthenticated();
                    return;
                }
                throw new Error('Unable to retrieve account.');
            }
            const data = await response.json();
            persistState(data);
        } catch (error) {
            console.warn('[Auth] Unable to refresh account:', error);
            handleUnauthenticated('Log in to continue.');
        }
    };

    const flushListeners = () => {
        if (!state.user) return;
        const snapshot = {
            user: deepClone(state.user),
            vault: deepClone(state.vault)
        };
        while (state.listeners.length) {
            const listener = state.listeners.shift();
            try {
                listener(snapshot);
            } catch (error) {
                console.error('[Auth] Listener failed:', error);
            }
        }
    };

    const ensureReady = (callback) => {
        if (state.ready && state.user) {
            callback({ user: deepClone(state.user), vault: deepClone(state.vault) });
            return;
        }
        state.listeners.push(callback);
        showOverlay();
    };

    const updateVault = async (mutator, options = {}) => {
        if (!state.user) {
            throw new Error('User not authenticated.');
        }
        const working = deepClone(state.vault || defaultVault());
        let updated = working;
        if (typeof mutator === 'function') {
            const result = mutator(working);
            updated = result && typeof result === 'object' ? result : working;
        } else if (mutator && typeof mutator === 'object') {
            updated = mutator;
        }

        state.vault = updated;
        dispatch('vault:updated', { vault: deepClone(state.vault) });

        if (options.sync === false) {
            return state.vault;
        }

        const response = await apiFetch('/api/account/vault', {
            method: 'PUT',
            body: JSON.stringify({ vault: state.vault })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data?.error || 'Failed to persist vault');
        }

        return state.vault;
    };

    const syncVault = async () => {
        if (!state.user) return;
        const response = await apiFetch('/api/account/vault');
        if (!response.ok) {
            throw new Error('Unable to fetch vault.');
        }
        const data = await response.json();
        state.vault = deepClone(data?.vault || defaultVault());
        dispatch('vault:updated', { vault: deepClone(state.vault) });
        return state.vault;
    };

    const logout = async () => {
        try {
            await apiFetch('/api/logout', { method: 'POST' });
        } catch (error) {
            console.warn('[Auth] Logout warning:', error);
        } finally {
            setToken(null);
            state.user = null;
            state.vault = null;
            showOverlay('You have been logged out. Log in to continue.');
            dispatch('auth:changed', { user: null });
        }
    };

    const init = async () => {
        createOverlay();
        if (state.token) {
            await refreshAccount();
        } else {
            try {
                await refreshAccount();
            } catch (error) {
                handleUnauthenticated();
            }
        }
    };

    window.Auth = {
        init,
        login: (email, password) => authenticate('login', new Map([['email', email], ['password', password]])),
        register: (email, password, name) => authenticate('register', new Map([['email', email], ['password', password], ['name', name]])),
        logout,
        ensureReady,
        onReady: ensureReady,
        getUser: () => deepClone(state.user),
        getVault: () => deepClone(state.vault),
        updateVault,
        syncVault,
        apiFetch,
        refreshAccount
    };

    document.addEventListener('DOMContentLoaded', () => {
        init();
    });
})();
