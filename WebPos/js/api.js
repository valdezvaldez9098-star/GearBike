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
        usuarios:      '/api/Usuarios'
    }
};

// Helper para no repetir el header X-Usuario en los módulos del admin.
// (Auth se carga en otro script; por eso se usa dentro de la función.)
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
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${url}`, {
                ...defaultOptions,
                ...options
            });

            // Leer el cuerpo como texto primero para evitar SyntaxError
            // cuando la API devuelve HTML de error en lugar de JSON
            const text = await response.text();

            let data = null;
            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch {
                    // La API devolvió algo que no es JSON (ej. error HTML de Azure)
                    if (!response.ok) {
                        throw new Error(`Error ${response.status}: ${response.statusText}`);
                    }
                    return text;
                }
            }

            if (!response.ok) {
                // Extraer mensaje del JSON de error si existe
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
