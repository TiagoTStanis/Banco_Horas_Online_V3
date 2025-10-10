// Importamos o cliente supabase já inicializado em db.js
import { supabase } from './db.js';

/**
 * Retorna uma string 'YYYY-MM-DD' baseada na data local do usuário.
 * @param {Date} date - O objeto de data a ser formatado.
 */
function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// =================================================================
// FUNÇÕES "GET" (BUSCAR DADOS)
// =================================================================

export async function getTodaysData() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { entries: [], tickets: [] };

    // CORREÇÃO: Usar a função getLocalDateKey para pegar a data de hoje corretamente.
    const today = getLocalDateKey(new Date());

    const { data: entries, error: entriesError } = await supabase
        .from('clock_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('entry_time', `${today}T00:00:00Z`) // Simplificado para o início do dia UTC
        .lte('entry_time', `${today}T23:59:59Z`); // Simplificado para o fim do dia UTC

    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', user.id)
        .eq('work_date', today);

    if (entriesError) console.error('Erro ao buscar marcações:', entriesError.message);
    if (ticketsError) console.error('Erro ao buscar tickets:', ticketsError.message);

    // Adiciona uma ordenação aqui para garantir que as marcações estão em ordem
    const sortedEntries = (entries || []).sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));

    // Retornamos os dados no formato que a aplicação espera
    return {
        entries: sortedEntries,
        tickets: tickets || []
    };
}


/**
 * Busca e calcula dados agregados dos últimos 7 dias para o gráfico semanal.
 */
export async function getWeeklySummary() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { labels: [], workHours: [], ticketsTime: [] };

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: entries, error: entriesError } = await supabase
        .from('clock_entries')
        .select('entry_time, entry_type')
        .eq('user_id', user.id)
        .gte('entry_time', sevenDaysAgo.toISOString())
        .lte('entry_time', today.toISOString())
        .order('entry_time', { ascending: true });

    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('work_date, total_seconds')
        .eq('user_id', user.id)
        .gte('work_date', getLocalDateKey(sevenDaysAgo))
        .lte('work_date', getLocalDateKey(today));

    if (entriesError) console.error('Erro ao buscar marcações da semana:', entriesError.message);
    if (ticketsError) console.error('Erro ao buscar tickets da semana:', ticketsError.message);

    const dailyData = {};
    const labels = [];
    const dayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

    // Prepara os "baldes" para cada um dos últimos 7 dias usando a data LOCAL
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = getLocalDateKey(d); // <-- MUDANÇA AQUI
        const label = dayFormatter.format(d).replace('.', '');
        labels.push(label.charAt(0).toUpperCase() + label.slice(1));
        dailyData[key] = { workSeconds: 0, ticketsSeconds: 0 };
    }

    // Agrupa as marcações de ponto por dia LOCAL
    const entriesByDay = (entries || []).reduce((acc, entry) => {
        const entryDate = new Date(entry.entry_time);
        const dayKey = getLocalDateKey(entryDate); // <-- MUDANÇA AQUI
        if (!acc[dayKey]) acc[dayKey] = [];
        acc[dayKey].push({ time: entryDate, type: entry.entry_type });
        return acc;
    }, {});

    // Calcula as horas de trabalho por dia
    for (const dayKey in entriesByDay) {
        if (!dailyData[dayKey]) continue;
        let totalMilliseconds = 0;
        let lastStartTime = null;
        entriesByDay[dayKey].forEach(entry => {
            if (entry.type === 'INICIO_JORNADA' || entry.type === 'FIM_PAUSA') {
                lastStartTime = entry.time;
            } else if ((entry.type === 'INICIO_PAUSA' || entry.type === 'FIM_JORNADA') && lastStartTime) {
                totalMilliseconds += entry.time - lastStartTime;
                lastStartTime = null;
            }
        });
        dailyData[dayKey].workSeconds = totalMilliseconds / 1000;
    }

    // Soma o tempo dos tickets (a coluna 'work_date' já é local)
    (tickets || []).forEach(ticket => {
        if (dailyData[ticket.work_date]) {
            dailyData[ticket.work_date].ticketsSeconds += ticket.total_seconds;
        }
    });

    const workHours = Object.values(dailyData).map(d => d.workSeconds / 3600);
    const ticketsTime = Object.values(dailyData).map(d => d.ticketsSeconds / 3600);

    return { labels, workHours, ticketsTime };
}

/**
 * Busca todos os dados de um mês específico para os relatórios.
 * @param {Date} date - Uma data qualquer dentro do mês desejado.
 */
export async function getMonthlyReportData(date) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { entries: [], tickets: [] };

    const year = date.getFullYear();
    const month = date.getMonth();

    // Data de início do mês (ex: 2025-10-01T00:00:00)
    const startDate = new Date(year, month, 1);
    // Data de início do próximo mês (ex: 2025-11-01T00:00:00)
    const endDate = new Date(year, month + 1, 1);

    // Busca marcações de ponto dentro do intervalo do mês
    const { data: entries, error: entriesError } = await supabase
        .from('clock_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('entry_time', startDate.toISOString())
        .lt('entry_time', endDate.toISOString()) // 'lt' (less than) para não incluir o primeiro segundo do próximo mês
        .order('entry_time', { ascending: true });

    // Busca tickets dentro do intervalo do mês
    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', user.id)
        .gte('work_date', startDate.toISOString().split('T')[0])
        .lt('work_date', endDate.toISOString().split('T')[0])
        .order('created_at', { ascending: false }); // Ordena os mais recentes primeiro

    if (entriesError) console.error('Erro ao buscar marcações do mês:', entriesError.message);
    if (ticketsError) console.error('Erro ao buscar tickets do mês:', ticketsError.message);

    return {
        entries: entries || [],
        tickets: tickets || []
    };
}


// =================================================================
// FUNÇÕES "SET" (SALVAR/ATUALIZAR DADOS)
// =================================================================

/**
 * Adiciona uma nova marcação de ponto.
 * @param {string} type - O tipo de marcação (ex: 'INICIO_JORNADA')
 */
export async function addClockEntry(type) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const { data, error } = await supabase
        .from('clock_entries')
        .insert({
            user_id: user.id,
            entry_type: type,
            entry_time: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('Erro ao adicionar marcação:', error.message);
        return null;
    }
    return data;
}

/**
 * Atualiza o horário de uma marcação existente.
 * @param {number} entryId - O ID da marcação.
 * @param {Date} newTime - O novo horário.
 */
export async function updateClockEntryTime(entryId, newTime) {
    const { data, error } = await supabase
        .from('clock_entries')
        .update({ entry_time: newTime.toISOString() })
        .eq('id', entryId)
        .select()
        .single();

    if (error) console.error("Erro ao atualizar marcação:", error.message);
    return data;
}

/**
 * Adiciona um novo ticket para o dia de hoje.
 * @param {string} identifier - O ID ou título do ticket.
 */
export async function addTicket(identifier) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const { data, error } = await supabase
        .from('tickets')
        .insert({
            user_id: user.id,
            ticket_identifier: identifier,
            work_date: getLocalDateKey(new Date()), // <--- CORRIGIDO
            total_seconds: 0
        })
        .select()
        .single();

    if (error) console.error('Erro ao adicionar ticket:', error.message);
    return data;
}

/**
 * Atualiza o tempo acumulado de um ticket.
 * @param {number} ticketId - O ID do ticket.
 * @param {number} totalSeconds - O novo total de segundos.
 */
export async function updateTicketTime(ticketId, totalSeconds) {
    const { error } = await supabase
        .from('tickets')
        .update({ total_seconds: Math.floor(totalSeconds) })
        .eq('id', ticketId);

    if (error) console.error('Erro ao atualizar tempo do ticket:', error.message);
}

/**
 * NOVA FUNÇÃO: Deleta um ticket do banco de dados.
 * @param {number} ticketId - O ID do ticket a ser deletado.
 */
export async function deleteTicket(ticketId) {
    const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId);

    if (error) {
        console.error('Erro ao deletar ticket:', error.message);
        return { success: false, error };
    }
    return { success: true };
}

/**
 * Deleta a última marcação de ponto do usuário no dia de hoje.
 * Usado para corrigir um encerramento de jornada acidental.
 */
export async function deleteLastClockEntry() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const today = getLocalDateKey(new Date());

    // 1. Encontrar a última marcação de hoje para pegar o ID
    const { data: lastEntry, error: findError } = await supabase
        .from('clock_entries')
        .select('id')
        .eq('user_id', user.id)
        .gte('entry_time', `${today}T00:00:00.000Z`)
        .lte('entry_time', `${today}T23:59:59.999Z`)
        .order('entry_time', { ascending: false }) // Ordena do mais novo para o mais antigo
        .limit(1) // Pega apenas o primeiro (o mais recente)
        .single();

    if (findError || !lastEntry) {
        console.error('Erro ao encontrar a última marcação para deletar:', findError?.message);
        return null;
    }

    // 2. Deletar a marcação encontrada usando o seu ID
    const { error: deleteError } = await supabase
        .from('clock_entries')
        .delete()
        .eq('id', lastEntry.id);

    if (deleteError) {
        console.error('Erro ao deletar a última marcação:', deleteError.message);
        return null;
    }

    // Retorna sucesso se a deleção funcionou
    return { success: true };
}

/**
 * Define 'active_since' para o ticket alvo e limpa para os outros.
 * @param {number} ticketId - O ID do ticket a ser iniciado.
 */
export async function startTicketTimer(ticketId) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { success: false, error: 'Usuário não encontrado' };
    const today = getLocalDateKey(new Date());

    // Primeiro, garante que nenhum outro ticket do dia esteja ativo
    const { error: clearError } = await supabase
        .from('tickets')
        .update({ active_since: null })
        .eq('user_id', user.id)
        .eq('work_date', today);

    if (clearError) {
        console.error('Erro ao limpar tickets ativos:', clearError.message);
        return { success: false, error: clearError };
    }

    // Agora, ativa o ticket específico
    const { error: startError } = await supabase
        .from('tickets')
        .update({ active_since: new Date().toISOString() })
        .eq('id', ticketId);
    
    if (startError) {
        console.error('Erro ao iniciar ticket:', startError.message);
        return { success: false, error: startError };
    }

    return { success: true };
}

/**
 * Atualiza o tempo total e limpa 'active_since'.
 * @param {number} ticketId - O ID do ticket a ser pausado.
 * @param {number} newTotalSeconds - O novo tempo total calculado.
 */
export async function pauseTicketTimer(ticketId, newTotalSeconds) {
    const { error } = await supabase
        .from('tickets')
        .update({
            total_seconds: Math.floor(newTotalSeconds),
            active_since: null
        })
        .eq('id', ticketId);

    if (error) {
        console.error('Erro ao pausar ticket:', error.message);
        return { success: false, error };
    }
    return { success: true };
}