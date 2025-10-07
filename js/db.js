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

    if (password !== confirm) {
      alert("Passwords do not match!");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      alert(error.message);
      return;
    }
    // Se e-mail de confirmação estiver ativo, o usuário precisará confirmar.
    location.href = "dashboard.html";
  });
}

async function initInternalPage() {
  const session = await guardInternalPages();
  if (!session) return;

  wireSignOut();

  // Chama funções do app se existirem
  const p = pageName();
  if (p === "dashboard.html" || p === "profile.html") {
    if (typeof window.populateDashboard === "function") {
      window.populateDashboard();
    }
  } else if (p === "reports.html") {
    if (typeof window.populateReportsPage === "function") {
      window.populateReportsPage();
    }
  }
}

/* ====== BOOTSTRAP ====== */
document.addEventListener("DOMContentLoaded", async () => {
  const p = pageName();

  // Já logado? Evita ficar na tela de login/cadastro
  const { data: { session } } = await supabase.auth.getSession();
  if (session && (p === "index.html" || p === "register.html")) {
    location.href = "dashboard.html";
    return;
  }

  if (p === "index.html") {
    await initLoginPage();
  } else if (p === "register.html") {
    await initRegisterPage();
  } else if (isInternal(p)) {
    await initInternalPage();
  }

  // Mudanças de sessão (ex.: signOut em outra aba)
  supabase.auth.onAuthStateChange((_event, sess) => {
    const pNow = pageName();
    if (!sess && isInternal(pNow)) {
      location.href = "index.html";
    }
  });
});
