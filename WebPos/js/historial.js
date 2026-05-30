// ── Estado ────────────────────────────────────────────────────────────────────
const _h = {
    pagina:       1,
    porPagina:    25,
    totalPaginas: 1,
    total:        0,
    ventas:       [],
    cargando:     false,
    cache:        {},        // idVenta → detalle completo
    // Modo cliente
    modoCliente:  false,
    clienteId:    null,
    clienteNombre: null
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.checkAuth()) return;
    Auth.updateUserInfo();

    // Leer parámetros de URL: ?clienteId=X&clienteNombre=Nombre
    const params = new URLSearchParams(window.location.search);
    const cid    = params.get('clienteId');
    const cnombre = params.get('clienteNombre');

    if (cid) {
        activarModoCliente(parseInt(cid), decodeURIComponent(cnombre || `Cliente #${cid}`));
    } else {
        // Fechas por defecto: último mes
        const hoy    = new Date();
        const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);
        document.getElementById('histFechaFin').value    = hoy.toISOString().slice(0, 10);
        document.getElementById('histFechaInicio').value = hace30.toISOString().slice(0, 10);
    }

    cargarHistorial(true);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') cerrarDetalle();
    });
});

// ── Modo cliente ──────────────────────────────────────────────────────────────
function activarModoCliente(id, nombre) {
    _h.modoCliente   = true;
    _h.clienteId     = id;
    _h.clienteNombre = nombre;

    // UI
    document.getElementById('histTitulo').textContent = `📋 Historial — ${nombre}`;
    const badge = document.getElementById('histModoBadge');
    badge.textContent = '👤 ' + nombre;
    badge.style.display = 'inline-flex';

    document.getElementById('btnVolverClientes').style.display = 'inline-flex';

    // En modo cliente ocultar columna cliente (es obvia) y paginación
    document.querySelectorAll('.col-hist-cliente').forEach(el => el.style.display = 'none');
    document.getElementById('histPaginacion').style.display = 'none';
}

function volverAClientes() {
    window.location.href = 'clientes.html';
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function toggleFechas() {
    const activo = document.getElementById('histChkFecha').checked;
    document.getElementById('lblDesde').style.display = activo ? '' : 'none';
    document.getElementById('lblHasta').style.display = activo ? '' : 'none';
}

function histBuscar() {
    _h.pagina = 1;
    cargarHistorial(true);
}

function histLimpiar() {
    document.getElementById('histChkFecha').checked = false;
    toggleFechas();
    _h.pagina = 1;
    cargarHistorial(true);
}

function histCambiarPagina(delta) {
    const nueva = _h.pagina + delta;
    if (nueva < 1 || nueva > _h.totalPaginas) return;
    _h.pagina = nueva;
    cargarHistorial(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Carga principal ───────────────────────────────────────────────────────────
async function cargarHistorial(resetPagina = false) {
    if (_h.cargando) return;
    if (resetPagina) _h.pagina = 1;
    _h.cargando = true;

    const tbody = document.getElementById('historialBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;
        color:var(--text-muted)">Cargando...</td></tr>`;

    try {
        const usarFecha = document.getElementById('histChkFecha').checked;
        const fechaInicio = usarFecha ? document.getElementById('histFechaInicio').value || null : null;
        const fechaFin    = usarFecha ? document.getElementById('histFechaFin').value    || null : null;

        if (_h.modoCliente) {
            // Modo cliente: endpoint /api/Ventas/cliente/{id}
            const resp = await ApiClient.get(
                API_CONFIG.endpoints.ventas + '/cliente/' + _h.clienteId
            );
            // resp puede tener { ventas[], totalCompras, montoTotal }
            // o ser la lista directamente
            const listaVentas = Array.isArray(resp)
                ? resp
                : (resp.ventas || []);

            _h.ventas = listaVentas;
            _h.total  = listaVentas.length;

            // Aplicar filtro de fecha si está activo
            let filtradas = listaVentas;
            if (fechaInicio) filtradas = filtradas.filter(v => (v.fechaHora || '') >= fechaInicio);
            if (fechaFin)    filtradas = filtradas.filter(v => (v.fechaHora || '') <= fechaFin + 'T23:59:59');
            _h.ventas = filtradas;
            _h.total  = filtradas.length;

            // Llenar resumen estadístico
            const montoTotal = filtradas.reduce((s, v) => s + (v.total || 0), 0);
            const promedio   = filtradas.length > 0 ? montoTotal / filtradas.length : 0;
            document.getElementById('histResumen').classList.add('visible');
            document.getElementById('resumenTotalVentas').textContent = filtradas.length;
            document.getElementById('resumenMontoTotal').textContent =
                '$' + montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 });
            document.getElementById('resumenPromedio').textContent =
                '$' + promedio.toLocaleString('es-MX', { minimumFractionDigits: 2 });

            // Cachear detalles si vienen incluidos
            filtradas.forEach(v => { if (v.detalles) _h.cache[v.idVenta] = v; });

            renderTabla(filtradas);
            actualizarLblEstado();
        } else {
            // Modo general: la API devuelve lista plana, paginamos en cliente
            const raw = await ApiClient.get(API_CONFIG.endpoints.ventas);
            let todas = Array.isArray(raw) ? raw : (raw.ventas || []);

            // Filtro por fecha
            if (fechaInicio) todas = todas.filter(v => (v.fechaHora || '') >= fechaInicio);
            if (fechaFin)    todas = todas.filter(v => (v.fechaHora || '') <= fechaFin + 'T23:59:59');

            const porPagina = _h.porPagina || 25;
            _h.total        = todas.length;
            _h.totalPaginas = Math.max(1, Math.ceil(todas.length / porPagina));
            _h.pagina       = Math.min(_h.pagina, _h.totalPaginas);

            const inicio  = (_h.pagina - 1) * porPagina;
            _h.ventas     = todas.slice(inicio, inicio + porPagina);

            renderTabla(_h.ventas);
            actualizarPaginacion();
            actualizarLblEstado();
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:#e53e3e;padding:20px">
            Error: ${escH(err.message)}</td></tr>`;
    } finally {
        _h.cargando = false;
    }
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById('historialBody');

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;
            color:var(--text-muted)">No se encontraron ventas.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(v => {
        const fecha   = v.fechaHora
            ? new Date(v.fechaHora).toLocaleString('es-MX', {
                day:'2-digit', month:'2-digit', year:'numeric',
                hour:'2-digit', minute:'2-digit' })
            : '—';
        const cliente = v.clienteNombre || v.cliente?.nombre || '—';
        const estado  = v.estado !== false
            ? '<span class="status-badge active">Activa</span>'
            : '<span class="status-badge inactive">Anulada</span>';
        const total   = '$' + Number(v.total ?? 0).toLocaleString('es-MX',
            { minimumFractionDigits: 2 });

        return `<tr class="hist-fila" onclick="seleccionarVenta(${v.idVenta}, this)">
            <td style="font-weight:700;color:var(--orange)">#${v.idVenta}</td>
            <td>${fecha}</td>
            <td class="col-hist-cliente">${escH(cliente)}</td>
            <td class="col-hist-metodo">${escH(v.metodoPago || '—')}</td>
            <td style="text-align:right;font-weight:700">${total}</td>
            <td style="text-align:center">${estado}</td>
        </tr>`;
    }).join('');
}

// ── Seleccionar fila ──────────────────────────────────────────────────────────
async function seleccionarVenta(idVenta, fila) {
    // Marcar fila activa
    document.querySelectorAll('.hist-fila-activa').forEach(r => r.classList.remove('hist-fila-activa'));
    fila.classList.add('hist-fila-activa');

    abrirPanel();

    // Usar caché si disponible
    if (_h.cache[idVenta]) {
        rellenarPanel(_h.cache[idVenta]);
        return;
    }

    // Mostrar esqueleto mientras carga
    document.getElementById('detId').textContent      = `Venta #${idVenta}`;
    document.getElementById('detFecha').textContent   = '...';
    document.getElementById('detCliente').textContent = '...';
    document.getElementById('detMetodo').textContent  = '...';
    document.getElementById('detEstado').textContent  = '...';
    document.getElementById('detTotal').textContent   = '...';
    document.getElementById('detCargando').style.display    = 'block';
    document.getElementById('detProductosTabla').style.display = 'none';

    try {
        const detalle = await ApiClient.getVentaDetalle(idVenta);
        _h.cache[idVenta] = detalle;
        rellenarPanel(detalle);
    } catch (err) {
        document.getElementById('detCargando').textContent = 'Error: ' + err.message;
    }
}

function rellenarPanel(v) {
    const fecha = v.fechaHora
        ? new Date(v.fechaHora).toLocaleString('es-MX', {
            weekday:'long', day:'numeric', month:'long',
            year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';

    document.getElementById('detId').textContent      = `Venta #${v.idVenta}`;
    document.getElementById('detFecha').textContent   = fecha;
    document.getElementById('detCliente').textContent =
        v.clienteNombre || v.cliente?.nombre || '— General —';
    document.getElementById('detMetodo').textContent  = v.metodoPago  || '—';
    document.getElementById('detEstado').textContent  = v.estado !== false ? 'Activa' : 'Anulada';
    document.getElementById('detTotal').textContent   =
        '$' + Number(v.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

    // Productos
    const detalles = v.detalles || v.productos || [];
    const tbody    = document.getElementById('detProductosBody');
    document.getElementById('detCargando').style.display = 'none';

    if (!detalles.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);padding:10px">
            Sin productos registrados.</td></tr>`;
    } else {
        tbody.innerHTML = detalles.map(d => {
            const nombre   = d.nombreProducto || d.producto?.nombre || `Producto #${d.fkProducto}`;
            const precio   = '$' + Number(d.precioUnitarioVenta ?? d.precioUnitario ?? 0)
                .toLocaleString('es-MX', { minimumFractionDigits: 2 });
            const subtotal = '$' + Number(d.subtotal ?? 0)
                .toLocaleString('es-MX', { minimumFractionDigits: 2 });
            return `<tr>
                <td>${escH(nombre)}</td>
                <td style="text-align:center">${d.cantidad}</td>
                <td style="text-align:right">${precio}</td>
                <td style="text-align:right;font-weight:700">${subtotal}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('detProductosTabla').style.display = 'table';
}

// ── Panel abierto/cerrado ─────────────────────────────────────────────────────
function abrirPanel() {
    document.getElementById('detallePanel').classList.add('visible');
    document.getElementById('detalleOverlay').classList.add('visible');
}

function cerrarDetalle() {
    document.getElementById('detallePanel').classList.remove('visible');
    document.getElementById('detalleOverlay').classList.remove('visible');
    document.querySelectorAll('.hist-fila-activa').forEach(r => r.classList.remove('hist-fila-activa'));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function actualizarPaginacion() {
    document.getElementById('histLblPagina').textContent =
        `Página ${_h.pagina} de ${_h.totalPaginas}`;
    document.getElementById('histBtnAnt').disabled = _h.pagina <= 1;
    document.getElementById('histBtnSig').disabled = _h.pagina >= _h.totalPaginas;
}

function actualizarLblEstado() {
    const lbl = document.getElementById('histLblEstado');
    if (!lbl) return;
    lbl.textContent = _h.total === 0
        ? 'Sin resultados.'
        : `${_h.total} venta${_h.total !== 1 ? 's' : ''} encontrada${_h.total !== 1 ? 's' : ''}.`;
}

function escH(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
