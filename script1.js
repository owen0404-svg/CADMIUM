/**
 * Cadmium homepage interactions.
 * The script is intentionally small and non-blocking:
 * - mobile navigation
 * - reveal-on-scroll
 * - lightweight counters
 * - decorative particles
 * - subtle pointer parallax
 * - hover spotlight / tilt cards
 */

const motionState = {
    frameId: 0,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0
};

document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initNavigation();
    initHeaderState();
    initRevealAnimations();
    initCounters();
    initParticles();
    initSpaceScrollField();
    initParallaxPanel();
    initInteractiveCards();
    initShowcaseSlideshow();
});

function initThemeToggle() {
    const root = document.documentElement;
    const toggle = document.querySelector(".theme-toggle");
    const label = toggle?.querySelector(".theme-toggle-label");
    const storageKey = "cadmium-theme";

    const applyTheme = (theme) => {
        root.dataset.theme = theme;

        if (!toggle || !label) return;

        const isLight = theme === "light";
        toggle.setAttribute("aria-pressed", String(isLight));
        label.textContent = isLight ? "Light mode" : "Dark mode";
    };

    const savedTheme = (() => {
        try {
            return localStorage.getItem(storageKey);
        } catch (error) {
            return null;
        }
    })();

    const defaultTheme = savedTheme
        || root.dataset.theme
        || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

    applyTheme(defaultTheme);

    if (!toggle) return;

    toggle.addEventListener("click", () => {
        const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
        applyTheme(nextTheme);

        try {
            localStorage.setItem(storageKey, nextTheme);
        } catch (error) {
            // Ignore storage failures and keep the in-memory theme.
        }
    });
}

function initNavigation() {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.querySelector(".nav-menu");

    if (!toggle || !menu) return;

    toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        });
    });
}

function initHeaderState() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    const updateHeader = () => {
        header.classList.toggle("is-compact", window.scrollY > 16);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
}

function initRevealAnimations() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px"
    });

    items.forEach((item) => observer.observe(item));
}

function initCounters() {
    const counters = document.querySelectorAll(".counter");
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateCounter(entry.target);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.6 });

    counters.forEach((counter) => observer.observe(counter));
}

function animateCounter(element) {
    const target = Number(element.dataset.count || 0);
    const duration = 900;
    const start = performance.now();

    function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        element.textContent = String(Math.floor(progress * target));

        if (progress < 1) {
            requestAnimationFrame(update);
            return;
        }

        element.textContent = String(target);
    }

    requestAnimationFrame(update);
}

function initParticles() {
    const particleField = document.getElementById("particle-field");
    if (!particleField) return;

    const particleCount = window.innerWidth < 768 ? 8 : 12;

    for (let index = 0; index < particleCount; index += 1) {
        const particle = document.createElement("span");
        particle.className = "particle";
        particle.style.setProperty("--left", `${Math.random() * 100}%`);
        particle.style.setProperty("--top", `${10 + Math.random() * 80}%`);
        particle.style.setProperty("--size", `${2 + Math.random() * 3}px`);
        particle.style.setProperty("--duration", `${16 + Math.random() * 10}s`);
        particle.style.setProperty("--delay", `${Math.random() * -10}s`);
        particleField.appendChild(particle);
    }
}

function initSpaceScrollField() {
    const root = document.documentElement;
    const spaceField = document.getElementById("space-field");

    if (!spaceField || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const starCount = window.innerWidth < 768 ? 18 : 30;
    const trailCount = window.innerWidth < 768 ? 4 : 7;

    for (let index = 0; index < starCount; index += 1) {
        const star = document.createElement("span");
        const isLarge = index % 6 === 0;
        star.className = `space-star${isLarge ? " space-star-large" : ""}`;
        star.style.setProperty("--left", `${4 + Math.random() * 92}%`);
        star.style.setProperty("--top", `${6 + Math.random() * 86}%`);
        star.style.setProperty("--size", `${isLarge ? 4 + Math.random() * 5 : 1 + Math.random() * 2.6}px`);
        star.style.setProperty("--star-opacity", `${isLarge ? 0.12 + Math.random() * 0.12 : 0.04 + Math.random() * 0.12}`);
        star.style.setProperty("--space-offset", `${Math.random() * 60 - 30}px`);
        star.style.setProperty("--star-scale", `${0.9 + Math.random() * 0.9}`);
        spaceField.appendChild(star);
    }

    for (let index = 0; index < trailCount; index += 1) {
        const trail = document.createElement("span");
        trail.className = "space-star space-star-trail";
        trail.style.setProperty("--left", `${8 + Math.random() * 82}%`);
        trail.style.setProperty("--top", `${10 + Math.random() * 76}%`);
        trail.style.setProperty("--star-opacity", `${0.05 + Math.random() * 0.08}`);
        trail.style.setProperty("--space-offset", `${Math.random() * 40 - 20}px`);
        trail.style.setProperty("--trail-width", `${60 + Math.random() * 120}px`);
        trail.style.setProperty("--trail-rotate", `${-24 + Math.random() * 18}deg`);
        spaceField.appendChild(trail);
    }

    let frameId = 0;

    const render = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const progress = Math.min(window.scrollY / maxScroll, 1);
        const shift = `${-110 * progress}px`;
        const opacity = (0.06 + progress * 0.12).toFixed(3);

        root.style.setProperty("--space-scroll-shift", shift);
        root.style.setProperty("--space-scroll-opacity", opacity);
        frameId = 0;
    };

    const requestRender = () => {
        if (frameId) return;
        frameId = requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", requestRender);
}

function initParallaxPanel() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const panel = document.querySelector("[data-parallax]");
    if (!panel) return;

    window.addEventListener("pointermove", (event) => {
        motionState.targetX = (event.clientX / window.innerWidth - 0.5) * 7;
        motionState.targetY = (event.clientY / window.innerHeight - 0.5) * 7;

        if (!motionState.frameId) {
            motionState.frameId = requestAnimationFrame(() => updateParallax(panel));
        }
    }, { passive: true });
}

function updateParallax(panel) {
    motionState.currentX += (motionState.targetX - motionState.currentX) * 0.12;
    motionState.currentY += (motionState.targetY - motionState.currentY) * 0.12;

    panel.style.transform = `translate3d(${motionState.currentX}px, ${motionState.currentY * -0.3}px, 0)`;

    if (Math.abs(motionState.targetX - motionState.currentX) > 0.05 || Math.abs(motionState.targetY - motionState.currentY) > 0.05) {
        motionState.frameId = requestAnimationFrame(() => updateParallax(panel));
        return;
    }

    motionState.frameId = 0;
}

function initInteractiveCards() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = document.querySelectorAll("[data-tilt-card]");
    if (!cards.length) return;

    cards.forEach((card) => {
        card.addEventListener("pointermove", (event) => handleCardPointerMove(card, event));
        card.addEventListener("pointerleave", () => resetCard(card));
    });
}

function handleCardPointerMove(card, event) {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const percentX = x / rect.width;
    const percentY = y / rect.height;

    const rotateY = (percentX - 0.5) * 4;
    const rotateX = (0.5 - percentY) * 4;

    card.style.setProperty("--spotlight-x", `${percentX * 100}%`);
    card.style.setProperty("--spotlight-y", `${percentY * 100}%`);
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
}

function resetCard(card) {
    card.style.transform = "";
}

function initShowcaseSlideshow() {
    const showcase = document.querySelector("[data-showcase]");
    if (!showcase) return;

    const slides = [...showcase.querySelectorAll("[data-slide]")];
    const copies = [...showcase.querySelectorAll("[data-slide-copy]")];
    const dots = [...showcase.querySelectorAll("[data-slide-dot]")];
    const prevButton = showcase.querySelector("[data-slide-action=\"prev\"]");
    const nextButton = showcase.querySelector("[data-slide-action=\"next\"]");
    const progress = showcase.querySelector("[data-slideshow-progress]");

    if (!slides.length || !dots.length || !progress) return;

    let currentIndex = 0;
    let autoPlay = null;

    const render = (index) => {
        currentIndex = (index + slides.length) % slides.length;

        slides.forEach((slide, slideIndex) => {
            const isActive = slideIndex === currentIndex;
            slide.classList.toggle("is-active", isActive);
            slide.hidden = !isActive;
        });

        copies.forEach((copy, copyIndex) => {
            copy.classList.toggle("is-active", copyIndex === currentIndex);
        });

        dots.forEach((dot, dotIndex) => {
            const isActive = dotIndex === currentIndex;
            dot.classList.toggle("is-active", isActive);
            dot.setAttribute("aria-selected", String(isActive));
        });

        progress.style.transform = `scaleX(${(currentIndex + 1) / slides.length})`;
    };

    const startAutoPlay = () => {
        stopAutoPlay();
        autoPlay = window.setInterval(() => {
            render(currentIndex + 1);
        }, 4200);
    };

    const stopAutoPlay = () => {
        if (!autoPlay) return;
        window.clearInterval(autoPlay);
        autoPlay = null;
    };

    prevButton?.addEventListener("click", () => {
        render(currentIndex - 1);
        startAutoPlay();
    });

    nextButton?.addEventListener("click", () => {
        render(currentIndex + 1);
        startAutoPlay();
    });

    dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
            render(index);
            startAutoPlay();
        });
    });

    showcase.addEventListener("mouseenter", stopAutoPlay);
    showcase.addEventListener("mouseleave", startAutoPlay);

    render(0);
    startAutoPlay();
}
