// js/profile.js
import { supabase } from './db.js';

// Variável para guardar o objeto do usuário e ser acessível em toda a página
let currentUser = null;

// =================================================================
// CARREGA OS DADOS DO USUÁRIO QUANDO A PÁGINA ABRE
// =================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user; // Salva o usuário na variável global

    if (currentUser) {
        // Referências aos elementos do formulário
        const nameInput = document.getElementById('name');
        const contractualWorkdayInput = document.getElementById('contractualWorkday');
        const emailInput = document.getElementById('email');

        // Preenche os campos com os dados atuais do usuário
        nameInput.value = currentUser.user_metadata.full_name || '';
        emailInput.value = currentUser.email || '';

        // Preenche a jornada de trabalho com o valor salvo
        if (currentUser.user_metadata.contractual_workday_hours) {
            contractualWorkdayInput.value = currentUser.user_metadata.contractual_workday_hours;
        }
    }
});

// =================================================================
// MANIPULADOR PARA O FORMULÁRIO DE ATUALIZAÇÃO DE PERFIL
// =================================================================
const profileForm = document.getElementById('profileForm');
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Pega os valores atualizados dos campos do formulário
    const name = document.getElementById('name').value.trim();
    const contractualWorkday = parseFloat(document.getElementById('contractualWorkday').value);

    // Validação para garantir que o valor é um número válido
    if (isNaN(contractualWorkday) || contractualWorkday <= 0) {
        alert('Por favor, insira um valor válido para a jornada de trabalho.');
        return;
    }

    // Atualiza os metadados do usuário no Supabase
    const { data, error } = await supabase.auth.updateUser({
        data: {
            full_name: name,
            contractual_workday_hours: contractualWorkday // Salva o novo valor
        }
    });

    if (error) {
        alert(`Erro ao atualizar perfil: ${error.message}`);
    } else {
        alert('Perfil atualizado com sucesso!');
        // Atualiza o nome do usuário no cabeçalho
        document.querySelectorAll(".user-name").forEach((el) => (el.textContent = name));
    }
});

// =================================================================
// MANIPULADOR PARA O FORMULÁRIO DE ALTERAÇÃO DE SENHA
// =================================================================
const passwordForm = document.getElementById('passwordForm');
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('As senhas não coincidem!');
        return;
    }

    if (!newPassword) {
        alert('A senha não pode estar em branco.');
        return;
    }

    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        alert(`Erro ao alterar senha: ${error.message}`);
    } else {
        alert('Senha alterada com sucesso!');
        passwordForm.reset();
    }
});