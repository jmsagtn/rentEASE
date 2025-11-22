// Detect if device is mobile/tablet
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
});

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        
        // Don't prevent default for modal triggers - redirect to signup
        if (this.id === 'heroGetStarted' || this.id === 'ctaGetStarted') {
            e.preventDefault();
            window.location.href = 'sign_up.html';
            return;
        }
        
        // Handle smooth scrolling for other links
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});

// Modal functionality
const modal = document.getElementById('pricingModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOverlay = document.querySelector('.modal-overlay');

function openModal() {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Close modal on close button click
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

// Close modal on overlay click
if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeModal();
    }
});

// Prevent modal close when clicking inside modal content
const modalContent = document.querySelector('.modal-content');
if (modalContent) {
    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Custom toast notification function
function showToast(planName) {
    // Remove existing toast if any
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
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
        <button class="toast-close">&times;</button>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after 4 seconds
    const autoRemove = setTimeout(() => {
        removeToast(toast);
    }, 4000);

    // Close button functionality
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
        
        // Close modal first
        closeModal();
        
        // Show toast notification
        setTimeout(() => {
            showToast(planName);
        }, 300);
        
        // Redirect to signup page after delay
        setTimeout(() => {
            window.location.href = 'sign_up.html?plan=' + planName.toLowerCase();
        }, 2000);
    });
});

// Intersection Observer for fade-in animations on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards and stat items with stagger effect
const featureCards = document.querySelectorAll('.feature-card');
const statItems = document.querySelectorAll('.stat-item');

featureCards.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
    observer.observe(el);
});

statItems.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = `opacity 0.6s ease ${index * 0.15}s, transform 0.6s ease ${index * 0.15}s`;
    observer.observe(el);
});

// Parallax effect for floating cards (desktop only)
let ticking = false;

function updateParallax() {
    // Skip parallax on mobile devices for better performance
    if (isMobile) return;
    
    const scrolled = window.pageYOffset;
    const cards = document.querySelectorAll('.floating-card');
    
    cards.forEach((card, index) => {
        const speed = (index + 1) * 0.2;
        const yPos = scrolled * speed;
        card.style.transform = `translateY(${yPos}px)`;
    });
    
    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking && !isMobile) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
    }
});

// Active navigation highlighting
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a:not(.nav-cta)');

function highlightNav() {
    let current = 'home';
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 200;
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

window.addEventListener('scroll', highlightNav);
highlightNav(); // Call on load

// Add ripple effect to buttons (works on both click and touch)
document.querySelectorAll('.btn, .plan-button, .nav-cta').forEach(button => {
    const eventType = isTouch ? 'touchstart' : 'click';
    
    button.addEventListener(eventType, function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        // Get touch or click position
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

// Add ripple animation dynamically
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
`;
document.head.appendChild(style);

// Animated counter for stats
function animateCounter(element, target, duration = 2000) {
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

// Observe stats for counter animation
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

// Smooth fade in for hero elements on load
window.addEventListener('load', () => {
    const heroElements = document.querySelectorAll('.hero-badge, .hero h1, .hero p, .hero-buttons');
    heroElements.forEach((el, index) => {
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 200);
    });
});

// Add subtle mouse move parallax effect to hero (desktop only)
const hero = document.querySelector('.hero');
if (hero && !isMobile) {
    hero.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.floating-card');
        const mouseX = e.clientX / window.innerWidth;
        const mouseY = e.clientY / window.innerHeight;
        
        cards.forEach((card, index) => {
            const speed = (index + 1) * 20;
            const x = (mouseX - 0.5) * speed;
            const y = (mouseY - 0.5) * speed;
            
            card.style.transform = `translate(${x}px, ${y}px)`;
        });
    });
}

// Add touch feedback for mobile feature cards
if (isTouch) {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
            this.style.borderColor = 'rgba(47, 196, 178, 0.5)';
        });
        
        card.addEventListener('touchend', function() {
            this.style.transform = '';
            setTimeout(() => {
                this.style.borderColor = '';
            }, 300);
        });
    });
}

// Optimize scroll animations for mobile
if (isMobile) {
    // Reduce animation complexity on mobile
    const styleOptimizations = document.createElement('style');
    styleOptimizations.textContent = `
        @media (max-width: 768px) {
            * {
                animation-duration: 0.3s !important;
                transition-duration: 0.3s !important;
            }
            
            .feature-card:hover::after,
            .feature-card::after {
                display: none;
            }
            
            .btn::after {
                display: none;
            }
        }
    `;
    document.head.appendChild(styleOptimizations);
}

// Handle orientation change on mobile
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        window.scrollTo(0, window.pageYOffset + 1);
        window.scrollTo(0, window.pageYOffset - 1);
    }, 100);
});