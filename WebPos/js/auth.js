// Manejo de autenticación
const Auth = {
    async login(username, password) {
        try {
            const response = await ApiClient.post(API_CONFIG.endpoints.login, {
                nombreUsuario: username,
                contrasena: password
            });

            if (response.exitoso) {
                localStorage.setItem('user', JSON.stringify({
                    nombreUsuario: response.nombreUsuario,
                    nombreCompleto: response.nombreCompleto,
                    rol: response.rol
                }));
                return { success: true, data: response };
            } else {
                return { success: false, error: response.mensaje };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    logout() {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    },

    isAuthenticated() {
        return localStorage.getItem('user') !== null;
    },

    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    checkAuth() {
        if (!this.isAuthenticated() && !window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
        return this.isAuthenticated();
    },

    updateUserInfo() {
        const user = this.getUser();
        if (user) {
            document.querySelectorAll('#userName').forEach(el => {
                if (el) el.textContent = user.nombreCompleto || user.nombreUsuario;
            });
        }
    }
};

// ── Sidebar hamburger (móvil) ─────────────────────────────
function initSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const overlay  = document.querySelector('.sidebar-overlay');
    const toggle   = document.querySelector('.sidebar-toggle');
    if (!sidebar) return;

    function openSidebar()  { sidebar.classList.add('open');    overlay && overlay.classList.add('visible'); }
    function closeSidebar() { sidebar.classList.remove('open'); overlay && overlay.classList.remove('visible'); }

    if (toggle)  toggle.addEventListener('click', openSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Cerrar al navegar (útil en móvil)
    sidebar.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
            if (window.innerWidth <= 640) closeSidebar();
        });
    });
}

// ── Inicialización ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', e => { e.preventDefault(); Auth.logout(); });
    }

    // Páginas protegidas
    if (!window.location.pathname.includes('index.html')) {
        Auth.checkAuth();
        Auth.updateUserInfo();
    }

    initSidebar();
});

// ── Formulario de login ───────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const username  = document.getElementById('username').value;
        const password  = document.getElementById('password').value;
        const errorDiv  = document.getElementById('loginError');
        const result    = await Auth.login(username, password);
        if (result.success) {
            window.location.href = 'dashboard.html';
        } else {
            errorDiv.textContent = result.error;
        }
    });
}
