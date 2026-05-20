// ── Estado ────────────────────────────────────────────────────────────────────
let _productos = [];
let _ventas    = [];

// ── Arranque ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.checkAuth()) return;
    Auth.updateUserInfo();
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    await cargarDashboard();
});

function actualizarReloj() {
    const el = document.getElementById('currentDateTime');
    if (el) el.textContent = new Date().toLocaleString('es-MX');
}

// ── Carga principal ───────────────────────────────────────────────────────────
async function cargarDashboard() {
    mostrarEsqueleto(true);
    try {
        [_productos, _ventas] = await Promise.all([
            ApiClient.get(API_CONFIG.endpoints.productos),
            ApiClient.get(API_CONFIG.endpoints.ventas)
        ]);
        renderMetricas();
        renderUltimasVentas();
        renderGraficaVentas();
        renderProductosBajoStock();
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarError('No se pudo conectar con la API. Verifica que esté corriendo.');
    } finally {
        mostrarEsqueleto(false);
    }
}

// ── Tarjetas de métricas ──────────────────────────────────────────────────────
function renderMetricas() {
    // Total productos
    setText('totalProductos', _productos.length);

    // Productos bajo stock
    const bajoStock = _productos.filter(p => p.stockActual <= (p.stockMinimo ?? 5));
    const elBajo    = document.getElementById('bajoStock');
    if (elBajo) {
        elBajo.textContent = bajoStock.length;
        elBajo.style.color = bajoStock.length > 0 ? '#e74c3c' : 'inherit';
    }

    // Ventas de hoy — monto total
    const hoy       = new Date().toISOString().split('T')[0];
    const ventasHoy = _ventas.filter(v => (v.fechaHora || '').startsWith(hoy));
    const montoHoy  = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
    setText('ventasHoy',   `$${fmt(montoHoy)}`);
    setText('cantVentasHoy', ventasHoy.length + (ventasHoy.length === 1 ? ' venta' : ' ventas'));

    // Marca más vendida — basado en ventas del mes actual
    const marcaTop = calcularMarcaTop();
    setText('marcaTop', marcaTop || '—');
}

// Calcula la marca más vendida cruzando DetallesVentas → Producto → Marca
// Dado que el endpoint de ventas no trae detalles, usamos los productos y
// aproximamos por el que tenga mayor diferencia stock inicial vs actual.
// Para una métrica real se necesitaría un endpoint GET /api/Dashboard.
function calcularMarcaTop() {
    // Agrupar productos por marca y sumar ventas implícitas
    // (stockMaximo - stockActual como proxy si stockMaximo está disponible)
    const conteo = {};
    _productos.forEach(p => {
        const marca = p.marca?.nombre || 'Sin marca';
        const vendidos = Math.max(0, (p.stockMaximo ?? p.stockActual) - p.stockActual);
        conteo[marca] = (conteo[marca] || 0) + vendidos;
    });
    const entradas = Object.entries(conteo).filter(([, v]) => v > 0);
    if (entradas.length === 0) return null;
    entradas.sort((a, b) => b[1] - a[1]);
    return entradas[0][0];
}

// ── Últimas 5 ventas ──────────────────────────────────────────────────────────
function renderUltimasVentas() {
    const tbody = document.getElementById('recentSalesTable');
    if (!tbody) return;

    const ultimas = _ventas.slice(0, 5); // ya vienen ordenadas desc desde la API

    if (ultimas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888">No hay ventas registradas</td></tr>';
        return;
    }

    tbody.innerHTML = ultimas.map(v => `
        <tr>
            <td>#${v.idVenta}</td>
            <td>${new Date(v.fechaHora).toLocaleString('es-MX')}</td>
            <td><strong>$${fmt(v.total)}</strong></td>
            <td><span class="status-badge ${v.estado ? 'active' : 'inactive'}">
                ${v.estado ? 'Completada' : 'Cancelada'}
            </span></td>
        </tr>`
    ).join('');
}

// ── Mini-gráfica de ventas últimos 7 días ─────────────────────────────────────
function renderGraficaVentas() {
    const contenedor = document.getElementById('graficaVentas');
    if (!contenedor) return;

    // Últimos 7 días
    const dias = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dias.push(d.toISOString().split('T')[0]);
    }

    // Monto por día
    const montos = dias.map(dia =>
        _ventas
            .filter(v => (v.fechaHora || '').startsWith(dia))
            .reduce((s, v) => s + (v.total || 0), 0)
    );

    const maxMonto = Math.max(...montos, 1);

    contenedor.innerHTML = `
        <div class="grafica-barras">
            ${dias.map((dia, i) => {
                const pct   = Math.round((montos[i] / maxMonto) * 100);
                const label = dia.slice(5);      // MM-DD
                const esHoy = i === 6;
                return `
                <div class="barra-col">
                    <span class="barra-valor">${montos[i] > 0 ? '$' + fmtK(montos[i]) : ''}</span>
                    <div class="barra" style="height:${Math.max(pct, 2)}%" title="$${fmt(montos[i])}"
                         ${esHoy ? 'data-hoy="true"' : ''}></div>
                    <span class="barra-label">${label}</span>
                </div>`;
            }).join('')}
        </div>`;
}

// ── Tabla de productos con bajo stock ─────────────────────────────────────────
function renderProductosBajoStock() {
    const tbody = document.getElementById('tablaBajoStock');
    if (!tbody) return;

    const bajo = _productos
        .filter(p => p.stockActual <= (p.stockMinimo ?? 5))
        .sort((a, b) => a.stockActual - b.stockActual)
        .slice(0, 8);

    if (bajo.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#27ae60">✔ Todos los productos tienen stock suficiente</td></tr>';
        return;
    }

    tbody.innerHTML = bajo.map(p => {
        const critico = p.stockActual === 0;
        return `
        <tr style="${critico ? 'background:#fff5f5' : ''}">
            <td>${escapeHtml(p.nombre)}</td>
            <td>${escapeHtml(p.marca?.nombre || 'N/A')}</td>
            <td style="color:${critico ? '#e74c3c' : '#e67e22'};font-weight:bold">
                ${critico ? '⚠ Agotado' : p.stockActual}
            </td>
            <td style="color:#888">${p.stockMinimo ?? 5}</td>
        </tr>`;
    }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mostrarEsqueleto(cargando) {
    ['totalProductos','ventasHoy','bajoStock','marcaTop'].forEach(id => {
        const el = document.getElementById(id);
        if (el && cargando) el.textContent = '...';
    });
}

function mostrarError(msg) {
    const el = document.getElementById('recentSalesTable');
    if (el) el.innerHTML = `<tr><td colspan="4" style="color:#e74c3c;text-align:center">${msg}</td></tr>`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function fmt(num) {
    return Number(num).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(num) {
    return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : Math.round(num).toString();
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
}
