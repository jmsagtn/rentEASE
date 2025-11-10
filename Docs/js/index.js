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
        
        // Don't prevent default for modal triggers
        if (this.id === 'navGetStarted' || this.id === 'heroGetStarted' || this.id === 'ctaGetStarted') {
            e.preventDefault();
            openModal();
            return;
        }
        
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
closeModalBtn.addEventListener('click', closeModal);

// Close modal on overlay click
modalOverlay.addEventListener('click', closeModal);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
    }
});

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
    setTimeout(() => toast.remove(), 300);
}

// Plan button actions
document.querySelectorAll('.plan-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const planName = e.target.closest('.pricing-card').querySelector('h3').textContent;
        showToast(planName);
        
        // In production, you would redirect to signup or checkout after a delay
        // setTimeout(() => {
        //     window.location.href = '/signup?plan=' + planName.toLowerCase();
        // }, 1500);
    });
});