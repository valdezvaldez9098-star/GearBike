// Configuración de la API
const API_CONFIG = {
    baseUrl: 'https://refaccionaria-api-duc5gxdmh7crhtac.eastus2-01.azurewebsites.net', // Cambiar por la URL de tu API
    endpoints: {
        login: '/api/Auth/login',
        productos: '/api/Productos',
        marcas: '/api/Marcas',
        tiposProductos: '/api/TiposProductos',
        ventas: '/api/Ventas',
        proveedores: '/api/Proveedores'
    }
};

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

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.mensaje || data.message || 'Error en la petición');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    get(url) {
        return this.request(url);
    },

    post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(url) {
        return this.request(url, {
            method: 'DELETE'
        });
    }
};