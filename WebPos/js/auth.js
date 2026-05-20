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
            const userNameElements = document.querySelectorAll('#userName');
            userNameElements.forEach(el => {
                if (el) el.textContent = user.nombreCompleto || user.nombreUsuario;
            });
        }
    }
};

// Configurar logout
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });
    }

    // Verificar autenticación en páginas protegidas
    if (!window.location.pathname.includes('index.html')) {
        Auth.checkAuth();
        Auth.updateUserInfo();
    }
});

// Manejo del formulario de login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');
        
        const result = await Auth.login(username, password);
        
        if (result.success) {
            window.location.href = 'dashboard.html';
        } else {
            errorDiv.textContent = result.error;
        }
    });
}