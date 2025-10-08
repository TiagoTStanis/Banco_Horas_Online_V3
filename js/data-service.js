// Importamos o cliente supabase já inicializado em db.js
import { supabase } from './db.js';

/**
 * Retorna a data atual no formato YYYY-MM-DD.
 */
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


// =================================================================
// FUNÇÕES "GET" (BUSCAR DADOS)
// =================================================================

/**
 * Busca todas as marcações de ponto e tickets do usuário para o dia de hoje.
 * Este é o ponto de partida para carregar a dashboard.
 */
export async function getTodaysData() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { entries: [], tickets: [] };

    const today = getTodayDateString();

    const { data: entries, error: entriesError } = await supabase
        .from('clock_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('entry_time', `${today}T00:00:00.000Z`)
        .lte('entry_time', `${today}T23:59:59.999Z`)
        .order('entry_time', { ascending: true });

    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', user.id)
        .eq('work_date', today);

    if (entriesError) console.error('Erro ao buscar marcações:', entriesError.message);
    if (ticketsError) console.error('Erro ao buscar tickets:', ticketsError.message);

    // Retornamos os dados no formato que a aplicação espera
    return {
        entries: entries || [],
        tickets: tickets || []
    };
}

/**
 * Busca dados agregados para o gráfico semanal.
 * (Esta é uma versão simplificada. Idealmente, isso seria uma função de BD)
 */
export async function getWeeklySummary() {
    // ... Lógica para buscar e agregar dados dos últimos 7 dias ...
    // Por simplicidade, vamos retornar dados mocados por enquanto.
    return {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
        workHours: [0, 0, 0, 0, 0, 0, 0], // Você preencheria isso com dados reais
        ticketsTime: [0, 0, 0, 0, 0, 0, 0]
    };
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
            work_date: getTodayDateString(),
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
 * Deleta a última marcação de ponto do usuário no dia de hoje.
 * Usado para corrigir um encerramento de jornada acidental.
 */
export async function deleteLastClockEntry() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const today = getTodayDateString();

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