// js/profile.js
import { supabase } from './db.js';

// Carrega os dados do usuário quando a página é carregada
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        // Preenche os campos com os dados atuais do usuário
        const nameInput = document.getElementById('name');
        const emailInput = document.getElementById('email');
        
        nameInput.value = user.user_metadata.full_name || '';
        emailInput.value = user.email || '';
    }
});

// Manipulador para o formulário de atualização de perfil
const profileForm = document.getElementById('profileForm');
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value.trim();
    
    // Atualiza os metadados do usuário (neste caso, o nome completo)
    const { data, error } = await supabase.auth.updateUser({
        data: { full_name: name }
    });

    if (error) {
        alert(`Erro ao atualizar perfil: ${error.message}`);
    } else {
        alert('Perfil atualizado com sucesso!');
        // Atualiza o nome do usuário no cabeçalho
        document.querySelectorAll(".user-name").forEach((el) => (el.textContent = name));
    }
});

// Manipulador para o formulário de alteração de senha
const passwordForm = document.getElementById('passwordForm');
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Verifica se as senhas coincidem
    if (newPassword !== confirmPassword) {
        alert('As senhas não coincidem!');
        return;
    }

    if (!newPassword) {
        alert('A senha não pode estar em branco.');
        return;
    }

    // Atualiza a senha do usuário
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
        alert(`Erro ao alterar senha: ${error.message}`);
    } else {
        alert('Senha alterada com sucesso!');
        passwordForm.reset(); // Limpa os campos do formulário
    }
});