(function () {
    const PROFILE_KEY = 'minimalism_user_profile';
    const PROGRESS_KEY = 'minimalism_progress';

    let cachedSnapshot = null;

    function readJson(key) {
        if (typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`[ProfileStore] Failed to parse ${key}:`, error);
            return null;
        }
    }

    function toNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const coerced = Number(value);
        return Number.isFinite(coerced) ? coerced : null;
    }

    function formatNumber(value) {
        const num = toNumber(value);
        if (num === null) return '—';
        try {
            return num.toLocaleString();
        } catch (error) {
            return String(num);
        }
    }

    function capitalizeFirst(str) {
        if (!str || typeof str !== 'string') return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function formatTimeframeShort(timeframe) {
        const map = {
            '3-months': '3 mo plan',
            '6-months': '6 mo plan',
            '1-year': '1 yr plan',
            'flexible': 'Flexible'
        };
        return map[timeframe] || 'Flexible';
    }

    function getAvatar(profile) {
        if (!profile || !profile.name) return 'MC';
        const initials = profile.name
            .trim()
            .split(/\s+/)
            .map(part => part.charAt(0).toUpperCase())
            .join('');
        return initials.slice(0, 2) || 'MC';
    }

    function resolveCurrentItems(progress, profile) {
        let current = toNumber(progress?.currentItemCount);
        if (current === null && Array.isArray(progress?.milestones) && progress.milestones.length > 0) {
            const lastMilestone = progress.milestones[progress.milestones.length - 1];
            current = toNumber(lastMilestone?.itemCount);
        }
        if (current === null) current = toNumber(profile?.currentItems);
        return current;
    }

    function resolveStartItems(progress, profile, fallbackCurrent) {
        let start = null;
        if (Array.isArray(progress?.milestones) && progress.milestones.length > 0) {
            start = toNumber(progress.milestones[0]?.itemCount);
        }
        if (start === null) start = toNumber(profile?.baselineItems);
        if (start === null) start = toNumber(profile?.startingItems);
        if (start === null) start = toNumber(profile?.currentItems);
        if (start === null) start = fallbackCurrent;
        return start;
    }

    function resolveTargetItems(profile, startItems) {
        let target = toNumber(profile?.targetItems);
        if (target === null && startItems !== null) {
            target = Math.max(Math.round(startItems * 0.6), 50);
        }
        if (target === null) target = 50;
        return target;
    }

    function computeImprovement(startItems, currentItems, targetItems) {
        if (startItems === null || currentItems === null || targetItems === null) return 0;
        const totalReduction = startItems - targetItems;
        if (!Number.isFinite(totalReduction) || totalReduction <= 0) return 0;
        const currentReduction = startItems - currentItems;
        const ratio = currentReduction / totalReduction;
        const percent = Math.round(ratio * 100);
        return Math.max(0, Math.min(100, percent));
    }

    function computeSnapshot() {
        const profile = readJson(PROFILE_KEY);
        const progress = readJson(PROGRESS_KEY);

        const currentItems = resolveCurrentItems(progress, profile);
        const startItems = resolveStartItems(progress, profile, currentItems);
        const targetItems = resolveTargetItems(profile, startItems);
        const improvementPercent = computeImprovement(startItems, currentItems, targetItems);

        const timelineLabel = formatTimeframeShort(profile?.timeframe);
        const lifestyleLabel = profile?.lifestyle || 'Lifestyle TBD';
        const phaseLabel = profile?.phase ? capitalizeFirst(profile.phase) : 'Initial';

        const computed = {
            name: profile?.name || 'Minimalism Coach',
            avatar: getAvatar(profile),
            phaseLabel,
            lifestyleLabel,
            timelineLabel,
            currentItemsLabel: formatNumber(currentItems),
            targetItemsLabel: formatNumber(targetItems),
            improvementPercent,
            metrics: {
                startItems,
                currentItems,
                targetItems
            }
        };

        return {
            profile,
            progress,
            computed
        };
    }

    function getSnapshot(options = {}) {
        if (!cachedSnapshot || options.force) {
            cachedSnapshot = computeSnapshot();
        }
        return cachedSnapshot;
    }

    function defaultEmptyView() {
        return `
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

    function renderProfileCard(container, options = {}) {
        const element = typeof container === 'string' ? document.getElementById(container) : container;
        const snapshot = options.snapshot || getSnapshot(options);
        if (!element) return snapshot;

        if (!snapshot.profile) {
            const view = typeof options.emptyView === 'function'
                ? options.emptyView()
                : (options.emptyView || defaultEmptyView());
            element.innerHTML = view;
            return snapshot;
        }

        const { computed } = snapshot;
        element.innerHTML = `
            <div class="user-profile">
                <div class="user-profile__avatar">${computed.avatar}</div>
                <div class="user-profile__details">
                    <h3>${computed.name}</h3>
                    <p>${computed.phaseLabel} phase • ${computed.lifestyleLabel}</p>
                </div>
            </div>
            <div class="progress-indicators">
                <div class="progress-item">
                    <span class="progress-number">${computed.currentItemsLabel}</span>
                    <span class="progress-label">Current Items</span>
                </div>
                <div class="progress-item">
                    <span class="progress-number">${computed.targetItemsLabel}</span>
                    <span class="progress-label">Target Items</span>
                </div>
                <div class="progress-item">
                    <span class="progress-number">${computed.improvementPercent}%</span>
                    <span class="progress-label">Journey Progress</span>
                </div>
                <div class="progress-item">
                    <span class="progress-number">${computed.timelineLabel}</span>
                    <span class="progress-label">Timeline</span>
                </div>
            </div>
        `;

        return snapshot;
    }

    function setProfile(profile) {
        if (typeof localStorage === 'undefined') return getSnapshot();
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        cachedSnapshot = null;
        return getSnapshot({ force: true });
    }

    function setProgress(progress) {
        if (typeof localStorage === 'undefined') return getSnapshot();
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
        cachedSnapshot = null;
        return getSnapshot({ force: true });
    }

    window.ProfileStore = {
        getSnapshot,
        renderProfileCard,
        refresh: () => getSnapshot({ force: true }),
        setProfile,
        setProgress,
        formatTimeframeShort,
        formatNumber
    };
})();
