// ── Helpers ──────────────────────────────────────────────────────────────────

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
    t._tid = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ── Estado ────────────────────────────────────────────────────────────────────
let usuarios = [];
let editandoId = null;

// ── Cargar lista ──────────────────────────────────────────────────────────────
async function cargarUsuarios() {
    const tbody = document.getElementById('usuariosTable');
    tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

    try {
        usuarios = await ApiClient.request(API_CONFIG.endpoints.usuarios, {
            headers: withAdminHeader()
        });

        if (!usuarios.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="color:var(--gray-mid)">No hay usuarios registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = usuarios.map(u => `
            <tr>
                <td>${u.idUsuario}</td>
                <td>${escapeHtml(u.nombreUsuario)}</td>
                <td class="acciones-cell">
                    <button class="btn-accion btn-editar" onclick="abrirEditar(${u.idUsuario})" title="Editar">✏️</button>
                    ${u.nombreUsuario.toLowerCase() !== 'admin'
                        ? `<button class="btn-accion btn-eliminar" onclick="confirmarEliminar(${u.idUsuario},'${escapeHtml(u.nombreUsuario)}')" title="Eliminar">🗑️</button>`
                        : '<span class="badge-admin">admin</span>'}
                </td>
            </tr>`).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:#e53e3e">${err.message}</td></tr>`;
    }
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal nuevo/editar ────────────────────────────────────────────────────────
function abrirNuevo() {
    editandoId = null;
    document.getElementById('modalTitle').textContent   = 'Nuevo Usuario';
    document.getElementById('inputNombre').value        = '';
    document.getElementById('inputPassword').value      = '';
    document.getElementById('inputPassword2').value     = '';
    document.getElementById('lblPassword').textContent  = 'Contraseña *';
    document.getElementById('inputPassword').required   = true;
    document.getElementById('inputPassword2').required  = true;
    document.getElementById('formError').textContent    = '';
    abrirModal('usuarioModal');
    document.getElementById('inputNombre').focus();
}

function abrirEditar(id) {
    const u = usuarios.find(x => x.idUsuario === id);
    if (!u) return;
    editandoId = id;
    document.getElementById('modalTitle').textContent   = 'Editar Usuario';
    document.getElementById('inputNombre').value        = u.nombreUsuario;
    document.getElementById('inputPassword').value      = '';
    document.getElementById('inputPassword2').value     = '';
    document.getElementById('lblPassword').textContent  = 'Nueva contraseña (dejar vacío para no cambiar)';
    document.getElementById('inputPassword').required   = false;
    document.getElementById('inputPassword2').required  = false;
    document.getElementById('formError').textContent    = '';

    // El admin no puede cambiar su propio nombre
    document.getElementById('inputNombre').disabled =
        u.nombreUsuario.toLowerCase() === 'admin';

    abrirModal('usuarioModal');
    document.getElementById('inputPassword').focus();
}

function cerrarModal() {
    document.getElementById('usuarioModal').classList.remove('visible');
    document.getElementById('inputNombre').disabled = false;
}

function abrirModal(id) {
    document.getElementById(id).classList.add('visible');
}

// ── Guardar (crear o editar) ───────────────────────────────────────────────────
document.getElementById('usuarioForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errorDiv = document.getElementById('formError');
    errorDiv.textContent = '';

    const nombre   = document.getElementById('inputNombre').value.trim();
    const pass1    = document.getElementById('inputPassword').value;
    const pass2    = document.getElementById('inputPassword2').value;

    if (!nombre) { errorDiv.textContent = 'El nombre de usuario es obligatorio.'; return; }

    if (editandoId === null && !pass1) {
        errorDiv.textContent = 'La contraseña es obligatoria para un usuario nuevo.'; return;
    }
    if (pass1 && pass1.length < 4) {
        errorDiv.textContent = 'La contraseña debe tener al menos 4 caracteres.'; return;
    }
    if (pass1 && pass1 !== pass2) {
        errorDiv.textContent = 'Las contraseñas no coinciden.'; return;
    }

    const body = { NombreUsuario: nombre };
    if (pass1) body.Contrasena = pass1;

    try {
        if (editandoId === null) {
            await ApiClient.request(API_CONFIG.endpoints.usuarios, {
                method: 'POST',
                headers: withAdminHeader(),
                body: JSON.stringify(body)
            });
            showToast('Usuario creado exitosamente.');
        } else {
            await ApiClient.request(`${API_CONFIG.endpoints.usuarios}/${editandoId}`, {
                method: 'PUT',
                headers: withAdminHeader(),
                body: JSON.stringify(body)
            });
            showToast('Usuario actualizado exitosamente.');
        }
        cerrarModal();
        cargarUsuarios();
    } catch (err) {
        errorDiv.textContent = err.message;
    }
});

// ── Eliminar ──────────────────────────────────────────────────────────────────
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
        await ApiClient.request(`${API_CONFIG.endpoints.usuarios}/${eliminandoId}`, {
            method: 'DELETE',
            headers: withAdminHeader()
        });
        showToast('Usuario eliminado.');
        cerrarConfirm();
        cargarUsuarios();
    } catch (err) {
        cerrarConfirm();
        showToast(err.message, false);
    }
});

// ── Cerrar modales con overlay ────────────────────────────────────────────────
document.getElementById('usuarioModal').addEventListener('click', e => {
    if (e.target === document.getElementById('usuarioModal')) cerrarModal();
});
document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) cerrarConfirm();
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cargarUsuarios();
});
