(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const navLinks = Array.from(document.querySelectorAll('.sidebar__nav [data-view]'));
        if (!navLinks.length) return;

        const chatWorkspace = document.querySelector('[data-view-content="chat"]');
        const externalWorkspace = document.querySelector('[data-view-content="external"]');
        const frames = externalWorkspace ? Array.from(externalWorkspace.querySelectorAll('[data-view-frame]')) : [];
        const availableViews = new Set(['chat', ...frames.map(frame => frame.dataset.viewFrame)]);
        let currentView = null;

        const toggleHidden = (element, shouldHide) => {
            if (!element) return;
            if (shouldHide) {
                element.setAttribute('hidden', '');
                element.setAttribute('aria-hidden', 'true');
            } else {
                element.removeAttribute('hidden');
                element.setAttribute('aria-hidden', 'false');
            }
        };

        const activateNavLink = (view) => {
            navLinks.forEach((link) => {
                const isActive = link.dataset.view === view;
                link.classList.toggle('active', isActive);
                if (isActive) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        };

        const applyView = (requestedView) => {
            const view = availableViews.has(requestedView) ? requestedView : 'chat';
            if (view === currentView) return;

            if (view === 'chat') {
                toggleHidden(chatWorkspace, false);
                toggleHidden(externalWorkspace, true);
                frames.forEach(frame => toggleHidden(frame, true));
            } else {
                toggleHidden(chatWorkspace, true);
                toggleHidden(externalWorkspace, false);
                frames.forEach((frame) => {
                    const match = frame.dataset.viewFrame === view;
                    toggleHidden(frame, !match);
                    if (match && !frame.dataset.loaded) {
                        frame.dataset.loaded = 'true';
                    }
                });
            }

            activateNavLink(view);
            currentView = view;
        };

        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '') || 'chat';
            applyView(hash);
        };

        navLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const view = link.dataset.view || 'chat';
                if (!availableViews.has(view)) return;

                applyView(view);
                if ((window.location.hash.replace('#', '') || 'chat') !== view) {
                    window.location.hash = view;
                }
            });
        });

        window.addEventListener('hashchange', handleHashChange);

        // Initialize view based on current hash
        const initialHash = window.location.hash.replace('#', '') || 'chat';
        applyView(initialHash);
        // Ensure hash matches active view for deep links
        if ((window.location.hash.replace('#', '') || 'chat') !== currentView) {
            window.location.hash = currentView;
        }
    });
})();
