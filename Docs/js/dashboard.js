 // Chart.js default configuration
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        Chart.defaults.color = '#718096';

        // Gradient helper function
        function createGradient(ctx, color1, color2) {
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, color1);
            gradient.addColorStop(1, color2);
            return gradient;
        }

        // Bar Chart
        const barCtx = document.getElementById('barChart').getContext('2d');
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Likes',
                    data: [3200, 4100, 3800, 5200, 4800, 6100],
                    backgroundColor: createGradient(barCtx, '#667eea', '#764ba2'),
                    borderRadius: 10,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#edf2f7' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

        // Pie Chart
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: ['Likes', 'Comments', 'Shares', 'Saves'],
                datasets: [{
                    data: [45, 25, 20, 10],
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#fc8181'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 15 }
                    }
                }
            }
        });

        // Line Chart
        const lineCtx = document.getElementById('lineChart').getContext('2d');
        const lineGradient = lineCtx.createLinearGradient(0, 0, 0, 300);
        lineGradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
        lineGradient.addColorStop(1, 'rgba(118, 75, 162, 0.0)');

        new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Total Engagement',
                    data: [4000, 4500, 5200, 4800, 6100, 7200, 6800, 7500, 8200, 7800, 8900, 9500],
                    borderColor: '#667eea',
                    backgroundColor: lineGradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#edf2f7' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

        // Column Chart
        const columnCtx = document.getElementById('columnChart').getContext('2d');
        new Chart(columnCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Daily Likes',
                    data: [820, 950, 1100, 890, 1250, 1400, 980],
                    backgroundColor: ['#667eea', '#48bb78', '#ed8936', '#fc8181', '#667eea', '#48bb78', '#ed8936'],
                    borderRadius: 10,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#edf2f7' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

        // Area Line Chart
        const areaCtx = document.getElementById('areaChart').getContext('2d');
        const areaGradient = areaCtx.createLinearGradient(0, 0, 0, 250);
        areaGradient.addColorStop(0, 'rgba(72, 187, 120, 0.4)');
        areaGradient.addColorStop(1, 'rgba(72, 187, 120, 0.0)');

        new Chart(areaCtx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
                datasets: [{
                    label: 'Follower Growth',
                    data: [320, 450, 580, 720, 890, 1050],
                    borderColor: '#48bb78',
                    backgroundColor: areaGradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#48bb78',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#edf2f7' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });