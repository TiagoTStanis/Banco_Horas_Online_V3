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

        const todayKey = getLocalDateKey(new Date());
        if (dailyWork.has(todayKey)) {
            const todayData = dailyWork.get(todayKey);
            if (todayData.lastStart) {
                todayData.totalSeconds += (new Date() - todayData.lastStart) / 1000;
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
        const now = new Date();

        tickets.forEach(ticket => {
            const day = ticket.work_date;
            const currentSeconds = dailyTickets.get(day) || 0;

            // 🔹 Se o ticket já tem total_seconds, usa normalmente
            if (ticket.total_seconds !== null && ticket.total_seconds !== undefined) {
                dailyTickets.set(day, currentSeconds + ticket.total_seconds);
            }

            // 🔹 Novo: se o ticket está em andamento (sem fim), calcula até agora
            else if (ticket.start_time && !ticket.end_time) {
                const startTime = new Date(ticket.start_time);
                if (!isNaN(startTime)) {
                    const liveSeconds = Math.floor((now - startTime) / 1000);
                    dailyTickets.set(day, currentSeconds + liveSeconds);
                }
            }
        });

        return dailyTickets;
    }

    async function processAndRenderData(reportData) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const contractualWorkday = user?.user_metadata?.contractual_workday_hours || 8;

        const workHours = Math.floor(contractualWorkday);
        const workMinutes = Math.round((contractualWorkday % 1) * 100);
        const secondsPerDay = (workHours * 3600) + (workMinutes * 60);

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
        const isCurrentMonth =
            currentMonth.getMonth() === today.getMonth() &&
            currentMonth.getFullYear() === today.getFullYear();
        const dayLimit = isCurrentMonth ? today.getDate() : lastDayOfMonth;

        let businessDaysSoFar = 0;

        for (let i = 1; i <= dayLimit; i++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            const dateKey = getLocalDateKey(date);

            // Verifica se há qualquer registro de trabalho nesse dia
            const workedOnDay = Array.from(dailyWorkSeconds.keys()).includes(dateKey) &&
                dailyWorkSeconds.get(dateKey) > 0;

            // Verifica se é feriado
            const { data: holiday } = await supabase
                .from('holidays')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', dateKey)
                .single();

            // Condições:
            // - Conta se for dia útil sem feriado
            // - Conta se for feriado ou fim de semana, mas houve trabalho
            if (
                ((date.getDay() !== 0 && date.getDay() !== 6) && !holiday) ||
                workedOnDay
            ) {
                businessDaysSoFar++;
            }
        }

        let expectedSeconds = 0;

        for (let i = 1; i <= dayLimit; i++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            const dateKey = getLocalDateKey(date);

            const workedSeconds = dailyWorkSeconds.get(dateKey) || 0;

            // Verifica feriado
            const { data: holiday } = await supabase
                .from('holidays')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', dateKey)
                .maybeSingle();

            const isBusinessDay = (date.getDay() !== 0 && date.getDay() !== 6) && !holiday;

            // ➤ Se é dia útil e não feriado → gera horas esperadas
            if (!holiday && date.getDay() !== 0 && date.getDay() !== 6) {
                expectedSeconds += secondsPerDay;
            }

            // ➤ Se trabalhou acima da jornada em qualquer dia (inclusive feriado) → conta como extra
            if (workedSeconds > secondsPerDay) {
                expectedSeconds += workedSeconds - secondsPerDay;
            }
        }
        const balanceSeconds = totalWorkSeconds - expectedSeconds;

        // === DIAGNÓSTICO DETALHADO DE HORAS POR DIA ===
        console.log("=== DIAGNÓSTICO DE HORAS POR DIA ===");

        const detailedReport = [];

        for (let i = 1; i <= dayLimit; i++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            const dateKey = getLocalDateKey(date);

            const workedSeconds = dailyWorkSeconds.get(dateKey) || 0;

            // Verifica se é feriado
            const { data: holiday } = await supabase
                .from('holidays')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', dateKey)
                .maybeSingle();

            const isBusinessDay = (date.getDay() !== 0 && date.getDay() !== 6) && !holiday;

            // Só analisar dias que contam como esperados ou que tiveram trabalho
            if (isBusinessDay || workedSeconds > 0 || holiday) {
                const expectedSeconds = (!holiday && date.getDay() !== 0 && date.getDay() !== 6)
                    ? secondsPerDay
                    : 0;

                const diffSeconds = workedSeconds - expectedSeconds;

                detailedReport.push({
                    date: dateKey,
                    feriado: !!holiday,
                    worked: formatSecondsToHHMM(workedSeconds),
                    expected: formatSecondsToHHMM(expectedSeconds),
                    difference: formatSecondsToHHMM(diffSeconds)
                });
            }
        }

        console.table(detailedReport);

        // Totais
        const totalWorked = detailedReport.reduce((sum, d) => sum + (d.worked.includes('-') ? 0 : (parseInt(d.worked.split(':')[0]) * 3600 + parseInt(d.worked.split(':')[1]) * 60)), 0);
        const totalExpected = detailedReport.length * secondsPerDay;
        const finalDiff = totalWorked - totalExpected;

        console.log("=== RESUMO FINAL ===");
        console.log(`Dias contabilizados: ${detailedReport.length}`);
        console.log(`Horas Trabalhadas: ${formatSecondsToHHMM(totalWorked)}`);
        console.log(`Horas Esperadas: ${formatSecondsToHHMM(totalExpected)}`);
        console.log(`Saldo Final: ${formatSecondsToHHMM(finalDiff)}`);
        console.log(`🕒 Jornada contratual usada: ${contractualWorkday} horas/dia (${secondsPerDay / 3600}h)`);
        console.log("========================");

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

        const productiveHours = Array(daysInMonth).fill(0); // Tickets
        const nonProductiveHours = Array(daysInMonth).fill(0); // Trabalho sem tickets
        const goalData = Array(daysInMonth).fill(0); // Meta (linha 87.5%)

        dailyWorkSeconds.forEach((totalWorkSec, dateStr) => {
            const day = new Date(dateStr + 'T00:00:00').getDate() - 1;
            const ticketsSec = dailyTicketSeconds.get(dateStr) || 0;
            productiveHours[day] = ticketsSec / 3600;
            nonProductiveHours[day] = Math.max((totalWorkSec - ticketsSec) / 3600, 0);
            goalData[day] = (totalWorkSec / 3600) * 0.875; // 87.5% da jornada
        });

        if (dailySummaryChart) dailySummaryChart.destroy();

        const ctx = dailyCtx.getContext('2d');

        // 🎨 Gradiente verde (Tempo em Tickets)
        const productiveGradient = ctx.createLinearGradient(0, 0, 0, 300);
        productiveGradient.addColorStop(0, 'rgba(16, 185, 129, 0.9)'); // #10b981 forte
        productiveGradient.addColorStop(1, 'rgba(16, 185, 129, 0.15)'); // suave

        // 🎨 Gradiente azul (Outras atividades)
        const nonProductiveGradient = ctx.createLinearGradient(0, 0, 0, 300);
        nonProductiveGradient.addColorStop(0, 'rgba(96, 165, 250, 0.9)'); // #60a5fa forte
        nonProductiveGradient.addColorStop(1, 'rgba(96, 165, 250, 0.15)'); // suave

        dailySummaryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Tempo em Tickets',
                        data: productiveHours,
                        backgroundColor: productiveGradient,
                        borderColor: '#10b981',
                        stack: 'Stack 0',
                        borderWidth: 1
                    },
                    {
                        label: 'Outras atividades',
                        data: nonProductiveHours,
                        backgroundColor: nonProductiveGradient,
                        borderColor: '#60a5fa',
                        stack: 'Stack 0',
                        borderWidth: 1
                    },
                    {
                        label: 'Meta de 87.5%',
                        data: goalData,
                        type: 'line',
                        borderColor: '#ef4444',  // Vermelho padrão Tailwind
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return value + 'h';
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                animation: {
                    onComplete: function () {
                        const chart = this.chart;
                        // 🛡️ Proteções completas
                        if (!chart || !chart.ctx || !chart.config || chart.config.type !== 'bar') return;
                        if (!chart.data || !chart.data.datasets) return;

                        const ctx = chart.ctx;

                        ctx.save();
                        ctx.font = 'bold 10px sans-serif';
                        ctx.fillStyle = '#333';

                        chart.data.datasets.forEach((dataset, i) => {
                            // Só desenha texto em barras (ignora linha/meta)
                            if (dataset.type !== 'bar') return;

                            const meta = chart.getDatasetMeta(i);
                            if (!meta || !meta.data) return;

                            meta.data.forEach((bar, index) => {
                                const value = dataset.data[index];

                                if (value > 0 && bar && bar.x !== undefined && bar.y !== undefined) {
                                    ctx.fillText(
                                        value.toFixed(1) + 'h',
                                        bar.x - 10,
                                        bar.y - 6
                                    );
                                }
                            });
                        });

                        ctx.restore();
                    }
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
