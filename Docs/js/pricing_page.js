// Get all necessary elements
const toggleButtons = document.querySelectorAll('.toggle-btn');
const pricingCards = document.querySelectorAll('.pricing-card');

// Current billing cycle state
let currentCycle = 'monthly';

// Toggle between monthly and yearly billing
toggleButtons.forEach(button => {
    button.addEventListener('click', function() {
        // Remove active class from all buttons
        toggleButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked button
        this.classList.add('active');
        
        // Update current cycle
        currentCycle = this.getAttribute('data-cycle');
        
        // Update all prices
        updatePrices();
    });
});

// Update prices based on billing cycle
function updatePrices() {
    pricingCards.forEach(card => {
        const priceElement = card.querySelector('.price');
        const periodElement = card.querySelector('.period');
        const savingsElement = card.querySelector('.savings');
        
        if (priceElement) {
            const monthlyPrice = parseInt(priceElement.getAttribute('data-monthly') || '0');
            const yearlyPrice = parseInt(priceElement.getAttribute('data-yearly') || '0');
            
            if (currentCycle === 'yearly') {
                // Update to yearly pricing
                priceElement.textContent = '$' + yearlyPrice;
                periodElement.textContent = '/yr';
                
                // Calculate and display savings
                if (monthlyPrice > 0) {
                    const monthlyCost = monthlyPrice * 12;
                    const savings = monthlyCost - yearlyPrice;
                    savingsElement.textContent = 'Save $' + savings + '/year';
                } else {
                    savingsElement.textContent = '';
                }
            } else {
                // Update to monthly pricing
                priceElement.textContent = '$' + monthlyPrice;
                periodElement.textContent = '/mo';
                savingsElement.textContent = '';
            }
        }
    });
}

// Add scroll effect for navbar
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});