// ── Helpers ───────────────────────────────────────────────────────────────────

function showToast(msg, ok = true) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.style.cssText = `
            position:fixed;bottom:28px;right:24px;padding:13px 22px;border-radius:10px;
            font-size:14px;font-weight:600;color:#fff;z-index:9999;
            box-shadow:0 6px 24px rgba(0,0,0,.18);transition:opacity .3s;opacity:0;pointer-events:none;`;
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? 'var(--navy)' : '#e53e3e';
    t.style.opacity = '1';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.opacity = '0'; }, 3200);
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function formatFecha(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
    } catch { return iso; }
}

// ── Estado ────────────────────────────────────────────────────────────────────
let clientes   = [];
let editandoId = null;
let filtroTexto = '';

// ── Cargar lista ──────────────────────────────────────────────────────────────
async function cargarClientes() {
    const tbody = document.getElementById('clientesTable');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:22px;color:var(--gray-mid)">Cargando...</td></tr>';

    try {
        clientes = await ApiClient.get(API_CONFIG.endpoints.clientes);
        renderTabla();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:#e53e3e;padding:16px">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderTabla() {
    const tbody = document.getElementById('clientesTable');
    const filtro = filtroTexto.toLowerCase();

    const lista = filtro
        ? clientes.filter(c =>
            c.nombre.toLowerCase().includes(filtro) ||
            (c.telefono && c.telefono.includes(filtro)) ||
            (c.correo   && c.correo.toLowerCase().includes(filtro)))
        : clientes;

    document.getElementById('contadorClientes').textContent =
        `${lista.length} cliente${lista.length !== 1 ? 's' : ''}`;

    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--gray-mid)">No hay clientes registrados.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(c => `
        <tr>
            <td class="col-id">${c.idCliente}</td>
            <td><strong>${escapeHtml(c.nombre)}</strong></td>
            <td>${escapeHtml(c.telefono || '—')}</td>
            <td class="col-correo">${escapeHtml(c.correo || '—')}</td>
            <td class="col-fecha">${formatFecha(c.fechaRegistro)}</td>
            <td class="acciones-cell">
                <button class="btn-accion btn-editar"   onclick="abrirEditar(${c.idCliente})"                                 title="Editar">✏️</button>
                <button class="btn-accion btn-eliminar" onclick="confirmarEliminar(${c.idCliente},'${escapeHtml(c.nombre)}')" title="Desactivar">🗑️</button>
            </td>
        </tr>`).join('');
}

// ── Búsqueda en tiempo real ───────────────────────────────────────────────────
document.getElementById('inputBuscar').addEventListener('input', e => {
    filtroTexto = e.target.value;
    renderTabla();
});

// ── Modal nuevo/editar ────────────────────────────────────────────────────────
function limpiarForm() {
    document.getElementById('inputNombre').value    = '';
    document.getElementById('inputTelefono').value  = '';
    document.getElementById('inputCorreo').value    = '';
    document.getElementById('inputDireccion').value = '';
    document.getElementById('formError').textContent = '';
}

function abrirNuevo() {
    editandoId = null;
    limpiarForm();
    document.getElementById('modalTitle').textContent = 'Nuevo Cliente';
    document.getElementById('inputNombre').disabled   = false;
    abrirModal('clienteModal');
    document.getElementById('inputNombre').focus();
}

function abrirEditar(id) {
    const c = clientes.find(x => x.idCliente === id);
    if (!c) return;
    editandoId = id;
    document.getElementById('modalTitle').textContent   = 'Editar Cliente';
    document.getElementById('inputNombre').value        = c.nombre    || '';
    document.getElementById('inputTelefono').value      = c.telefono  || '';
    document.getElementById('inputCorreo').value        = c.correo    || '';
    document.getElementById('inputDireccion').value     = c.direccion || '';
    document.getElementById('formError').textContent    = '';
    document.getElementById('inputNombre').disabled     = false;
    abrirModal('clienteModal');
    document.getElementById('inputNombre').focus();
}

function cerrarModal() {
    document.getElementById('clienteModal').classList.remove('visible');
    editandoId = null;
}

function abrirModal(id) {
    document.getElementById(id).classList.add('visible');
}

// ── Guardar ───────────────────────────────────────────────────────────────────
document.getElementById('clienteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errorDiv = document.getElementById('formError');
    errorDiv.textContent = '';

    const nombre    = document.getElementById('inputNombre').value.trim();
    const telefono  = document.getElementById('inputTelefono').value.trim();
    const correo    = document.getElementById('inputCorreo').value.trim();
    const direccion = document.getElementById('inputDireccion').value.trim();

    if (!nombre) { errorDiv.textContent = 'El nombre del cliente es obligatorio.'; return; }

    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        errorDiv.textContent = 'El correo electrónico no tiene un formato válido.'; return;
    }

    const body = { Nombre: nombre, Telefono: telefono || null,
                   Correo: correo || null, Direccion: direccion || null };

    const btnGuardar = document.querySelector('#clienteForm button[type="submit"]');
    btnGuardar.disabled = true;

    try {
        if (editandoId === null) {
            await ApiClient.request(API_CONFIG.endpoints.clientes, {
                method: 'POST', body: JSON.stringify(body)
            });
            showToast('Cliente registrado exitosamente. ✅');
        } else {
            await ApiClient.request(`${API_CONFIG.endpoints.clientes}/${editandoId}`, {
                method: 'PUT', body: JSON.stringify(body)
            });
            showToast('Cliente actualizado exitosamente. ✅');
        }
        cerrarModal();
        await cargarClientes();
    } catch (err) {
        errorDiv.textContent = err.message;
    } finally {
        btnGuardar.disabled = false;
    }
});

// ── Eliminar (baja lógica) ────────────────────────────────────────────────────
let eliminandoId = null;

function confirmarEliminar(id, nombre) {
    eliminandoId = id;
    document.getElementById('confirmNombre').textContent = nombre;
    abrirModal('confirmModal');
}

function cerrarConfirm() {
    document.getElementById('confirmModal').classList.remove('visible');
    eliminandoId = null;
}

document.getElementById('btnConfirmEliminar').addEventListener('click', async () => {
    if (!eliminandoId) return;
    try {
        await ApiClient.delete(`${API_CONFIG.endpoints.clientes}/${eliminandoId}`);
        showToast('Cliente desactivado correctamente.');
        cerrarConfirm();
        await cargarClientes();
    } catch (err) {
        cerrarConfirm();
        showToast(err.message, false);
    }
});

// ── Cerrar modales con Escape o clic en overlay ───────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModal(); cerrarConfirm(); }
});
document.getElementById('clienteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('clienteModal')) cerrarModal();
});
document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) cerrarConfirm();
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cargarClientes();
});
