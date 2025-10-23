// js/db.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 🔹 Substitua pelos seus valores do painel Supabase:
const supabaseUrl = "https://ihyycebcwbvmghquvwpp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloeXljZWJjd2J2bWdocXV2d3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTUyMDMsImV4cCI6MjA3NTQzMTIwM30.5ELP9vqXXg7XEr3Jl1qMXjBECP7FCNwBZnRMfQvA4Oc";
export const supabase = createClient(supabaseUrl, supabaseKey);

window.supabaseClient = supabase;

/* ====== HELPERS ====== */
const pageName = () => (location.pathname.split("/").pop() || "index.html").toLowerCase();
const isInternal = (p) => ["dashboard.html", "reports.html", "profile.html"].includes(p);

function setUserName(session) {
  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.email ||
    "Usuário";
  document.querySelectorAll(".user-name").forEach((el) => (el.textContent = userName));
}

async function guardInternalPages() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = "index.html";
    return null;
  }
  setUserName(session);
  return session;
}

function wireSignOut() {
  const el = document.getElementById("signOutLink");
  if (!el) return;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = "index.html";
  });
}

/* ====== PÁGINAS ====== */
async function initLoginPage() {
  if (window.feather?.replace) window.feather.replace();

  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email")?.value || "").trim();
    const password = document.getElementById("password")?.value || "";

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      return;
    }
    location.href = "dashboard.html";
  });
}

async function initRegisterPage() {
  if (window.feather?.replace) window.feather.replace();

  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (document.getElementById("name")?.value || "").trim();
    const email = (document.getElementById("email")?.value || "").trim();
    const password = document.getElementById("password")?.value || "";
    const confirm = document.getElementById("confirmPassword")?.value || "";
    // ===== LINHA ADICIONADA =====
    const contractualWorkday = parseFloat(document.getElementById("contractualWorkday")?.value);

    if (password !== confirm) {
      alert("Passwords do not match!");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      // ===== TRECHO MODIFICADO =====
      options: {
        data: {
          full_name: name,
          contractual_workday_hours: contractualWorkday
        }
      },
    });
    if (error) {
      alert(error.message);
      return;
    }
    location.href = "dashboard.html";
  });
}

async function initInternalPage() {
  const session = await guardInternalPages();
  if (!session) return;

  wireSignOut();
}

async function initForgotPasswordPage() {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email")?.value || "").trim();

    // Obtém a URL base para o redirecionamento
    const redirectTo = `${window.location.origin}/update-password.html`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    });

    if (error) {
      alert(`Erro: ${error.message}`);
    } else {
      alert("Se existir uma conta com este e-mail, um link para redefinição de senha foi enviado.");
      form.reset();
    }
  });
}

async function initUpdatePasswordPage() {
  const form = document.getElementById("updatePasswordForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("newPassword")?.value;
    const confirmPassword = document.getElementById("confirmPassword")?.value;

    if (newPassword !== confirmPassword) {
      alert("As senhas não coincidem!");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      alert(`Erro ao atualizar senha: ${error.message}`);
    } else {
      alert("Senha atualizada com sucesso! Você será redirecionado para o login.");
      location.href = "index.html";
    }
  });
}

/* ====== BOOTSTRAP ====== */
document.addEventListener("DOMContentLoaded", async () => {
  const p = pageName();

  // Já logado? Evita ficar na tela de login/cadastro
  const { data: { session } } = await supabase.auth.getSession();
  if (session && (p === "index.html" || p === "register.html" || p === "forgot-password.html")) {
    location.href = "dashboard.html";
    return;
  }

  // ATUALIZE ESTA PARTE para incluir as novas páginas
  if (p === "index.html") {
    await initLoginPage();
  } else if (p === "register.html") {
    await initRegisterPage();
  } else if (p === "forgot-password.html") {
    await initForgotPasswordPage();
  } else if (p === "update-password.html") {
    await initUpdatePasswordPage();
  } else if (isInternal(p)) {
    await initInternalPage();
  }

  // Mudanças de sessão (ex.: signOut em outra aba)
  supabase.auth.onAuthStateChange((_event, session) => {
    // Adicione um manipulador para o evento PASSWORD_RECOVERY
    if (_event === 'PASSWORD_RECOVERY') {
      // A sessão é restaurada, o usuário está "logado" para poder alterar a senha.
      // O redirecionamento já é feito pelo link do e-mail, mas a sessão é validada aqui.
      return;
    }

    const pNow = pageName();
    if (!session && isInternal(pNow)) {
      location.href = "index.html";
    }
  });
});
