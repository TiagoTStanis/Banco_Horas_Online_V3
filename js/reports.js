// js/reports.js - VERSÃO COMPLETA E CORRIGIDA PARA CÁLCULO COM FUSO HORÁRIO

import { getMonthlyReportData } from './data-service.js';
import { supabase } from './db.js';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // ESTADO E REFERÊNCIAS DO DOM
    // =================================================================
    let currentMonth = new Date();
    let dailySummaryChart = null;
    let workVsTicketsChart = null;
    let lastProductivityPercentage = 0;
    let allMonthTickets = [];
    
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
    const dailyTicketsCard = document.getElementById('dailyTicketsCard');
    const dailyTicketsTitle = document.getElementById('dailyTicketsTitle');
    const dailyTicketsContent = document.getElementById('dailyTicketsContent');
    const closeDailyTicketsBtn = document.getElementById('closeDailyTickets');

    // =================================================================
    // FUNÇÕES AUXILIARES
    // =================================================================

    // FUNÇÃO AUXILIAR PARA CORRIGIR O FUSO HORÁRIO NO CÁLCULO
    function getLocalDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

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

        // Garante que todos os dias do mês tenham uma entrada no mapa para evitar furos
        const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            dailyWork.set(getLocalDateKey(date), { totalSeconds: 0, lastStart: null });
        }

        entries.forEach(entry => {
            // LINHA MODIFICADA: Usa a função auxiliar para obter o dia no fuso horário local
            const day = getLocalDateKey(new Date(entry.entry_time));
            
            const dayData = dailyWork.get(day);
            if (!dayData) return; // Se por algum motivo o dia não existir no mapa, ignora

            const entryTime = new Date(entry.entry_time);
            if (entry.entry_type === 'INICIO_JORNADA' || entry.entry_type === 'FIM_PAUSA') {
                dayData.lastStart = entryTime;
            } else if ((entry.entry_type === 'INICIO_PAUSA' || entry.entry_type === 'FIM_JORNADA') && dayData.lastStart) {
                dayData.totalSeconds += (entryTime - dayData.lastStart) / 1000;
                dayData.lastStart = null;
            }
        });

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

    async function processAndRenderData(reportData) {
        const { data: { user } } = await supabase.auth.getUser();
        const contractualWorkday = user?.user_metadata?.contractual_workday_hours || 8;

        const { entries, tickets } = reportData;
        allMonthTickets = tickets;

        const dailyWorkSeconds = calculateDailyWorkSeconds(entries);
        const dailyTicketSeconds = calculateDailyTicketSeconds(tickets);
        const totalWorkSeconds = Array.from(dailyWorkSeconds.values()).reduce((a, b) => a + b, 0);
        const totalTicketsSeconds = Array.from(dailyTicketSeconds.values()).reduce((a, b) => a + b, 0);

        let goalPercentage = 0;
        if (totalWorkSeconds > 0) {
            goalPercentage = (totalTicketsSeconds / totalWorkSeconds) * 100;
        }
        lastProductivityPercentage = goalPercentage;

        const today = new Date();
        const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        const isCurrentMonth = currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
        const dayLimit = isCurrentMonth ? today.getDate() : lastDayOfMonth;

        let businessDaysSoFar = 0;
        for (let i = 1; i <= dayLimit; i++) {
            const dayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                businessDaysSoFar++;
            }
        }

        const expectedSeconds = businessDaysSoFar * contractualWorkday * 3600;
        const balanceSeconds = totalWorkSeconds - expectedSeconds;

        monthlyHoursEl.textContent = formatSecondsToHHMM(totalWorkSeconds);
        ticketsHoursEl.textContent = formatSecondsToHHMM(totalTicketsSeconds);
        const formattedBalance = formatSecondsToHHMM(balanceSeconds);
        currentBalanceEl.textContent = balanceSeconds >= 0 ? `+${formattedBalance}` : formattedBalance;
        currentBalanceEl.className = `text-3xl font-bold mt-1 ${balanceSeconds >= 0 ? 'text-green-600' : 'text-red-600'}`;
        productivityPercentage.textContent = `${goalPercentage.toFixed(1)}%`;
        productivityBar.style.width = `${Math.min(goalPercentage, 100)}%`;
        const goalMet = goalPercentage >= 87.5;
        productivityBar.className = `h-2.5 rounded-full ${goalMet ? 'bg-emerald-500' : 'bg-blue-600'}`;
        productivityPercentage.className = `text-2xl font-bold mr-3 ${goalMet ? 'text-emerald-600' : 'text-gray-900'}`;

        ticketsTableBody.innerHTML = '';
        tickets.slice(0, 5).forEach(ticket => {
            const row = `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(ticket.work_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${ticket.ticket_identifier}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatSecondsToHHMM(ticket.total_seconds)}</td>
                </tr>
            `;
            ticketsTableBody.innerHTML += row;
        });

        renderDailySummaryChart(dailyWorkSeconds, dailyTicketSeconds);
        renderWorkVsTicketsChart(totalWorkSeconds, totalTicketsSeconds);
    }

    // =================================================================
    // FUNÇÕES DE RENDERIZAÇÃO DE GRÁFICOS E UI
    // =================================================================
    function showTicketsForDay(dayIndex) {
        const day = dayIndex + 1;
        const targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const targetDateString = getLocalDateKey(targetDate);

        const ticketsForDay = allMonthTickets.filter(ticket => ticket.work_date === targetDateString);

        dailyTicketsTitle.textContent = `Tickets do Dia ${targetDate.toLocaleDateString('pt-BR')}`;

        if (ticketsForDay.length > 0) {
            let contentHtml = '<ul class="divide-y divide-gray-200">';
            ticketsForDay.forEach(ticket => {
                contentHtml += `
                    <li class="py-3 flex justify-between items-center text-sm">
                        <span class="font-medium text-gray-800">${ticket.ticket_identifier}</span>
                        <span class="text-gray-500">${formatSecondsToHHMM(ticket.total_seconds)}</span>
                    </li>
                `;
            });
            contentHtml += '</ul>';
            dailyTicketsContent.innerHTML = contentHtml;
        } else {
            dailyTicketsContent.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">Nenhum ticket registrado para este dia.</p>';
        }

        dailyTicketsCard.classList.remove('hidden');
        dailyTicketsCard.classList.add('fade-in');
    }

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

        const ctx = dailyCtx.getContext('2d');

        const blueGradient = ctx.createLinearGradient(0, 0, 0, 300);
        blueGradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
        blueGradient.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

        const emeraldGradient = ctx.createLinearGradient(0, 0, 0, 300);
        emeraldGradient.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
        emeraldGradient.addColorStop(1, 'rgba(16, 185, 129, 0.3)');

        dailySummaryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Horas Trabalhadas', data: workHoursData, backgroundColor: blueGradient, borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1, order: 1 },
                    { label: 'Horas em Tickets', data: ticketHoursData, backgroundColor: emeraldGradient, borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 1, order: 1 },
                    { label: 'Meta de Tickets (87.5%)', data: goalData, type: 'line', borderColor: '#ef4444', borderWidth: 2, fill: false, pointRadius: 0, tension: 0.3, order: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => { if (elements.length > 0) { showTicketsForDay(elements[0].index); } },
                onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}h` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: (v) => v.toFixed(1) + 'h' }, grid: { color: 'rgba(200, 200, 200, 0.1)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
    
    // ========================================================================
    // INÍCIO DO CÓDIGO RESTAURADO
    // Este plugin desenha o texto no centro do gráfico de pizza.
    // ========================================================================
    const doughnutTextPlugin = {
        id: 'doughnutText',
        beforeDraw: (chart) => {
            if (chart.config.type !== 'doughnut' || !chart.config.options.plugins.doughnutText) return;
            const { ctx } = chart;
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
    // ========================================================================
    // FIM DO CÓDIGO RESTAURADO
    // ========================================================================

    function renderWorkVsTicketsChart(totalWorkSeconds, totalTicketsSeconds) {
        if (!workTicketsCtx) return;
        const workOnlySeconds = Math.max(0, totalWorkSeconds - totalTicketsSeconds);
        const data = [workOnlySeconds, totalTicketsSeconds];

        if (workVsTicketsChart) workVsTicketsChart.destroy();
        workVsTicketsChart = new Chart(workTicketsCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Outras Atividades', 'Tempo em Tickets'],
                datasets: [{ data, backgroundColor: ['#60a5fa', '#10b981'], borderColor: '#fff', borderWidth: 4, cutout: '75%' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c) => `${c.label}: ${formatSecondsToHHMM(c.parsed)}` } },
                    doughnutText: {
                        text: `${lastProductivityPercentage.toFixed(1)}%`,
                        font: 'bold 28px Inter, sans-serif',
                        color: lastProductivityPercentage >= 87.5 ? '#10b981' : '#1f2937'
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
        dailyTicketsCard.classList.add('hidden');
        const reportData = await getMonthlyReportData(currentMonth);
        await processAndRenderData(reportData);
    }

    prevMonthBtn.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); initialize(); });
    nextMonthBtn.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); initialize(); });
    closeDailyTicketsBtn.addEventListener('click', () => { dailyTicketsCard.classList.add('hidden'); });

    initialize();
});