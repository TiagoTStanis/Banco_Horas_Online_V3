// js/dashboard.js (CORREÇÃO DEFINITIVA)

import { supabase } from './db.js';
import {
    getTodaysData,
    addClockEntry,
    updateClockEntryTime,
    addTicket,
    updateTicketTime,
    deleteLastClockEntry,
    getWeeklySummary,
    deleteTicket,
    startTicketTimer,
    pauseTicketTimer
} from './data-service.js';

document.addEventListener('DOMContentLoaded', async () => {

    // =================================================================
    // REFERÊNCIAS AOS ELEMENTOS DO DOM (INTERFACE)
    // =================================================================
    const clockButton = document.getElementById('clockButton');
    const endWorkdayButtonContainer = clockButton.parentElement;
    const workdayStatus = document.getElementById('workdayStatus');
    const workdayTimer = document.getElementById('workdayTimer');
    const clockEntries = document.getElementById('clockEntries');
    const totalWorkTimeEl = document.getElementById('totalWorkTime');
    const totalTicketsTimeEl = document.getElementById('totalTicketsTime');
    const ticketForm = document.getElementById('ticketForm');
    const ticketIdInput = document.getElementById('ticketId');
    const ticketsList = document.getElementById('ticketsList');
    const ticketTemplate = document.getElementById('ticketItemTemplate');
    const overtimeWarning = document.getElementById('overtimeWarning');
    const goalPercentageText = document.getElementById('goalPercentageText');
    const goalProgressBar = document.getElementById('goalProgressBar');
    const weeklyChartCtx = document.getElementById('weeklyChart');


    // =================================================================
    // ESTADO DA APLICAÇÃO
    // =================================================================
    let workdayState = 'NOT_STARTED';
    let entries = [];
    let tickets = [];
    let mainInterval;
    let weeklyChartInstance = null;
    let totalWorkSecondsCache = 0;
    let userWorkloadHours = 8;
    let weeklySummaryData = { labels: [], workHours: [], ticketsTime: [] };


    // =================================================================
    // FUNÇÕES DE LÓGICA E CÁLCULO
    // =================================================================
    function recalculateWorkdayState() {
        if (entries.length === 0) {
            workdayState = 'NOT_STARTED';
            return;
        }
        const lastEntry = entries[entries.length - 1];
        switch (lastEntry.entry_type) {
            case 'INICIO_JORNADA':
            case 'FIM_PAUSA':
                workdayState = 'WORKING';
                break;
            case 'INICIO_PAUSA':
                workdayState = 'ON_BREAK';
                break;
            case 'FIM_JORNADA':
                workdayState = 'FINISHED';
                if (mainInterval) clearInterval(mainInterval);
                break;
            default:
                workdayState = 'NOT_STARTED';
        }
    }
    const formatTime = (date) => date.toLocaleTimeString('pt-BR');
    const formatSeconds = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };
    const formatTimeForDisplay = (totalSeconds) => `${Math.floor(totalSeconds / 60)} min`;


    // =================================================================
    // FUNÇÕES DE ATUALIZAÇÃO DA INTERFACE (UI)
    // =================================================================
    const updateClockButton = () => {
        let endWorkdayBtn = document.getElementById('endWorkdayBtn');
        if (endWorkdayBtn) endWorkdayBtn.remove();
        let reopenBtn = document.getElementById('reopenWorkdayBtn');
        if (reopenBtn) reopenBtn.remove();

        switch (workdayState) {
            case 'NOT_STARTED':
                clockButton.textContent = 'Iniciar Jornada';
                clockButton.className = 'w-full px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md';
                clockButton.disabled = false;
                workdayStatus.textContent = 'Sua jornada ainda não começou.';
                break;
            case 'WORKING':
                clockButton.textContent = 'Iniciar Intervalo';
                clockButton.className = 'w-full px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg shadow-md';
                clockButton.disabled = false;
                workdayStatus.textContent = 'Você está trabalhando.';
                const endButton = document.createElement('button');
                endButton.id = 'endWorkdayBtn';
                endButton.textContent = 'Encerrar Jornada';
                endButton.className = 'w-full px-8 py-3 mt-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-md';
                endButton.onclick = handleEndWorkday;
                endWorkdayButtonContainer.appendChild(endButton);
                break;
            case 'ON_BREAK':
                clockButton.textContent = 'Encerrar Intervalo';
                clockButton.className = 'w-full px-8 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg shadow-md';
                clockButton.disabled = false;
                workdayStatus.textContent = 'Você está em uma pausa.';
                break;
            case 'FINISHED':
                clockButton.textContent = 'Jornada Encerrada';
                clockButton.disabled = true;
                clockButton.className = 'w-full px-8 py-3 bg-gray-400 text-white font-medium rounded-lg shadow-md cursor-not-allowed';
                workdayStatus.textContent = 'Jornada encerrada por hoje.';
                const reopenButton = document.createElement('button');
                reopenButton.id = 'reopenWorkdayBtn';
                reopenButton.textContent = 'Corrigir Encerramento';
                reopenButton.className = 'w-full px-8 py-3 mt-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg shadow-md';
                reopenButton.onclick = handleReopenWorkday;
                endWorkdayButtonContainer.appendChild(reopenButton);
                break;
        }
    };
    const renderEntries = () => {
        if (entries.length === 0) { clockEntries.innerHTML = '<p class="text-center text-gray-400">Nenhuma marcação ainda.</p>'; return; }
        clockEntries.innerHTML = ''; let pauseCounter = 1;
        entries.forEach((entry) => {
            let entryText = '';
            switch (entry.entry_type) {
                case 'INICIO_JORNADA': entryText = 'Início da Jornada'; break;
                case 'INICIO_PAUSA': entryText = `Início Pausa ${pauseCounter}`; break;
                case 'FIM_PAUSA': entryText = `Fim Pausa ${pauseCounter++}`; break;
                case 'FIM_JORNADA': entryText = 'Fim da Jornada'; break;
            }
            const div = document.createElement('div'); div.className = 'flex justify-between items-center';
            const timeEl = document.createElement('span'); timeEl.className = 'font-semibold cursor-pointer'; timeEl.textContent = formatTime(entry.time);
            div.innerHTML = `<span>${entryText}</span>`; div.appendChild(timeEl); clockEntries.appendChild(div);
            timeEl.addEventListener('click', () => handleEditEntryTime(entry, timeEl));
        });
    };
    const addTicketToUI = (dbTicket) => {
        if (tickets.length === 0) { ticketsList.innerHTML = ''; }
        const ticketNode = document.importNode(ticketTemplate.content, true);
        const ticketItem = ticketNode.querySelector('.ticket-item');
        const ticketIdEl = ticketNode.querySelector('.ticket-id');
        const ticketTimeEl = ticketNode.querySelector('.ticket-time');
        const toggleBtn = ticketNode.querySelector('.toggle-ticket-btn');
        const deleteBtn = ticketNode.querySelector('.delete-ticket-btn'); // Pegar o botão de deletar

        ticketIdEl.textContent = dbTicket.ticket_identifier;
        ticketTimeEl.textContent = formatTimeForDisplay(dbTicket.total_seconds);
        ticketTimeEl.classList.add('cursor-pointer');

        const newTicket = {
            id: dbTicket.id,
            ticket_identifier: dbTicket.ticket_identifier,
            totalSeconds: dbTicket.total_seconds,
            isActive: false,
            element: ticketItem,
        };

        toggleBtn.addEventListener('click', () => toggleTicket(newTicket));
        ticketTimeEl.addEventListener('click', () => handleEditTicketTime(newTicket, ticketTimeEl));
        deleteBtn.addEventListener('click', () => handleDeleteTicket(newTicket)); // Adicionar evento de clique

        tickets.push(newTicket);
        ticketsList.prepend(ticketItem);
        feather.replace();
    };
    function updateAllTotals() {
        let totalWorkMilliseconds = 0;
        let lastStartTime = null;
        entries.forEach(entry => {
            if (entry.entry_type === 'INICIO_JORNADA' || entry.entry_type === 'FIM_PAUSA') {
                lastStartTime = entry.time;
            } else if ((entry.entry_type === 'INICIO_PAUSA' || entry.entry_type === 'FIM_JORNADA') && lastStartTime) {
                totalWorkMilliseconds += entry.time - lastStartTime;
                lastStartTime = null;
            }
        });
        if (workdayState === 'WORKING' && lastStartTime) {
            totalWorkMilliseconds += new Date() - lastStartTime;
        }

        const previousTotalWorkSeconds = totalWorkSecondsCache;
        totalWorkSecondsCache = totalWorkMilliseconds / 1000;

        const timeDelta = totalWorkSecondsCache - previousTotalWorkSeconds;
        const activeTicket = tickets.find(t => t.isActive);

        if (activeTicket && timeDelta > 0) {
            activeTicket.totalSeconds += timeDelta;
            const timeEl = activeTicket.element.querySelector('.ticket-time');
            if (timeEl && !timeEl.querySelector('input')) {
                timeEl.textContent = formatTimeForDisplay(activeTicket.totalSeconds);
            }
        }

        workdayTimer.textContent = formatSeconds(totalWorkSecondsCache);
        const workHours = Math.floor(totalWorkSecondsCache / 3600);
        const workMinutes = Math.floor((totalWorkSecondsCache % 3600) / 60);
        totalWorkTimeEl.textContent = `${String(workHours).padStart(2, '0')}:${String(workMinutes).padStart(2, '0')}`;

        const workHoursDecimal = totalWorkSecondsCache / 3600;

        const contractualLimit = userWorkloadHours;
        const legalMaxLimit = contractualLimit + 2;

        if (workHoursDecimal >= legalMaxLimit) {
            overtimeWarning.textContent = `Atenção: Você excedeu o limite legal de 2 horas extras diárias.`;
            overtimeWarning.className = 'p-2 mb-4 bg-red-100 border border-red-300 text-red-800 text-sm rounded-lg';

        } else if (workHoursDecimal >= contractualLimit) {
            const extraTime = workHoursDecimal - contractualLimit;
            const extraHours = Math.floor(extraTime);
            const extraMinutes = Math.round((extraTime - extraHours) * 60);

            overtimeWarning.textContent = `Você está em horas extras (${extraHours}h ${extraMinutes}m). Lembre-se do limite de 2h extras/dia.`;
            overtimeWarning.className = 'p-2 mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm rounded-lg';

        } else {
            overtimeWarning.className = 'hidden';
        }

        const totalTicketSecondsToday = tickets.reduce((acc, ticket) => acc + ticket.totalSeconds, 0);
        const ticketHours = Math.floor(totalTicketSecondsToday / 3600);
        const ticketMinutes = Math.floor((totalTicketSecondsToday % 3600) / 60);
        totalTicketsTimeEl.textContent = `${String(ticketHours).padStart(2, '0')}:${String(ticketMinutes).padStart(2, '0')}`;

        let goalPercentage = 0;
        if (totalWorkSecondsCache > 0) {
            goalPercentage = (totalTicketSecondsToday / totalWorkSecondsCache) * 100;
        }
        goalPercentageText.textContent = `${goalPercentage.toFixed(1)}%`;
        goalProgressBar.style.width = `${Math.min(goalPercentage, 100)}%`;
        goalProgressBar.className = `h-2.5 rounded-full ${goalPercentage >= 87.5 ? 'bg-emerald-500' : 'bg-blue-600'}`;

        updateWeeklyChart(workHoursDecimal, totalTicketSecondsToday / 3600);
    }
    function updateWeeklyChart(todayWorkHours, todayTicketsHours) {
        if (!weeklyChartCtx) return;

        const workHoursData = [...weeklySummaryData.workHours];
        const ticketsTimeData = [...weeklySummaryData.ticketsTime];
        workHoursData[workHoursData.length - 1] = todayWorkHours;
        ticketsTimeData[ticketsTimeData.length - 1] = todayTicketsHours;

        const goalData = workHoursData.map(h => h * 0.875);

        if (weeklyChartInstance) {
            weeklyChartInstance.data.datasets[0].data = workHoursData;
            weeklyChartInstance.data.datasets[1].data = ticketsTimeData;
            weeklyChartInstance.data.datasets[2].data = goalData;
            weeklyChartInstance.update('none');
        } else {
            const ctx = weeklyChartCtx.getContext('2d');

            const blueGradient = ctx.createLinearGradient(0, 0, 0, 300);
            blueGradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
            blueGradient.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

            const emeraldGradient = ctx.createLinearGradient(0, 0, 0, 300);
            emeraldGradient.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
            emeraldGradient.addColorStop(1, 'rgba(16, 185, 129, 0.3)');

            weeklyChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: weeklySummaryData.labels,
                    datasets: [{
                        label: 'Horas Jornada',
                        data: workHoursData,
                        backgroundColor: blueGradient,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1,
                        order: 1
                    }, {
                        label: 'Horas Tickets',
                        data: ticketsTimeData,
                        backgroundColor: emeraldGradient,
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        order: 1
                    }, {
                        label: 'Meta (87.5%)',
                        data: goalData,
                        type: 'line',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 2,
                        pointBackgroundColor: '#ef4444',
                        tension: 0.3,
                        order: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: value => value.toFixed(1) + 'h' },
                            grid: { color: 'rgba(200, 200, 200, 0.1)' }
                        },
                        x: {
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed.y !== null) {
                                        const totalHours = context.parsed.y;
                                        const hours = Math.floor(totalHours);
                                        const minutes = Math.round((totalHours - hours) * 60);
                                        label += `${hours}h ${minutes}m`;
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // =================================================================
    // MANIPULADORES DE EVENTOS (AÇÕES DO USUÁRIO)
    // =================================================================
    async function handleClockButtonClick() {
        let entryType = null;
        switch (workdayState) { case 'NOT_STARTED': entryType = 'INICIO_JORNADA'; break; case 'WORKING': entryType = 'INICIO_PAUSA'; break; case 'ON_BREAK': entryType = 'FIM_PAUSA'; break; }
        if (entryType) { const newEntry = await addClockEntry(entryType); if (newEntry) { entries.push({ ...newEntry, time: new Date(newEntry.entry_time) }); recalculateWorkdayState(); renderEntries(); updateClockButton(); if (workdayState === 'WORKING' && !mainInterval) { startMainInterval(); } } }
    }
    async function handleEndWorkday() {
        const newEntry = await addClockEntry('FIM_JORNADA'); if (newEntry) { entries.push({ ...newEntry, time: new Date(newEntry.entry_time) }); recalculateWorkdayState(); renderEntries(); updateClockButton(); updateAllTotals(); if (mainInterval) clearInterval(mainInterval); }
    }
    async function handleTicketFormSubmit(e) {
        e.preventDefault(); const ticketIdentifier = ticketIdInput.value.trim();
        const alreadyExists = tickets.some(t => t.ticket_identifier === ticketIdentifier);
        if (!ticketIdentifier || alreadyExists) { if (alreadyExists) alert('Este ticket já foi adicionado.'); return; }
        const newDbTicket = await addTicket(ticketIdentifier); if (newDbTicket) { addTicketToUI(newDbTicket); ticketIdInput.value = ''; }
    }
    const toggleTicket = async (ticket) => {
        if (workdayState !== 'WORKING') {
            alert('Você precisa estar trabalhando para iniciar um ticket.');
            return;
        }

        const isStarting = !ticket.isActive;
        const currentlyActiveTicket = tickets.find(t => t.isActive);

        if (currentlyActiveTicket && currentlyActiveTicket.id !== ticket.id) {
            currentlyActiveTicket.isActive = false;
            await pauseTicketTimer(currentlyActiveTicket.id, currentlyActiveTicket.totalSeconds);
            updateTicketUI(currentlyActiveTicket);
        }

        if (isStarting) {
            ticket.isActive = true;
            await startTicketTimer(ticket.id);
        } else {
            ticket.isActive = false;
            await pauseTicketTimer(ticket.id, ticket.totalSeconds);
        }

        updateTicketUI(ticket);
    };

    const updateTicketUI = (ticket) => {
        const btn = ticket.element.querySelector('.toggle-ticket-btn');
        const icon = ticket.isActive ? 'pause' : 'play';
        btn.innerHTML = `<i data-feather="${icon}" class="w-5 h-5 ${ticket.isActive ? 'text-yellow-600' : 'text-green-600'}"></i>`;
        feather.replace();
    };
    async function handleEditEntryTime(entry, timeEl) {
        if (mainInterval) clearInterval(mainInterval);
        const input = document.createElement('input'); input.type = 'time'; input.value = entry.time.toTimeString().slice(0, 5);
        input.className = 'w-20 text-right bg-gray-200 rounded';
        timeEl.innerHTML = ''; timeEl.appendChild(input); input.focus();
        const saveChanges = async () => {
            const [hours, minutes] = input.value.split(':');
            const newTime = new Date(entry.time); newTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
            const updatedEntry = await updateClockEntryTime(entry.id, newTime); if (updatedEntry) { await initializeDashboard(); }
        };
        input.addEventListener('blur', saveChanges); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    }
    async function handleEditTicketTime(ticket, timeEl) {
        if (mainInterval) clearInterval(mainInterval);

        const originalSeconds = ticket.totalSeconds;
        const originalMinutes = Math.floor(originalSeconds / 60);

        const input = document.createElement('input');
        input.type = 'number';
        input.value = originalMinutes;
        input.min = 0;
        input.className = 'w-20 text-right bg-gray-200 rounded font-semibold text-gray-700';
        timeEl.textContent = '';
        timeEl.appendChild(input);
        input.focus();
        input.select();

        const saveTicketChanges = async () => {
            const newMinutes = parseInt(input.value, 10);

            if (isNaN(newMinutes) || newMinutes < 0) {
                alert("O valor deve ser um número positivo.");
                timeEl.textContent = formatTimeForDisplay(originalSeconds);
                startMainInterval();
                return;
            }

            const newSeconds = newMinutes * 60;
            const otherTicketsSeconds = tickets
                .filter(t => t.id !== ticket.id)
                .reduce((acc, t) => acc + t.totalSeconds, 0);

            const newTotalTicketSeconds = otherTicketsSeconds + newSeconds;

            if (newTotalTicketSeconds > totalWorkSecondsCache) {
                alert(`O tempo total de tickets (${formatTimeForDisplay(newTotalTicketSeconds)}) não pode exceder o tempo de jornada trabalhado hoje (${formatTimeForDisplay(totalWorkSecondsCache)}).`);
                timeEl.textContent = formatTimeForDisplay(originalSeconds);
                startMainInterval();
                return;
            }

            ticket.totalSeconds = newSeconds;
            timeEl.textContent = formatTimeForDisplay(newSeconds);
            await updateTicketTime(ticket.id, newSeconds);
            updateAllTotals();
            startMainInterval();
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.removeEventListener('blur', saveTicketChanges);
                timeEl.textContent = formatTimeForDisplay(originalSeconds);
                startMainInterval();
            }
        };

        input.addEventListener('blur', saveTicketChanges);
        input.addEventListener('keydown', handleKeyDown);
    }
    async function handleReopenWorkday() {
        const confirmed = confirm("Tem certeza que deseja reabrir a jornada? A sua última marcação de ponto ('Fim da Jornada') será removida.");
        if (!confirmed) { return; }
        const result = await deleteLastClockEntry();
        if (result?.success) {
            if (mainInterval) clearInterval(mainInterval);
            await initializeDashboard();
        } else {
            alert("Não foi possível reabrir a jornada. Tente recarregar a página.");
        }
    }
    async function handleDeleteTicket(ticket) {
        const confirmed = confirm(`Tem certeza que deseja deletar o ticket "${ticket.ticket_identifier}"? Esta ação não pode ser desfeita.`);
        if (!confirmed) {
            return;
        }

        const result = await deleteTicket(ticket.id);

        if (result.success) {
            ticket.element.remove();
            tickets = tickets.filter(t => t.id !== ticket.id);
            updateAllTotals();
            if (tickets.length === 0) {
                ticketsList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Nenhum ticket adicionado ainda.</div>';
            }
        } else {
            alert("Não foi possível deletar o ticket. Tente recarregar a página.");
        }
    }

    // =================================================================
    // INTERVALO PRINCIPAL E INICIALIZAÇÃO
    // =================================================================
    const startMainInterval = () => {
        if (mainInterval) clearInterval(mainInterval);
        if (workdayState !== 'WORKING') return;
        mainInterval = setInterval(updateAllTotals, 1000);
    };
    async function initializeDashboard() {
        if (mainInterval) clearInterval(mainInterval);

        const { data: { user } } = await supabase.auth.getUser();

        if (user && user.user_metadata.contractual_workday_hours) {
            userWorkloadHours = user.user_metadata.contractual_workday_hours;
        } else {
            document.getElementById('setupProfileWarning').classList.remove('hidden');
        }

        weeklySummaryData = await getWeeklySummary();

        const todayData = await getTodaysData();
        entries = todayData.entries.map(e => ({ ...e, time: new Date(e.entry_time) }));

        tickets = [];
        ticketsList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Nenhum ticket adicionado ainda.</div>';

        todayData.tickets.forEach(dbTicket => {
            const ticketItem = document.importNode(ticketTemplate.content, true);
            const ticketIdEl = ticketItem.querySelector('.ticket-id');
            const ticketTimeEl = ticketItem.querySelector('.ticket-time');
            const toggleBtn = ticketItem.querySelector('.toggle-ticket-btn');
            const deleteBtn = ticketItem.querySelector('.delete-ticket-btn');

            const ticketObject = {
                id: dbTicket.id,
                ticket_identifier: dbTicket.ticket_identifier,
                totalSeconds: dbTicket.total_seconds,
                active_since: dbTicket.active_since,
                isActive: false,
                element: ticketItem.querySelector('.ticket-item'),
            };

            // Se o ticket estava ativo, calculamos o tempo offline e somamos.
            if (ticketObject.active_since) {
                const startTime = new Date(ticketObject.active_since);
                const now = new Date();
                const elapsedSeconds = (now - startTime) / 1000;
                ticketObject.totalSeconds += elapsedSeconds; // Soma o tempo perdido
                ticketObject.isActive = true;
            }

            ticketIdEl.textContent = ticketObject.ticket_identifier;
            ticketTimeEl.textContent = formatTimeForDisplay(ticketObject.totalSeconds);
            toggleBtn.addEventListener('click', () => toggleTicket(ticketObject));
            deleteBtn.addEventListener('click', () => handleDeleteTicket(ticketObject));
            ticketTimeEl.addEventListener('click', () => handleEditTicketTime(ticketObject, ticketTimeEl));

            tickets.push(ticketObject);
            ticketsList.prepend(ticketObject.element);

            if (ticketObject.isActive) {
                updateTicketUI(ticketObject);
            }
        });

        feather.replace();
        recalculateWorkdayState();
        renderEntries();
        updateClockButton();

        // Calculamos o tempo total de jornada uma vez para inicializar o cache.
        // Isso evita que o primeiro "timeDelta" seja gigante e duplique a contagem.
        let initialWorkMs = 0;
        let lastStartTime = null;
        entries.forEach(entry => {
            if (entry.entry_type === 'INICIO_JORNADA' || entry.entry_type === 'FIM_PAUSA') {
                lastStartTime = entry.time;
            } else if ((entry.entry_type === 'INICIO_PAUSA' || entry.entry_type === 'FIM_JORNADA') && lastStartTime) {
                initialWorkMs += entry.time - lastStartTime;
                lastStartTime = null;
            }
        });
        if (workdayState === 'WORKING' && lastStartTime) {
            initialWorkMs += new Date() - lastStartTime;
        }
        totalWorkSecondsCache = initialWorkMs / 1000; // Prepara o cache

        updateAllTotals(); // Agora a primeira chamada é segura

        if (workdayState === 'WORKING' || workdayState === 'ON_BREAK') {
            startMainInterval();
        }
    }

    // =================================================================
    // EXECUÇÃO INICIAL
    // =================================================================
    clockButton.addEventListener('click', handleClockButtonClick);
    ticketForm.addEventListener('submit', handleTicketFormSubmit);
    await initializeDashboard();
});