// Configuración de la API
const API_CONFIG = {
    baseUrl: 'https://refaccionaria-api-duc5gxdmh7crhtac.eastus2-01.azurewebsites.net',
    endpoints: {
        login:         '/api/Auth/login',
        productos:     '/api/Productos',
        marcas:        '/api/Marcas',
        tiposProductos:'/api/TiposProductos',
        ventas:        '/api/Ventas',
        proveedores:   '/api/Proveedores',
        usuarios:      '/api/Usuarios',
        clientes:      '/api/Clientes'       // ← NUEVO
    }
};

// Helper para el header X-Usuario (requerido por endpoints de admin)
function withAdminHeader(extraHeaders = {}) {
    try {
        const user = (typeof Auth !== 'undefined' && Auth && Auth.getUser) ? Auth.getUser() : null;
        const nombreUsuario = user ? user.nombreUsuario : '';
        return { ...extraHeaders, 'X-Usuario': nombreUsuario };
    } catch {
        return { ...extraHeaders, 'X-Usuario': '' };
    }
}

// Cliente API
const ApiClient = {
    async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${url}`, {
                ...defaultOptions,
                ...options,
                headers: {
                    ...defaultOptions.headers,
                    ...(options.headers || {})
                }
            });

            // Leer como texto primero para manejar errores HTML de Azure
            const text = await response.text();

            let data = null;
            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch {
                    if (!response.ok) {
                        throw new Error(`Error ${response.status}: ${response.statusText}`);
                    }
                    return text;
                }
            }

            if (!response.ok) {
                const msg = data?.mensaje || data?.message || data?.Mensaje
                    || `Error ${response.status}`;
                throw new Error(msg);
            }

            return data;

        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    get(url)         { return this.request(url); },
    post(url, data)  { return this.request(url, { method: 'POST',   body: JSON.stringify(data) }); },
    put(url, data)   { return this.request(url, { method: 'PUT',    body: JSON.stringify(data) }); },
    delete(url)      { return this.request(url, { method: 'DELETE' }); }
};
