// ── Estado global ─────────────────────────────────────────────────────────────
let _productos = [];
let _ventas    = [];          // últimas ventas del dashboard
let _historial = {            // estado del sub-módulo historial
    ventas:        [],
    pagina:        1,
    totalPaginas:  1,
    total:         0,
    cargando:      false
};
let _detalleCache = {};        // { [idVenta]: detalles[] }
let _filaActiva   = null;

// ── Arranque ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.checkAuth()) return;
    Auth.updateUserInfo();
    actualizarReloj();
    setInterval(actualizarReloj, 1000);

    // Fechas por defecto en los filtros del historial: último mes
    const hoy   = new Date();
    const hace1m = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
    const fi = document.getElementById('histFechaInicio');
    const ff = document.getElementById('histFechaFin');
    if (fi) fi.value = _fmtDateInput(hace1m);
    if (ff) ff.value = _fmtDateInput(hoy);

    // Habilitar/deshabilitar inputs de fecha
    document.getElementById('histChkFecha')?.addEventListener('change', e => {
        const on = e.target.checked;
        if (fi) fi.disabled = !on;
        if (ff) ff.disabled = !on;
    });
    if (fi) fi.disabled = true;
    if (ff) ff.disabled = true;

    // Cerrar panel con Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') cerrarDetalle();
    });

    await cargarDashboard();
});

function actualizarReloj() {
    const el = document.getElementById('currentDateTime');
    if (el) el.textContent = new Date().toLocaleString('es-MX');
}

// ── Carga principal del dashboard ─────────────────────────────────────────────
async function cargarDashboard() {
    mostrarEsqueleto(true);
    try {
        [_productos, _ventas] = await Promise.all([
            ApiClient.get(API_CONFIG.endpoints.productos),
            ApiClient.get(API_CONFIG.endpoints.ventas)      // lista simple para métricas
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

    // Cargar el historial de ventas en paralelo (no bloquea el dashboard)
    cargarHistorial();
}

// ── Tarjetas de métricas ──────────────────────────────────────────────────────
function renderMetricas() {
    setText('totalProductos', _productos.length);

    const bajoStock = _productos.filter(p => p.stockActual <= (p.stockMinimo ?? 5));
    const elBajo    = document.getElementById('bajoStock');
    if (elBajo) {
        elBajo.textContent = bajoStock.length;
        elBajo.style.color = bajoStock.length > 0 ? '#e74c3c' : 'inherit';
    }

    const hoy       = new Date().toISOString().split('T')[0];
    const ventasHoy = _ventas.filter(v => (v.fechaHora || '').startsWith(hoy));
    const montoHoy  = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
    setText('ventasHoy',     `$${fmt(montoHoy)}`);
    setText('cantVentasHoy', ventasHoy.length + (ventasHoy.length === 1 ? ' venta' : ' ventas'));

    const marcaTop = calcularMarcaTop();
    setText('marcaTop', marcaTop || '—');
}

function calcularMarcaTop() {
    const conteo = {};
    _productos.forEach(p => {
        const marca    = p.marca?.nombre || 'Sin marca';
        const vendidos = Math.max(0, (p.stockMaximo ?? p.stockActual) - p.stockActual);
        conteo[marca]  = (conteo[marca] || 0) + vendidos;
    });
    const entradas = Object.entries(conteo).filter(([, v]) => v > 0);
    if (!entradas.length) return null;
    entradas.sort((a, b) => b[1] - a[1]);
    return entradas[0][0];
}

// ── Últimas 5 ventas (sección superior) ──────────────────────────────────────
function renderUltimasVentas() {
    const tbody = document.getElementById('recentSalesTable');
    if (!tbody) return;

    const ultimas = (_ventas.ventas || _ventas).slice(0, 5);

    if (!ultimas.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888">' +
                          'No hay ventas registradas</td></tr>';
        return;
    }

    tbody.innerHTML = ultimas.map(v => `
        <tr style="cursor:pointer" onclick="abrirDetalleDesdeRecientes(${v.idVenta})"
            title="Ver detalle de la venta #${v.idVenta}">
            <td>#${v.idVenta}</td>
            <td>${new Date(v.fechaHora).toLocaleString('es-MX')}</td>
            <td><strong>$${fmt(v.total)}</strong></td>
            <td><span class="status-badge ${v.estado ? 'active' : 'inactive'}">
                ${v.estado ? 'Completada' : 'Cancelada'}
            </span></td>
        </tr>`).join('');
}

// Abrir detalle desde la tabla de "Últimas ventas" sin necesidad de ir al historial
async function abrirDetalleDesdeRecientes(idVenta) {
    const ventaBase = (_ventas.ventas || _ventas).find(v => v.idVenta === idVenta) || {};
    await mostrarPanelDetalle(idVenta, ventaBase);

    // Asegurar que el historial esté visible para que el usuario no pierda contexto
    const seccion = document.getElementById('seccionHistorial');
    if (seccion) seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Gráfica de barras ─────────────────────────────────────────────────────────
function renderGraficaVentas() {
    const contenedor = document.getElementById('graficaVentas');
    if (!contenedor) return;

    const dias = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dias.push(d.toISOString().split('T')[0]);
    }

    const ventasArr = _ventas.ventas || _ventas;
    const montos = dias.map(dia =>
        ventasArr
            .filter(v => (v.fechaHora || '').startsWith(dia))
            .reduce((s, v) => s + (v.total || 0), 0)
    );

    const maxMonto = Math.max(...montos, 1);

    contenedor.innerHTML = `
        <div class="grafica-barras">
            ${dias.map((dia, i) => {
                const pct   = Math.round((montos[i] / maxMonto) * 100);
                const label = dia.slice(5);
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

// ── Productos bajo stock ──────────────────────────────────────────────────────
function renderProductosBajoStock() {
    const tbody = document.getElementById('tablaBajoStock');
    if (!tbody) return;

    const bajo = _productos
        .filter(p => p.stockActual <= (p.stockMinimo ?? 5))
        .sort((a, b) => a.stockActual - b.stockActual)
        .slice(0, 8);

    if (!bajo.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#27ae60">' +
                          '✔ Todos los productos tienen stock suficiente</td></tr>';
        return;
    }

    tbody.innerHTML = bajo.map(p => {
        const critico = p.stockActual === 0;
        return `<tr style="${critico ? 'background:#fff5f5' : ''}">
            <td>${escHtml(p.nombre)}</td>
            <td>${escHtml(p.marca?.nombre || 'N/A')}</td>
            <td style="color:${critico ? '#e74c3c' : '#e67e22'};font-weight:bold">
                ${critico ? '⚠ Agotado' : p.stockActual}</td>
            <td style="color:#888">${p.stockMinimo ?? 5}</td>
        </tr>`;
    }).join('');
}

// ════════════════════════════════════════════════════════════════════════════════
// SUB-MÓDULO: HISTORIAL DE VENTAS
// ════════════════════════════════════════════════════════════════════════════════

async function cargarHistorial(resetPagina = false) {
    if (_historial.cargando) return;
    if (resetPagina) _historial.pagina = 1;

    _historial.cargando = true;
    const tbody = document.getElementById('historialBody');
    const lbl   = document.getElementById('histLblEstado');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;' +
        'padding:20px;color:var(--text-muted)">Cargando...</td></tr>';

    try {
        // La API devuelve lista plana — filtramos y paginamos en cliente
        let todas = Array.isArray(_ventas) ? [..._ventas] : [];
        if (!todas.length) {
            const raw = await ApiClient.get(API_CONFIG.endpoints.ventas);
            todas = Array.isArray(raw) ? raw : (raw.ventas || []);
        }

        // Filtro por fecha opcional
        if (document.getElementById('histChkFecha')?.checked) {
            const fi = document.getElementById('histFechaInicio')?.value;
            const ff = document.getElementById('histFechaFin')?.value;
            if (fi) todas = todas.filter(v => (v.fechaHora || '') >= fi);
            if (ff) todas = todas.filter(v => (v.fechaHora || '') <= ff + 'T23:59:59');
        }

        const porPagina = 25;
        _historial.total        = todas.length;
        _historial.totalPaginas = Math.max(1, Math.ceil(todas.length / porPagina));
        _historial.pagina       = Math.min(_historial.pagina, _historial.totalPaginas);

        const inicio = (_historial.pagina - 1) * porPagina;
        _historial.ventas = todas.slice(inicio, inicio + porPagina);

        renderTablaHistorial();
        actualizarPaginacion();

        if (lbl) lbl.textContent = _historial.total + ' venta' +
            (_historial.total !== 1 ? 's' : '') + ' encontrada' +
            (_historial.total !== 1 ? 's' : '') + '.';

    } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:#e74c3c;padding:14px">' +
            'Error: ' + escHtml(err.message) + '</td></tr>';
    } finally {
        _historial.cargando = false;
    }
}

function renderTablaHistorial() {
    const tbody = document.getElementById('historialBody');
    if (!tbody) return;

    const lista = _historial.ventas;
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;
            color:var(--text-muted)">No se encontraron ventas con los filtros aplicados.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(v => {
        const completada = v.estado !== false;
        return `
        <tr class="hist-fila" onclick="seleccionarVenta(${v.idVenta}, this)"
            data-id="${v.idVenta}" title="Ver detalle">
            <td style="font-weight:700;color:var(--navy)">#${v.idVenta}</td>
            <td>${_fmtFecha(v.fechaHora)}</td>
            <td>${escHtml(v.clienteNombre || '—')}</td>
            <td>${escHtml(v.metodoPago   || '—')}</td>
            <td style="text-align:right;font-weight:700">$${fmt(v.total)}</td>
            <td style="text-align:center">
                <span class="status-badge ${completada ? 'active' : 'inactive'}">
                    ${completada ? 'Completada' : 'Cancelada'}
                </span>
            </td>
        </tr>`;
    }).join('');
}

// ── Seleccionar fila del historial ────────────────────────────────────────────
async function seleccionarVenta(idVenta, fila) {
    if (_filaActiva) _filaActiva.classList.remove('hist-fila-activa');
    fila.classList.add('hist-fila-activa');
    _filaActiva = fila;

    const ventaBase = _historial.ventas.find(v => v.idVenta === idVenta) || {};
    await mostrarPanelDetalle(idVenta, ventaBase);
}

// ── Panel de detalle ──────────────────────────────────────────────────────────
async function mostrarPanelDetalle(idVenta, ventaBase) {
    const panel = document.getElementById('detallePanel');
    const overlay = document.getElementById('detalleOverlay');
    if (!panel) return;

    // Llenar campos conocidos de inmediato
    _setText('detId',      `Venta #${idVenta}`);
    _setText('detFecha',   _fmtFecha(ventaBase.fechaHora || ''));
    _setText('detCliente', ventaBase.clienteNombre || 'Venta general');
    _setText('detMetodo',  ventaBase.metodoPago    || '—');
    _setText('detTotal',   ventaBase.total != null ? `$${fmt(ventaBase.total)}` : '...');
    const estadoEl = document.getElementById('detEstado');
    if (estadoEl) estadoEl.innerHTML = ventaBase.estado !== false
        ? '<span class="status-badge active">Completada</span>'
        : '<span class="status-badge inactive">Cancelada</span>';

    // Mostrar panel
    panel.classList.add('visible');
    if (overlay) overlay.classList.add('visible');

    // Cargar productos (usa caché si ya se pidió)
    const bodyEl    = document.getElementById('detProductosBody');
    const loadingEl = document.getElementById('detCargando');
    const tablaEl   = document.getElementById('detProductosTabla');

    if (_detalleCache[idVenta]) {
        _renderDetalleProductos(_detalleCache[idVenta]);
        return;
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (tablaEl)   tablaEl.style.display   = 'none';
    if (bodyEl)    bodyEl.innerHTML = '';

    try {
        const resp = await ApiClient.getVentaDetalle(idVenta);
        const dets = resp.detalles || [];

        // Actualizar total y estado si vinieron en el detalle
        if (resp.venta) {
            _setText('detTotal',   `$${fmt(resp.venta.total)}`);
            _setText('detCliente', resp.venta.clienteNombre || 'Venta general');
            _setText('detMetodo',  resp.venta.metodoPago    || '—');
            _setText('detFecha',   _fmtFecha(resp.venta.fechaHora || ''));
            if (estadoEl) estadoEl.innerHTML = resp.venta.estado !== false
                ? '<span class="status-badge active">Completada</span>'
                : '<span class="status-badge inactive">Cancelada</span>';
        }

        _detalleCache[idVenta] = dets;
        _renderDetalleProductos(dets);
    } catch (err) {
        if (loadingEl) loadingEl.textContent = 'Error al cargar productos: ' + err.message;
    }
}

function _renderDetalleProductos(detalles) {
    const loadingEl = document.getElementById('detCargando');
    const tablaEl   = document.getElementById('detProductosTabla');
    const bodyEl    = document.getElementById('detProductosBody');

    if (loadingEl) loadingEl.style.display = 'none';
    if (!tablaEl || !bodyEl) return;

    if (!detalles.length) {
        bodyEl.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);' +
                           'text-align:center">Sin productos.</td></tr>';
    } else {
        bodyEl.innerHTML = detalles.map(d => `
            <tr>
                <td>${escHtml(d.nombreProducto || `#${d.fkProducto}`)}</td>
                <td style="text-align:center">${d.cantidad}</td>
                <td style="text-align:right">$${fmt(d.precioUnitarioVenta)}</td>
                <td style="text-align:right;font-weight:700">$${fmt(d.subtotal)}</td>
            </tr>`).join('');
    }
    tablaEl.style.display = 'table';
}

function cerrarDetalle() {
    document.getElementById('detallePanel')?.classList.remove('visible');
    document.getElementById('detalleOverlay')?.classList.remove('visible');
    if (_filaActiva) { _filaActiva.classList.remove('hist-fila-activa'); _filaActiva = null; }
}

// ── Paginación ────────────────────────────────────────────────────────────────
function actualizarPaginacion() {
    const lbl = document.getElementById('histLblPagina');
    const ant = document.getElementById('histBtnAnt');
    const sig = document.getElementById('histBtnSig');
    if (lbl) lbl.textContent = `Página ${_historial.pagina} de ${_historial.totalPaginas}`;
    if (ant) ant.disabled    = _historial.pagina <= 1;
    if (sig) sig.disabled    = _historial.pagina >= _historial.totalPaginas;
}

function histCambiarPagina(delta) {
    const nueva = _historial.pagina + delta;
    if (nueva < 1 || nueva > _historial.totalPaginas) return;
    _historial.pagina = nueva;
    cerrarDetalle();
    cargarHistorial();
    document.getElementById('seccionHistorial')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function histBuscar() {
    cerrarDetalle();
    cargarHistorial(true);
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

function _setText(id, val) { setText(id, val); }

function fmt(num) {
    return Number(num).toLocaleString('es-MX',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(num) {
    return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : Math.round(num).toString();
}

function _fmtFecha(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-MX',
            { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' +
               d.toLocaleTimeString('es-MX',
            { hour:'2-digit', minute:'2-digit' });
    } catch { return iso; }
}

function _fmtDateInput(d) { return d.toISOString().slice(0, 10); }

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
