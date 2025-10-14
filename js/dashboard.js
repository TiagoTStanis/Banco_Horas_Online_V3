// js/dashboard.js (CORREÇÃO DEFINITIVA)

import { supabase } from './db.js';
import {
    getDataForDate, // MODIFICADO: Nome da função
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
    const dateNavPrev = document.getElementById('date-nav-prev');
    const dateNavNext = document.getElementById('date-nav-next');
    const dateDisplay = document.getElementById('date-display');


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
    let currentlyViewingDate = new Date();


    // =================================================================
    // FUNÇÕES DE LÓGICA E CÁLCULO
    // =================================================================
    const isToday = (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };
    const isYesterday = (date) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return date.getDate() === yesterday.getDate() &&
            date.getMonth() === yesterday.getMonth() &&
            date.getFullYear() === yesterday.getFullYear();
    };
    // ADICIONADO: Verifica se o dia de trabalho está incompleto (ímpar)
    const isWorkdayIncomplete = () => entries.length > 0 && entries.length % 2 !== 0;

    function recalculateWorkdayState() {
        if (!isToday(currentlyViewingDate)) {
            if (isWorkdayIncomplete()) {
                workdayState = 'INCOMPLETE'; // Estado especial para dias passados incompletos
            } else if (entries.length === 0) {
                workdayState = 'NOT_STARTED';
            } else {
                workdayState = 'FINISHED';
            }
            return;
        }

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
    function updateDateDisplay() {
        if (isToday(currentlyViewingDate)) {
            dateDisplay.textContent = 'Hoje';
            dateNavNext.disabled = true;
        } else if (isYesterday(currentlyViewingDate)) {
            dateDisplay.textContent = 'Ontem';
            dateNavNext.disabled = false;
        } else {
            dateDisplay.textContent = currentlyViewingDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            dateNavNext.disabled = false;
        }
    }

    // MODIFICADO: Lógica de habilitar/desabilitar controles foi refinada
    function updateControlsForViewingDate() {
        const isViewingToday = isToday(currentlyViewingDate);

        // Controles que são SEMPRE desabilitados em dias passados
        ticketForm.querySelector('input').disabled = !isViewingToday;
        ticketForm.querySelector('button').disabled = !isViewingToday;
        document.querySelectorAll('.toggle-ticket-btn').forEach(el => {
            el.style.pointerEvents = isViewingToday ? 'auto' : 'none';
            el.style.opacity = isViewingToday ? '1' : '0.6';
        });

        // Controles que podem ser editados em dias passados (como deletar ticket ou editar horários)
        document.querySelectorAll('.delete-ticket-btn, .ticket-time, .font-semibold.cursor-pointer').forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
        });

        if (isViewingToday) {
            updateClockButton(); // Lógica completa do botão para o dia atual
        } else {
            // Lógica simplificada para dias passados
            let endWorkdayBtn = document.getElementById('endWorkdayBtn');
            if (endWorkdayBtn) endWorkdayBtn.remove();
            let reopenBtn = document.getElementById('reopenWorkdayBtn');
            if (reopenBtn) reopenBtn.remove();

            clockButton.disabled = true;
            clockButton.className = 'w-full px-8 py-3 bg-gray-400 text-white font-medium rounded-lg shadow-md cursor-not-allowed';

            if (workdayState === 'INCOMPLETE') {
                clockButton.textContent = 'Jornada Incompleta';
                workdayStatus.textContent = 'Faltou uma marcação de ponto neste dia.';
            } else if (entries.length > 0) {
                clockButton.textContent = 'Visualizando Jornada';
                workdayStatus.textContent = 'Jornada encerrada neste dia.';
            } else {
                clockButton.textContent = 'Sem Registros';
                workdayStatus.textContent = 'Nenhuma marcação de ponto neste dia.';
            }
        }
    }


    const updateClockButton = () => {
        if (!isToday(currentlyViewingDate)) return;

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

    // MODIFICADO: Adiciona o botão de correção se necessário
    const renderEntries = () => {
        clockEntries.innerHTML = ''; // Limpa antes de renderizar

        if (entries.length === 0) {
            clockEntries.innerHTML = '<p class="text-center text-gray-400">Nenhuma marcação ainda.</p>';
            return;
        }

        let pauseCounter = 1;
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

        // Lógica para adicionar o botão de correção
        if (workdayState === 'INCOMPLETE') {
            const correctionButton = document.createElement('button');
            correctionButton.textContent = 'Adicionar Marcação para Corrigir';
            correctionButton.className = 'w-full text-sm mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg';
            correctionButton.onclick = handleCorrection;
            clockEntries.appendChild(correctionButton);
        }
    };

    const addTicketToUI = (dbTicket) => {
        if (tickets.length === 0) { ticketsList.innerHTML = ''; }
        const ticketNode = document.importNode(ticketTemplate.content, true);
        const ticketItem = ticketNode.querySelector('.ticket-item');
        const ticketIdEl = ticketNode.querySelector('.ticket-id');
        const ticketTimeEl = ticketNode.querySelector('.ticket-time');
        const toggleBtn = ticketNode.querySelector('.toggle-ticket-btn');
        const deleteBtn = ticketNode.querySelector('.delete-ticket-btn');

        ticketIdEl.textContent = dbTicket.ticket_identifier;

        // ==================== INÍCIO DA LÓGICA ADICIONADA ====================

        let initialTotalSeconds = dbTicket.total_seconds;
        const isCurrentlyActive = dbTicket.active_since !== null;

        // Se o ticket estava ativo, calculamos o tempo que passou "offline".
        if (isCurrentlyActive) {
            // Garante que o formato da data seja compatível, trocando o espaço por 'T'.
            const isoTimestamp = String(dbTicket.active_since).replace(' ', 'T');
            const startTime = new Date(isoTimestamp);
            const now = new Date();

            // Verifica se a data foi lida corretamente antes de calcular.
            if (!isNaN(startTime)) {
                const elapsedSeconds = (now - startTime) / 1000;
                if (elapsedSeconds > 0) {
                    initialTotalSeconds += elapsedSeconds; // Soma o tempo perdido.
                }
            } else {
                console.error("Formato de data 'active_since' inválido:", dbTicket.active_since);
            }
        }

        // O tempo exibido inicialmente já inclui o tempo offline calculado.
        ticketTimeEl.textContent = formatTimeForDisplay(initialTotalSeconds);

        // ===================== FIM DA LÓGICA ADICIONADA ======================

        ticketTimeEl.classList.add('cursor-pointer');

        const newTicket = {
            id: dbTicket.id,
            ticket_identifier: dbTicket.ticket_identifier,
            // O objeto do ticket é criado com o tempo já corrigido.
            totalSeconds: initialTotalSeconds,
            isActive: isCurrentlyActive,
            element: ticketItem,
        };

        toggleBtn.addEventListener('click', () => toggleTicket(newTicket));
        ticketTimeEl.addEventListener('click', () => handleEditTicketTime(newTicket, ticketTimeEl));
        deleteBtn.addEventListener('click', () => handleDeleteTicket(newTicket));

        tickets.push(newTicket);
        ticketsList.prepend(ticketItem);

        if (newTicket.isActive) {
            updateTicketUI(newTicket);
        }

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

        if (isToday(currentlyViewingDate) && workdayState === 'WORKING' && lastStartTime) {
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

        if (isToday(currentlyViewingDate)) {
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

        if (isToday(currentlyViewingDate)) {
            updateWeeklyChart(workHoursDecimal, totalTicketSecondsToday / 3600);
        }
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

        const currentlyActiveTicket = tickets.find(t => t.isActive);
        const isPausingCurrent = currentlyActiveTicket && currentlyActiveTicket.id === ticket.id;
        const isStartingNew = !isPausingCurrent;

        // PRIMEIRO: Pausa e SALVA qualquer ticket que esteja ativo
        if (currentlyActiveTicket) {
            currentlyActiveTicket.isActive = false;
            // Força a atualização dos totais uma última vez para garantir o valor mais recente
            updateAllTotals();
            await pauseTicketTimer(currentlyActiveTicket.id, currentlyActiveTicket.totalSeconds);
            updateTicketUI(currentlyActiveTicket);
        }

        // SEGUNDO: Inicia o novo ticket, se necessário
        if (isStartingNew) {
            ticket.isActive = true;
            await startTicketTimer(ticket.id);
            updateTicketUI(ticket);
        }

        // Garante que a interface reflita o estado final
        updateAllTotals();
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
            const updatedEntry = await updateClockEntryTime(entry.id, newTime); if (updatedEntry) { await loadDashboardForDate(currentlyViewingDate); }
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
            await loadDashboardForDate(new Date());
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
    async function navigateToPreviousDay() {
        currentlyViewingDate.setDate(currentlyViewingDate.getDate() - 1);
        await loadDashboardForDate(currentlyViewingDate);
    }
    async function navigateToNextDay() {
        if (isToday(currentlyViewingDate)) return;
        currentlyViewingDate.setDate(currentlyViewingDate.getDate() + 1);
        await loadDashboardForDate(currentlyViewingDate);
    }

    // ADICIONADO: Função para lidar com a correção
    async function handleCorrection() {
        const lastEntry = entries[entries.length - 1];
        let nextEntryType = 'FIM_JORNADA'; // Padrão

        if (lastEntry.entry_type === 'INICIO_JORNADA' || lastEntry.entry_type === 'FIM_PAUSA') {
            const userChoice = confirm(`A última marcação foi '${lastEntry.entry_type}'.\n\nClique em 'OK' para adicionar um 'FIM DE JORNADA'.\nClique em 'Cancelar' para adicionar um 'INÍCIO DE PAUSA'.`);
            nextEntryType = userChoice ? 'FIM_JORNADA' : 'INICIO_PAUSA';
        } else { // INICIO_PAUSA
            nextEntryType = 'FIM_PAUSA';
        }

        const timeInput = prompt(`Digite o horário (HH:MM) para a marcação '${nextEntryType}':`, "18:00");
        if (!timeInput || !/^\d{2}:\d{2}$/.test(timeInput)) {
            alert("Formato de hora inválido. Use HH:MM.");
            return;
        }

        const [hours, minutes] = timeInput.split(':');
        const newTimestamp = new Date(currentlyViewingDate);
        newTimestamp.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        // Validação para garantir que a nova marcação é posterior à última
        if (newTimestamp <= lastEntry.time) {
            alert("O horário da nova marcação deve ser posterior à última marcação existente.");
            return;
        }

        const newEntry = await addClockEntry(nextEntryType, newTimestamp);
        if (newEntry) {
            await loadDashboardForDate(currentlyViewingDate); // Recarrega os dados do dia
        } else {
            alert("Falha ao adicionar a marcação de correção.");
        }
    }


    // =================================================================
    // INTERVALO PRINCIPAL E INICIALIZAÇÃO
    // =================================================================
    const startMainInterval = () => {
        if (mainInterval) clearInterval(mainInterval);
        if (workdayState !== 'WORKING' || !isToday(currentlyViewingDate)) return;
        mainInterval = setInterval(updateAllTotals, 1000);
    };

    async function loadDashboardForDate(date) {
        if (mainInterval) clearInterval(mainInterval);

        const { data: { user } } = await supabase.auth.getUser();

        if (user && user.user_metadata.contractual_workday_hours) {
            userWorkloadHours = user.user_metadata.contractual_workday_hours;
        } else {
            if (isToday(date)) {
                document.getElementById('setupProfileWarning').classList.remove('hidden');
            }
        }

        weeklySummaryData = await getWeeklySummary();

        const dataForDate = await getDataForDate(date);
        entries = dataForDate.entries.map(e => ({ ...e, time: new Date(e.entry_time) }));

        tickets = [];
        ticketsList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Nenhum ticket adicionado ainda.</div>';

        dataForDate.tickets.forEach(dbTicket => {
            addTicketToUI(dbTicket);
        });

        feather.replace();
        recalculateWorkdayState();
        renderEntries(); // Renderiza as marcações e o botão de correção, se necessário
        updateDateDisplay();

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
        if (isToday(date) && workdayState === 'WORKING' && lastStartTime) {
            initialWorkMs += new Date() - lastStartTime;
        }
        totalWorkSecondsCache = initialWorkMs / 1000;

        updateAllTotals();
        updateControlsForViewingDate(); // Atualiza os botões com base na data

        if (isToday(date) && (workdayState === 'WORKING' || workdayState === 'ON_BREAK')) {
            startMainInterval();
        }
    }

    // =================================================================
    // EXECUÇÃO INICIAL
    // =================================================================
    clockButton.addEventListener('click', handleClockButtonClick);
    ticketForm.addEventListener('submit', handleTicketFormSubmit);
    dateNavPrev.addEventListener('click', navigateToPreviousDay);
    dateNavNext.addEventListener('click', navigateToNextDay);

    await loadDashboardForDate(currentlyViewingDate);
});