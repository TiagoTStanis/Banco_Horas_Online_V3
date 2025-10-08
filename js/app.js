document.addEventListener('DOMContentLoaded', () => {
    // Verifica qual página está carregada para executar a função correta
    const path = window.location.pathname.split("/").pop();

    // Funções comuns a várias páginas
    // updateUserData();

    if (path === 'dashboard.html' || path === 'profile.html') {
        populateDashboard();
    } else if (path === 'reports.html') {
        //populateReportsPage();
    }
});

/*
function updateUserData() {
    // Atualiza o nome do usuário no cabeçalho
    const userNameElements = document.querySelectorAll('.user-name');
    userNameElements.forEach(el => el.textContent = appData.user.name);
} */

    /*
function populateDashboard() {
    // Lógica para popular o gráfico da dashboard
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;

    new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: appData.dashboard.weeklySummary.labels,
            datasets: [{
                label: 'Work Hours',
                data: appData.dashboard.weeklySummary.workHours,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }, {
                label: 'Tickets Time',
                data: appData.dashboard.weeklySummary.ticketsTime,
                backgroundColor: '#10b981',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + 'h';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                }
            }
        }
    });
}

function populateReportsPage() {
    // Popular os cards de resumo mensal
    document.getElementById('monthlyHours').textContent = appData.reports.monthlySummary.workedHours;
    document.getElementById('monthlyHoursComparison').textContent = appData.reports.monthlySummary.workedHoursComparison;
    document.getElementById('ticketsHours').textContent = appData.reports.monthlySummary.ticketsHours;
    document.getElementById('ticketsHoursComparison').textContent = appData.reports.monthlySummary.ticketsHoursComparison;
    document.getElementById('currentBalance').textContent = '+' + appData.reports.monthlySummary.currentBalance;
    document.getElementById('currentBalanceComparison').textContent = appData.reports.monthlySummary.currentBalanceComparison;

    // Popular a tabela de tickets recentes
    const ticketsTableBody = document.getElementById('recentTicketsTableBody');
    ticketsTableBody.innerHTML = ''; // Limpa a tabela antes de popular
    appData.reports.recentTickets.forEach(ticket => {
        const row = `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ticket.date}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${ticket.id}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${ticket.time}</td>
            </tr>
        `;
        ticketsTableBody.innerHTML += row;
    });

    // Popular o gráfico de horas diárias
    const dailyCtx = document.getElementById('dailyHoursChart');
    if(dailyCtx) {
        new Chart(dailyCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array.from({length: 30}, (_, i) => i + 1),
                datasets: [{
                    label: 'Work Hours',
                    data: appData.reports.dailyWorkHours,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (value) => value + 'h' } } } }
        });
    }

    // Popular o gráfico de pizza (Work vs Tickets)
    const workTicketsCtx = document.getElementById('workVsTicketsChart');
    if(workTicketsCtx) {
        new Chart(workTicketsCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Work Hours', 'Tickets Time'],
                datasets: [{
                    data: [appData.reports.workVsTickets.work, appData.reports.workVsTickets.tickets],
                    backgroundColor: ['#3b82f6', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    }
}
*/