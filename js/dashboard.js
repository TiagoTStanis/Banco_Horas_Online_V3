import {
    getTodaysData,
    addClockEntry,
    updateClockEntryTime,
    addTicket,
    updateTicketTime,
    deleteLastClockEntry
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
    let totalWorkSecondsCache = 0


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
                clockButton.textContent = 'Iniciar Pausa';
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
                clockButton.textContent = 'Encerrar Pausa';
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
        ticketIdEl.textContent = dbTicket.ticket_identifier;
        ticketTimeEl.textContent = formatTimeForDisplay(dbTicket.total_seconds);

        ticketTimeEl.classList.add('cursor-pointer');

        const newTicket = { id: dbTicket.id, ticket_identifier: dbTicket.ticket_identifier, totalSeconds: dbTicket.total_seconds, isActive: false, element: ticketItem, };

        toggleBtn.addEventListener('click', () => toggleTicket(newTicket));
        ticketTimeEl.addEventListener('click', () => handleEditTicketTime(newTicket, ticketTimeEl));

        tickets.push(newTicket);
        ticketsList.prepend(ticketItem); 
        feather.replace();
    };
    function updateAllTotals() {
        let totalWorkMilliseconds = 0; let lastStartTime = null;
        entries.forEach(entry => {
            if (entry.entry_type === 'INICIO_JORNADA' || entry.entry_type === 'FIM_PAUSA') { lastStartTime = entry.time; }
            else if ((entry.entry_type === 'INICIO_PAUSA' || entry.entry_type === 'FIM_JORNADA') && lastStartTime) { totalWorkMilliseconds += entry.time - lastStartTime; lastStartTime = null; }
        });
        if (workdayState === 'WORKING' && lastStartTime) { totalWorkMilliseconds += new Date() - lastStartTime; }

        totalWorkSecondsCache = totalWorkMilliseconds / 1000; // Alterado: atualiza o cache global
        workdayTimer.textContent = formatSeconds(totalWorkSecondsCache);
        const workHours = Math.floor(totalWorkSecondsCache / 3600); const workMinutes = Math.floor((totalWorkSecondsCache % 3600) / 60);
        totalWorkTimeEl.textContent = `${String(workHours).padStart(2, '0')}:${String(workMinutes).padStart(2, '0')}`;
        const workHoursDecimal = totalWorkSecondsCache / 3600;
        if (workHoursDecimal >= 10) { overtimeWarning.textContent = 'Atenção: A jornada de trabalho excedeu o limite de 10 horas.'; overtimeWarning.className = 'p-2 mb-4 bg-red-100 border border-red-300 text-red-800 text-sm rounded-lg'; }
        else if (workHoursDecimal >= 9.5) { overtimeWarning.textContent = 'Atenção: Você está se aproximando do limite de 10 horas de trabalho.'; overtimeWarning.className = 'p-2 mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm rounded-lg'; }
        else { overtimeWarning.className = 'hidden'; }
        const totalTicketSecondsToday = tickets.reduce((acc, ticket) => acc + ticket.totalSeconds, 0);
        const ticketHours = Math.floor(totalTicketSecondsToday / 3600); const ticketMinutes = Math.floor((totalTicketSecondsToday % 3600) / 60);
        totalTicketsTimeEl.textContent = `${String(ticketHours).padStart(2, '0')}:${String(ticketMinutes).padStart(2, '0')}`;
        let goalPercentage = 0; if (totalWorkSecondsCache > 0) { goalPercentage = (totalTicketSecondsToday / totalWorkSecondsCache) * 100; }
        goalPercentageText.textContent = `${goalPercentage.toFixed(1)}%`;
        goalProgressBar.style.width = `${Math.min(goalPercentage, 100)}%`;
        goalProgressBar.className = `h-2.5 rounded-full ${goalPercentage >= 87.5 ? 'bg-emerald-500' : 'bg-blue-600'}`;
        updateWeeklyChart(workHoursDecimal, totalTicketSecondsToday / 3600);
    }
    function updateWeeklyChart(todayWorkHours, todayTicketsHours) {
        if (!weeklyChartCtx) return;
        const todayIndex = (new Date().getDay() + 6) % 7;
        const workHoursData = [0, 0, 0, 0, 0, 0, 0], ticketsTimeData = [0, 0, 0, 0, 0, 0, 0];
        workHoursData[todayIndex] = todayWorkHours; ticketsTimeData[todayIndex] = todayTicketsHours;
        const goalData = workHoursData.map(h => h * 0.875);
        if (weeklyChartInstance) {
            weeklyChartInstance.data.datasets[0].data = workHoursData;
            weeklyChartInstance.data.datasets[1].data = ticketsTimeData;
            weeklyChartInstance.data.datasets[2].data = goalData;
            weeklyChartInstance.update('none');
        } else {
            weeklyChartInstance = new Chart(weeklyChartCtx.getContext('2d'), { type: 'bar', data: { labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], datasets: [{ label: 'Horas Jornada', data: workHoursData, backgroundColor: '#3b82f6', order: 1 }, { label: 'Horas Tickets', data: ticketsTimeData, backgroundColor: '#10b981', order: 1 }, { label: 'Meta (87.5%)', data: goalData, type: 'line', borderColor: '#ef4444', borderWidth: 2, fill: false, pointRadius: 0, order: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: value => value.toFixed(1) + 'h' } } }, plugins: { legend: { position: 'bottom' } } } });
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
    const toggleTicket = (ticket) => {
        if (workdayState !== 'WORKING') { alert('Você precisa estar trabalhando para iniciar um ticket.'); return; }
        ticket.isActive = !ticket.isActive;
        const btn = ticket.element.querySelector('.toggle-ticket-btn'); const icon = ticket.isActive ? 'pause' : 'play';
        btn.innerHTML = `<i data-feather="${icon}" class="w-5 h-5 ${ticket.isActive ? 'text-yellow-600' : 'text-green-600'}"></i>`; feather.replace();
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
        if (mainInterval) clearInterval(mainInterval); // Pausa o contador principal

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

            // VALIDAÇÃO 1: Não pode ser negativo
            if (isNaN(newMinutes) || newMinutes < 0) {
                alert("O valor deve ser um número positivo.");
                timeEl.textContent = formatTimeForDisplay(originalSeconds); // Restaura o valor original
                startMainInterval();
                return;
            }

            const newSeconds = newMinutes * 60;
            const otherTicketsSeconds = tickets
                .filter(t => t.id !== ticket.id)
                .reduce((acc, t) => acc + t.totalSeconds, 0);

            const newTotalTicketSeconds = otherTicketsSeconds + newSeconds;

            // VALIDAÇÃO 2: Tempo total de tickets não pode exceder o tempo trabalhado
            if (newTotalTicketSeconds > totalWorkSecondsCache) {
                alert(`O tempo total de tickets (${formatTimeForDisplay(newTotalTicketSeconds)}) não pode exceder o tempo de jornada trabalhado hoje (${formatTimeForDisplay(totalWorkSecondsCache)}).`);
                timeEl.textContent = formatTimeForDisplay(originalSeconds); // Restaura
                startMainInterval();
                return;
            }

            // Se passou nas validações:
            ticket.totalSeconds = newSeconds;
            timeEl.textContent = formatTimeForDisplay(newSeconds);
            await updateTicketTime(ticket.id, newSeconds); // Salva no banco
            updateAllTotals(); // Atualiza os totais na tela
            startMainInterval(); // Retoma o contador principal
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.removeEventListener('blur', saveTicketChanges); // Evita que o blur salve após o escape
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

    // =================================================================
    // INTERVALO PRINCIPAL E INICIALIZAÇÃO
    // =================================================================
    const startMainInterval = () => {
        if (mainInterval) clearInterval(mainInterval);
        
        if (workdayState !== 'WORKING' && workdayState !== 'ON_BREAK') return;

        let secondsSinceLastSave = 0;
        mainInterval = setInterval(async () => {
            const activeTickets = tickets.filter(t => t.isActive);
            if (workdayState === 'WORKING' && activeTickets.length > 0) { const timeSlice = 1 / activeTickets.length; activeTickets.forEach(ticket => { ticket.totalSeconds += timeSlice; }); }
           
            tickets.forEach(ticket => {
                const timeEl = ticket.element.querySelector('.ticket-time');
                if (timeEl && !timeEl.querySelector('input')) {
                    timeEl.textContent = formatTimeForDisplay(ticket.totalSeconds);
                }
            });

            updateAllTotals(); secondsSinceLastSave++;
            if (secondsSinceLastSave >= 15) {
                secondsSinceLastSave = 0;
                const updatePromises = tickets.filter(t => t.isActive).map(t => updateTicketTime(t.id, t.totalSeconds));
                await Promise.all(updatePromises);
            }
        }, 1000);
    };
    async function initializeDashboard() {
        const todayData = await getTodaysData();
        entries = todayData.entries.map(e => ({ ...e, time: new Date(e.entry_time) }));
        tickets = []; ticketsList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Nenhum ticket adicionado ainda.</div>';
        todayData.tickets.forEach(addTicketToUI);
        recalculateWorkdayState();
        renderEntries();
        updateClockButton();
        updateAllTotals();
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