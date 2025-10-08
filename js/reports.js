// js/reports.js
import { getMonthlyReportData } from './data-service.js';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // ESTADO E REFERÊNCIAS DO DOM
    // =================================================================
    let currentMonth = new Date();
    let dailySummaryChart = null; // Renomeado de dailyHoursChart
    let workVsTicketsChart = null;
    let lastProductivityPercentage = 0;

    const monthDisplay = document.getElementById('monthDisplay');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const monthlyHoursEl = document.getElementById('monthlyHours');
    const ticketsHoursEl = document.getElementById('ticketsHours');
    const currentBalanceEl = document.getElementById('currentBalance');
    const ticketsTableBody = document.getElementById('recentTicketsTableBody');
    const dailyCtx = document.getElementById('dailyHoursChart');
    const workTicketsCtx = document.getElementById('workVsTicketsChart');

    const productivityPercentage = document.getElementById('productivityPercentage');
    const productivityBar = document.getElementById('productivityBar');

    // =================================================================
    // FUNÇÕES AUXILIARES
    // =================================================================
    
    function formatSecondsToHHMM(totalSeconds) {
        const isNegative = totalSeconds < 0;
        if (isNegative) {
            totalSeconds = -totalSeconds;
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');
        return `${isNegative ? '-' : ''}${formattedHours}:${formattedMinutes}`;
    }

    // =================================================================
    // FUNÇÕES DE PROCESSAMENTO DE DADOS
    // =================================================================
    
    function calculateDailyWorkSeconds(entries) {
        const dailyWork = new Map();
        const todayStr = new Date().toISOString().split('T')[0];
        entries.forEach(entry => {
            const day = entry.entry_time.split('T')[0];
            if (!dailyWork.has(day)) {
                dailyWork.set(day, { totalSeconds: 0, lastStart: null });
            }
        });
        entries.forEach(entry => {
            const day = entry.entry_time.split('T')[0];
            const dayData = dailyWork.get(day);
            const entryTime = new Date(entry.entry_time);
            if (entry.entry_type === 'INICIO_JORNADA' || entry.entry_type === 'FIM_PAUSA') {
                dayData.lastStart = entryTime;
            } else if ((entry.entry_type === 'INICIO_PAUSA' || entry.entry_type === 'FIM_JORNADA') && dayData.lastStart) {
                dayData.totalSeconds += (entryTime - dayData.lastStart) / 1000;
                dayData.lastStart = null;
            }
        });
        for (const [day, dayData] of dailyWork.entries()) {
            if (day === todayStr && dayData.lastStart) {
                dayData.totalSeconds += (new Date() - dayData.lastStart) / 1000;
                dayData.lastStart = null;
            }
        }
        const result = new Map();
        for (const [day, data] of dailyWork.entries()) {
            result.set(day, data.totalSeconds);
        }
        return result;
    }

    function calculateDailyTicketSeconds(tickets) {
        const dailyTickets = new Map();
        tickets.forEach(ticket => {
            const day = ticket.work_date;
            const currentSeconds = dailyTickets.get(day) || 0;
            dailyTickets.set(day, currentSeconds + ticket.total_seconds);
        });
        return dailyTickets;
    }


    function processAndRenderData(reportData) {
        const { entries, tickets } = reportData;

        const dailyWorkSeconds = calculateDailyWorkSeconds(entries);
        const dailyTicketSeconds = calculateDailyTicketSeconds(tickets);
        const totalWorkSeconds = Array.from(dailyWorkSeconds.values()).reduce((a, b) => a + b, 0);
        const totalTicketsSeconds = Array.from(dailyTicketSeconds.values()).reduce((a, b) => a + b, 0);

        let goalPercentage = 0;
        if (totalWorkSeconds > 0) {
            goalPercentage = (totalTicketsSeconds / totalWorkSeconds) * 100;
        }
        lastProductivityPercentage = goalPercentage;

        // --- LÓGICA DO SALDO DE HORAS (CORRIGIDA) ---
        const today = new Date();
        const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        
        // Se o relatório é de um mês passado, considera o mês inteiro. Senão, considera até o dia de hoje.
        const isCurrentMonth = currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
        const dayLimit = isCurrentMonth ? today.getDate() : lastDayOfMonth;

        let businessDaysSoFar = 0;
        for (let i = 1; i <= dayLimit; i++) {
            const dayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Não é Sábado nem Domingo
                businessDaysSoFar++;
            }
        }
        const expectedSeconds = businessDaysSoFar * 8 * 3600;
        const balanceSeconds = totalWorkSeconds - expectedSeconds;
        // --- FIM DA CORREÇÃO ---

        monthlyHoursEl.textContent = formatSecondsToHHMM(totalWorkSeconds);
        ticketsHoursEl.textContent = formatSecondsToHHMM(totalTicketsSeconds);
        const formattedBalance = formatSecondsToHHMM(balanceSeconds);
        currentBalanceEl.textContent = balanceSeconds >= 0 ? `+${formattedBalance}` : formattedBalance;
        currentBalanceEl.className = `text-2xl font-bold ${balanceSeconds >= 0 ? 'text-green-600' : 'text-red-600'}`;
        productivityPercentage.textContent = `${goalPercentage.toFixed(1)}%`;
        productivityBar.style.width = `${Math.min(goalPercentage, 100)}%`;
        const goalMet = goalPercentage >= 87.5;
        productivityBar.className = `h-2.5 rounded-full ${goalMet ? 'bg-emerald-500' : 'bg-blue-600'}`;
        productivityPercentage.className = `text-2xl font-bold mr-2 ${goalMet ? 'text-emerald-600' : 'text-gray-900'}`;

        ticketsTableBody.innerHTML = '';
        tickets.slice(0, 5).forEach(ticket => {
            const row = `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(ticket.work_date + 'T00:00:00').toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${ticket.ticket_identifier}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${(ticket.total_seconds / 60).toFixed(0)} min</td>
                </tr>
            `;
            ticketsTableBody.innerHTML += row;
        });

        renderDailySummaryChart(dailyWorkSeconds, dailyTicketSeconds);
        renderWorkVsTicketsChart(totalWorkSeconds, totalTicketsSeconds);
    }
    
    // (O resto do arquivo continua igual)
    function renderDailySummaryChart(dailyWorkSeconds, dailyTicketSeconds) {
        if (!dailyCtx) return;
        const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        
        const workHoursData = Array(daysInMonth).fill(0);
        const ticketHoursData = Array(daysInMonth).fill(0);

        dailyWorkSeconds.forEach((seconds, dateStr) => {
            const dayOfMonth = new Date(dateStr + 'T00:00:00').getDate();
            workHoursData[dayOfMonth - 1] = seconds / 3600;
        });

        dailyTicketSeconds.forEach((seconds, dateStr) => {
            const dayOfMonth = new Date(dateStr + 'T00:00:00').getDate();
            ticketHoursData[dayOfMonth - 1] = seconds / 3600;
        });

        const goalData = workHoursData.map(hours => hours * 0.875);

        if (dailySummaryChart) dailySummaryChart.destroy();
        
        dailySummaryChart = new Chart(dailyCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Horas Trabalhadas',
                        data: workHoursData,
                        backgroundColor: '#3b82f6',
                        order: 1
                    },
                    {
                        label: 'Horas em Tickets',
                        data: ticketHoursData,
                        backgroundColor: '#10b981',
                        order: 1
                    },
                    {
                        label: 'Meta de Tickets (87.5%)',
                        data: goalData,
                        type: 'line',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(2) + 'h';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => value.toFixed(1) + 'h' }
                    }
                }
            }
        });
    }
    
    const doughnutTextPlugin = {
        id: 'doughnutText',
        beforeDraw: (chart) => {
            if (chart.config.type !== 'doughnut' || !chart.config.options.plugins.doughnutText) return;
            const { ctx, data } = chart;
            const { text, font, color } = chart.config.options.plugins.doughnutText;
            
            ctx.save();
            const x = (chart.chartArea.left + chart.chartArea.right) / 2;
            const y = (chart.chartArea.top + chart.chartArea.bottom) / 2;
            
            ctx.font = font || 'bold 24px sans-serif';
            ctx.fillStyle = color || '#374151';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x, y);
            ctx.restore();
        }
    };
    Chart.register(doughnutTextPlugin);


    function renderWorkVsTicketsChart(totalWorkSeconds, totalTicketsSeconds) {
        if (!workTicketsCtx) return;
        const workOnlySeconds = totalWorkSeconds - totalTicketsSeconds;
        const data = [workOnlySeconds, totalTicketsSeconds];

        if (workVsTicketsChart) workVsTicketsChart.destroy();
        workVsTicketsChart = new Chart(workTicketsCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Outras Atividades', 'Tempo em Tickets'],
                datasets: [{
                    data,
                    backgroundColor: ['#60a5fa', '#10b981'],
                    borderColor: '#fff',
                    borderWidth: 4,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                         callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if(label) label += ': ';
                                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const value = context.parsed;
                                const percentage = ((value / total) * 100).toFixed(1);
                                label += `${formatSecondsToHHMM(value * 3600)} (${percentage}%)`;
                                return label;
                            }
                        }
                    },
                    doughnutText: {
                        text: `${lastProductivityPercentage.toFixed(1)}%`,
                        font: 'bold 28px Inter, sans-serif',
                        color: '#10b981'
                    }
                }
            }
        });
    }

    // =================================================================
    // INICIALIZAÇÃO E EVENTOS
    // =================================================================
    async function initialize() {
        monthDisplay.textContent = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        nextMonthBtn.disabled = currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear();
        const reportData = await getMonthlyReportData(currentMonth);
        processAndRenderData(reportData);
    }

    prevMonthBtn.addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        initialize();
    });



    nextMonthBtn.addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        initialize();
    });

    initialize();
});