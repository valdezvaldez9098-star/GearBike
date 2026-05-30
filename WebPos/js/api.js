// Configuración de la API
const API_CONFIG = {
    baseUrl: 'https://refaccionaria-api-duc5gxdmh7crhtac.eastus2-01.azurewebsites.net',
    endpoints: {
        login:          '/api/Auth/login',
        productos:      '/api/Productos',
        marcas:         '/api/Marcas',
        tiposProductos: '/api/TiposProductos',
        ventas:         '/api/Ventas',
        proveedores:    '/api/Proveedores',
        usuarios:       '/api/Usuarios',
        clientes:       '/api/Clientes'
    }
};

// Helper para el header X-Usuario (requerido por endpoints de admin)
function withAdminHeader(extraHeaders = {}) {
    try {
        const user = (typeof Auth !== 'undefined' && Auth?.getUser)
            ? Auth.getUser() : null;
        return { ...extraHeaders, 'X-Usuario': user?.nombreUsuario || '' };
    } catch {
        return { ...extraHeaders, 'X-Usuario': '' };
    }
}

// ── Cliente API ───────────────────────────────────────────────────────────────
const ApiClient = {
    async request(url, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' }
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

            // Leer como texto primero para manejar respuestas HTML de Azure
            const text = await response.text();
            let data = null;

            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch {
                    if (!response.ok)
                        throw new Error(`Error ${response.status}: ${response.statusText}`);
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

    get(url)        { return this.request(url); },
    post(url, data) { return this.request(url, { method: 'POST',   body: JSON.stringify(data) }); },
    put(url, data)  { return this.request(url, { method: 'PUT',    body: JSON.stringify(data) }); },
    delete(url)     { return this.request(url, { method: 'DELETE' }); },

    // ── Helpers específicos ───────────────────────────────────────────────────

    /**
     * Obtiene el historial de ventas paginado con filtros opcionales.
     * @param {object} opciones - { pagina, porPagina, fechaInicio, fechaFin, fkCliente }
     * @returns {Promise<{ total, paginas, pagina, ventas[] }>}
     */
    async getVentas({ pagina = 1, porPagina = 20,
                      fechaInicio = null, fechaFin = null,
                      fkCliente = null } = {}) {
        const p = [`pagina=${pagina}`, `porPagina=${porPagina}`];
        if (fechaInicio) p.push(`fechaInicio=${fechaInicio}`);
        if (fechaFin)    p.push(`fechaFin=${fechaFin}`);
        if (fkCliente)   p.push(`fkCliente=${fkCliente}`);
        return this.get(`${API_CONFIG.endpoints.ventas}?${p.join('&')}`);
    },

    /**
     * Obtiene el detalle completo de una venta: cabecera + productos.
     * @param {number} id - ID de la venta
     * @returns {Promise<{ venta, detalles[] }>}
     */
    getVentaDetalle(id) {
        return this.get(`${API_CONFIG.endpoints.ventas}/${id}`);
    },

    /**
     * Obtiene el historial de compras de un cliente con resumen estadístico.
     * @param {number} idCliente
     * @param {object} opciones - { fechaInicio, fechaFin }
     * @returns {Promise<{ cliente, resumen, ventas[] }>}
     */
    getHistorialCliente(idCliente, { fechaInicio = null, fechaFin = null } = {}) {
        const p = [];
        if (fechaInicio) p.push(`fechaInicio=${fechaInicio}`);
        if (fechaFin)    p.push(`fechaFin=${fechaFin}`);
        const qs = p.length ? '?' + p.join('&') : '';
        return this.get(`${API_CONFIG.endpoints.clientes}/${idCliente}/historial${qs}`);
    }
};
