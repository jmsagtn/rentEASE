// Enhanced device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.innerWidth > 768 && window.innerWidth <= 1024;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Viewport height fix for mobile browsers
function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVH();
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', setVH);

// Navbar scroll effect with improved mobile performance
let lastScrollY = window.pageYOffset;
let ticking = false;

function updateNavbar() {
    const nav = document.getElementById('navbar');
    const scrollY = window.pageYOffset;
    
    if (scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
    
    lastScrollY = scrollY;
    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(updateNavbar);
        ticking = true;
    }
});

// Mobile menu toggle (add hamburger menu)
function createMobileMenu() {
    if (window.innerWidth <= 768) {
        const nav = document.querySelector('.nav-container');
        const navMenu = document.querySelector('.nav-menu');
        
        // Check if hamburger already exists
        if (!document.querySelector('.hamburger')) {
            const hamburger = document.createElement('button');
            hamburger.className = 'hamburger';
            hamburger.innerHTML = `
                <span></span>
                <span></span>
                <span></span>
            `;
            hamburger.setAttribute('aria-label', 'Toggle menu');
            
            nav.appendChild(hamburger);
            
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('active');
                navMenu.classList.toggle('active');
                document.body.classList.toggle('menu-open');
            });
            
            // Close menu when clicking on a link
            navMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                    document.body.classList.remove('menu-open');
                });
            });
        }
    }
}

// Create mobile menu on load and resize
createMobileMenu();
window.addEventListener('resize', createMobileMenu);

// Smooth scrolling with offset for fixed navbar
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        
        // Redirect to signup for CTA buttons
        if (this.id === 'heroGetStarted' || this.id === 'ctaGetStarted') {
            e.preventDefault();
            window.location.href = 'sign_up.html';
            return;
        }
        
        // Handle smooth scrolling
        if (href !== '#' && href !== '#hero') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navHeight = document.getElementById('navbar').offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        }
    });
});

// Modal functionality with improved mobile support
const modal = document.getElementById('pricingModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOverlay = document.querySelector('.modal-overlay');

function openModal() {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Prevent scroll on iOS
    if (isMobile) {
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
    }
}

function closeModal() {
    modal.classList.remove('active');
    
    // Restore scroll
    if (isMobile) {
        document.body.style.position = '';
        document.body.style.width = '';
    }
    document.body.style.overflow = '';
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeModal();
    }
});

const modalContent = document.querySelector('.modal-content');
if (modalContent) {
    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Enhanced toast notification
function showToast(planName) {
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `
        <div class="toast-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        </div>
        <div class="toast-content">
            <div class="toast-title">Plan Selected!</div>
            <div class="toast-message">You selected the <strong>${planName}</strong> plan. Redirecting to signup...</div>
        </div>
        <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    const autoRemove = setTimeout(() => {
        removeToast(toast);
    }, 4000);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoRemove);
        removeToast(toast);
    });
}

function removeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
}

// Plan button actions
const planButtons = document.querySelectorAll('.plan-button');
planButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const planCard = e.target.closest('.pricing-card');
        const planName = planCard.querySelector('h3').textContent;
        
        closeModal();
        
        setTimeout(() => {
            showToast(planName);
        }, 300);
        
        setTimeout(() => {
            window.location.href = 'sign_up.html?plan=' + planName.toLowerCase();
        }, 2000);
    });
});

// Intersection Observer with reduced motion support
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const observerOptions = {
    threshold: isMobile ? 0.05 : 0.1,
    rootMargin: isMobile ? '0px 0px -20px 0px' : '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            if (prefersReducedMotion) {
                entry.target.style.opacity = '1';
            } else {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        }
    });
}, observerOptions);

// Observe elements with optimized animations
const featureCards = document.querySelectorAll('.feature-card');
const statItems = document.querySelectorAll('.stat-item');

featureCards.forEach((el, index) => {
    el.style.opacity = '0';
    if (!prefersReducedMotion) {
        el.style.transform = 'translateY(30px)';
        const delay = isMobile ? index * 0.05 : index * 0.1;
        el.style.transition = `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`;
    }
    observer.observe(el);
});

statItems.forEach((el, index) => {
    el.style.opacity = '0';
    if (!prefersReducedMotion) {
        el.style.transform = 'translateY(30px)';
        const delay = isMobile ? index * 0.08 : index * 0.15;
        el.style.transition = `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`;
    }
    observer.observe(el);
});

// Parallax effect (desktop only)
function updateParallax() {
    if (isMobile || isTablet || prefersReducedMotion) return;
    
    const scrolled = window.pageYOffset;
    const cards = document.querySelectorAll('.floating-card');
    
    cards.forEach((card, index) => {
        const speed = (index + 1) * 0.2;
        const yPos = scrolled * speed;
        card.style.transform = `translateY(${yPos}px)`;
    });
}

let parallaxTicking = false;
window.addEventListener('scroll', () => {
    if (!parallaxTicking && !isMobile && !isTablet) {
        window.requestAnimationFrame(() => {
            updateParallax();
            parallaxTicking = false;
        });
        parallaxTicking = true;
    }
});

// Active navigation highlighting
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a:not(.nav-cta)');

function highlightNav() {
    let current = 'home';
    const scrollY = window.pageYOffset;
    const offset = window.innerHeight / 3;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - offset;
        const sectionHeight = section.clientHeight;
        const sectionId = section.getAttribute('id');
        
        if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
            current = sectionId;
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === `#${current}` || (href === '#home' && current === 'hero')) {
            link.classList.add('active');
        }
    });
}

let navTicking = false;
window.addEventListener('scroll', () => {
    if (!navTicking) {
        window.requestAnimationFrame(() => {
            highlightNav();
            navTicking = false;
        });
        navTicking = true;
    }
});
highlightNav();

// Enhanced button ripple effect
document.querySelectorAll('.btn, .plan-button, .nav-cta').forEach(button => {
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    
    const eventType = isTouch ? 'touchstart' : 'mousedown';
    
    button.addEventListener(eventType, function(e) {
        if (prefersReducedMotion) return;
        
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        let x, y;
        if (e.type === 'touchstart') {
            const touch = e.touches[0];
            x = touch.clientX - rect.left - size / 2;
            y = touch.clientY - rect.top - size / 2;
        } else {
            x = e.clientX - rect.left - size / 2;
            y = e.clientY - rect.top - size / 2;
        }
        
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
            animation: ripple-animation 0.6s ease-out;
        `;
        
        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
});

// Add ripple animation
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple-animation {
        from {
            transform: scale(0);
            opacity: 1;
        }
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    /* Mobile menu styles */
    .hamburger {
        display: none;
        flex-direction: column;
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        z-index: 1001;
    }
    
    .hamburger span {
        width: 25px;
        height: 3px;
        background: #fff;
        border-radius: 3px;
        transition: all 0.3s ease;
    }
    
    .hamburger.active span:nth-child(1) {
        transform: rotate(45deg) translate(8px, 8px);
    }
    
    .hamburger.active span:nth-child(2) {
        opacity: 0;
    }
    
    .hamburger.active span:nth-child(3) {
        transform: rotate(-45deg) translate(7px, -7px);
    }
    
    @media (max-width: 768px) {
        .hamburger {
            display: flex;
        }
        
        .nav-menu {
            position: fixed;
            top: 0;
            right: -100%;
            width: 70%;
            max-width: 300px;
            height: 100vh;
            background: rgba(10, 10, 15, 0.98);
            backdrop-filter: blur(20px);
            flex-direction: column;
            padding: 80px 30px 30px;
            gap: 1.5rem;
            transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: -5px 0 20px rgba(0, 0, 0, 0.3);
            z-index: 1000;
        }
        
        .nav-menu.active {
            right: 0;
        }
        
        .nav-menu li {
            width: 100%;
        }
        
        .nav-menu a {
            display: block;
            padding: 15px 20px;
            font-size: 1.1rem;
        }
        
        body.menu-open {
            overflow: hidden;
        }
        
        /* Add overlay when menu is open */
        body.menu-open::before {
            content: '';
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999;
            animation: fadeIn 0.3s ease;
        }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    /* Improve touch targets on mobile */
    @media (max-width: 768px) {
        .btn, .plan-button {
            min-height: 48px;
            padding: 14px 24px;
        }
        
        .feature-card {
            -webkit-tap-highlight-color: transparent;
        }
    }
    
    /* Prevent zoom on input focus (iOS) */
    @media screen and (max-width: 768px) {
        input[type="text"],
        input[type="email"],
        input[type="tel"],
        textarea {
            font-size: 16px !important;
        }
    }
`;
document.head.appendChild(style);

// Animated counter for stats
function animateCounter(element, target, duration = 2000) {
    if (prefersReducedMotion) {
        element.textContent = formatNumber(target);
        return;
    }
    
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = formatNumber(target);
            clearInterval(timer);
        } else {
            element.textContent = formatNumber(Math.floor(current));
        }
    }, 16);
}

function formatNumber(num) {
    if (num >= 1000000) {
        return '₱' + (num / 1000000).toFixed(1) + 'M+';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(0) + ',000+';
    }
    return num.toString();
}

const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.dataset.animated) {
            const h3 = entry.target.querySelector('h3');
            const text = h3.textContent;
            const number = parseInt(text.replace(/[^0-9]/g, ''));
            
            if (!isNaN(number)) {
                h3.textContent = '0';
                animateCounter(h3, number);
                entry.target.dataset.animated = 'true';
            }
        }
    });
}, { threshold: 0.5 });

statItems.forEach(item => {
    statsObserver.observe(item);
});

// Hero elements fade in
window.addEventListener('load', () => {
    const heroElements = document.querySelectorAll('.hero-badge, .hero h1, .hero p, .hero-buttons');
    heroElements.forEach((el, index) => {
        setTimeout(() => {
            el.style.opacity = '1';
            if (!prefersReducedMotion) {
                el.style.transform = 'translateY(0)';
            }
        }, index * 200);
    });
});

// Mouse parallax for hero (desktop only)
const hero = document.querySelector('.hero');
if (hero && !isMobile && !isTablet && !prefersReducedMotion) {
    let mouseX = 0, mouseY = 0;
    let currentX = 0, currentY = 0;
    
    hero.addEventListener('mousemove', (e) => {
        mouseX = e.clientX / window.innerWidth;
        mouseY = e.clientY / window.innerHeight;
    });
    
    function animateParallax() {
        currentX += (mouseX - currentX) * 0.1;
        currentY += (mouseY - currentY) * 0.1;
        
        const cards = document.querySelectorAll('.floating-card');
        cards.forEach((card, index) => {
            const speed = (index + 1) * 20;
            const x = (currentX - 0.5) * speed;
            const y = (currentY - 0.5) * speed;
            
            card.style.transform = `translate(${x}px, ${y}px)`;
        });
        
        requestAnimationFrame(animateParallax);
    }
    
    animateParallax();
}

// Touch feedback for mobile
if (isTouch) {
    const touchElements = document.querySelectorAll('.feature-card, .stat-item, .pricing-card');
    
    touchElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            if (!prefersReducedMotion) {
                this.style.transform = 'scale(0.98)';
                if (this.classList.contains('feature-card')) {
                    this.style.borderColor = 'rgba(47, 196, 178, 0.5)';
                }
            }
        }, { passive: true });
        
        element.addEventListener('touchend', function() {
            this.style.transform = '';
            setTimeout(() => {
                if (this.classList.contains('feature-card')) {
                    this.style.borderColor = '';
                }
            }, 300);
        }, { passive: true });
    });
}

// Performance optimizations for mobile
if (isMobile) {
    const performanceStyle = document.createElement('style');
    performanceStyle.textContent = `
        @media (max-width: 768px) {
            * {
                -webkit-tap-highlight-color: rgba(47, 196, 178, 0.2);
            }
            
            .bg-gradient,
            .grain {
                animation: none;
            }
            
            .feature-card::before,
            .feature-card::after {
                display: none;
            }
            
            .cta-box::before {
                animation: none;
            }
        }
    `;
    document.head.appendChild(performanceStyle);
}

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        setVH();
        window.scrollTo(0, window.pageYOffset);
    }, 100);
});

// Debounced resize handler
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        setVH();
        createMobileMenu();
    }, 250);
});

// Prevent horizontal scroll on mobile
if (isMobile) {
    document.body.style.overflowX = 'hidden';
}

// Lazy load images
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            imageObserver.unobserve(img);
        }
    });
});

document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
});