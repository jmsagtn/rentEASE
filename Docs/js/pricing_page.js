// Get all necessary elements
const toggleButtons = document.querySelectorAll('.toggle-btn');
const pricingCards = document.querySelectorAll('.pricing-card');
const ctaButtons = document.querySelectorAll('.cta-btn');

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

// Handle CTA button clicks
ctaButtons.forEach(button => {
    button.addEventListener('click', function() {
        const card = this.closest('.pricing-card');
        const planName = card.getAttribute('data-plan');
        const formattedPlanName = planName.charAt(0).toUpperCase() + planName.slice(1);
        
        // Alert for demo purposes (replace with actual signup logic)
        alert('Starting ' + formattedPlanName + ' plan!');
        
        // In production, redirect to signup/checkout page
        // window.location.href = '/signup?plan=' + planName + '&cycle=' + currentCycle;
    });
});