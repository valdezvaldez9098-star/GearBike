// ── Estado del módulo ────────────────────────────────────────────────────────
let productos = [];
let marcas    = [];
let tiposProductos = [];

// ── Arranque ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.checkAuth()) return;
    Auth.updateUserInfo();

    // Cargar catálogos en paralelo para mayor velocidad
    await Promise.all([
        cargarMarcas(),
        cargarTiposProductos()
    ]);
    await cargarProductos();
    setupEventListeners();
});

// ── Carga de datos desde la API ───────────────────────────────────────────────
async function cargarProductos() {
    mostrarEstadoCarga(true);
    try {
        productos = await ApiClient.get(API_CONFIG.endpoints.productos);
        renderTabla();
    } catch (error) {
        console.error('Error cargando productos:', error);
        document.getElementById('productosTable').innerHTML =
            '<tr><td colspan="6" style="color:red;text-align:center">Error al cargar productos. Verifica la conexión con la API.</td></tr>';
    } finally {
        mostrarEstadoCarga(false);
    }
}

async function cargarMarcas() {
    try {
        marcas = await ApiClient.get(API_CONFIG.endpoints.marcas);
        poblarSelectMarcas();
    } catch (error) {
        console.error('Error cargando marcas:', error);
    }
}

async function cargarTiposProductos() {
    try {
        tiposProductos = await ApiClient.get(API_CONFIG.endpoints.tiposProductos);
        poblarSelectTipos();
    } catch (error) {
        console.error('Error cargando tipos:', error);
    }
}

// ── Render de la tabla ────────────────────────────────────────────────────────
function renderTabla() {
    const tbody = document.getElementById('productosTable');
    if (!tbody) return;

    const filtroTexto = (document.getElementById('filtroProducto')?.value || '').toLowerCase();
    const filtroMarca = document.getElementById('filtroMarca')?.value || '';

    // Mapa rápido id → nombre para las marcas
    const marcaMap = {};
    marcas.forEach(m => marcaMap[m.idMarca] = m.nombre);

    let lista = productos;

    if (filtroTexto) {
        lista = lista.filter(p =>
            p.nombre.toLowerCase().includes(filtroTexto) ||
            (p.codigoBarras || '').toLowerCase().includes(filtroTexto)
        );
    }

    if (filtroMarca) {
        lista = lista.filter(p => p.fkMarca == filtroMarca);
    }

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">No se encontraron productos</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(p => {
        const bajoPorcentaje = p.stockActual <= (p.stockMinimo ?? 5);
        const stockClass     = bajoPorcentaje ? 'bajo-stock' : '';
        const nombreMarca    = escapeHtml(marcaMap[p.fkMarca] || 'N/A');
        return `
        <tr>
            <td>${p.idProducto}</td>
            <td>${escapeHtml(p.nombre)}</td>
            <td>${nombreMarca}</td>
            <td>$${formatNum(p.precioVenta)}</td>
            <td class="${stockClass}">${p.stockActual}</td>
            <td>
                <button class="btn-secondary" onclick="abrirEdicion(${p.idProducto})">✏ Editar</button>
            </td>
        </tr>`;
    }).join('');
}

// ── Poblar selects ────────────────────────────────────────────────────────────
function poblarSelectMarcas() {
    const selForm   = document.getElementById('prodMarca');
    const selFiltro = document.getElementById('filtroMarca');
    const opciones  = marcas.map(m => `<option value="${m.idMarca}">${escapeHtml(m.nombre)}</option>`).join('');

    if (selForm)   selForm.innerHTML   = '<option value="">Seleccione una marca</option>' + opciones;
    if (selFiltro) selFiltro.innerHTML = '<option value="">Todas las marcas</option>'     + opciones;
}

function poblarSelectTipos() {
    const sel = document.getElementById('prodTipo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Sin tipo</option>' +
        tiposProductos.map(t => `<option value="${t.idTipoProducto}">${escapeHtml(t.nombre)}</option>`).join('');
}

// ── Abrir modal ───────────────────────────────────────────────────────────────
function abrirNuevo() {
    document.getElementById('modalTitle').textContent = 'Nuevo Producto';
    document.getElementById('productoForm').reset();
    document.getElementById('productoId').value = '';
    abrirModal();
}

function abrirEdicion(id) {
    const p = productos.find(x => x.idProducto === id);
    if (!p) return;

    document.getElementById('modalTitle').textContent   = 'Editar Producto';
    document.getElementById('productoId').value         = p.idProducto;
    document.getElementById('prodNombre').value         = p.nombre;
    document.getElementById('prodMarca').value          = p.fkMarca;
    document.getElementById('prodTipo').value           = p.fkTipoProducto || '';
    document.getElementById('prodPrecioCompra').value   = p.precioCompra;
    document.getElementById('prodPrecioVenta').value    = p.precioVenta;
    document.getElementById('prodStockActual').value    = p.stockActual;
    document.getElementById('prodStockMinimo').value    = p.stockMinimo || '';
    document.getElementById('prodModelo').value         = p.modelo || '';
    document.getElementById('prodCodigoBarras').value   = p.codigoBarras || '';
    abrirModal();
}

function abrirModal()  { document.getElementById('productoModal').style.display = 'block'; }
function cerrarModal() { document.getElementById('productoModal').style.display = 'none';  }

// ── Guardar (POST o PUT) ──────────────────────────────────────────────────────
async function guardarProducto() {
    const idVal = document.getElementById('productoId').value;
    const esEdicion = idVal !== '';

    // Validaciones en cliente
    const nombre = document.getElementById('prodNombre').value.trim();
    const marcaId = parseInt(document.getElementById('prodMarca').value);
    const precioVenta = parseFloat(document.getElementById('prodPrecioVenta').value);
    const stock = parseInt(document.getElementById('prodStockActual').value);

    if (!nombre) { alert('El nombre del producto es obligatorio.'); return; }
    if (!marcaId) { alert('Selecciona una marca.'); return; }
    if (isNaN(precioVenta) || precioVenta <= 0) { alert('El precio de venta debe ser mayor a 0.'); return; }
    if (isNaN(stock) || stock < 0) { alert('El stock no puede ser negativo.'); return; }

    const producto = {
        nombre,
        fkMarca:          marcaId,
        fkTipoProducto:   parseInt(document.getElementById('prodTipo').value) || null,
        precioCompra:     parseFloat(document.getElementById('prodPrecioCompra').value) || 0,
        precioVenta,
        stockActual:      stock,
        stockMinimo:      parseInt(document.getElementById('prodStockMinimo').value) || null,
        modelo:           document.getElementById('prodModelo').value.trim() || null,
        codigoBarras:     document.getElementById('prodCodigoBarras').value.trim() || null,
        fkProveedor:      1   // valor por defecto; ajustar si agregas selector de proveedor
    };

    const btnGuardar = document.querySelector('#productoForm button[type="submit"]');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        if (esEdicion) {
            producto.idProducto = parseInt(idVal);
            await ApiClient.put(`${API_CONFIG.endpoints.productos}/${idVal}`, producto);
            alert('Producto actualizado con éxito.');
        } else {
            await ApiClient.post(API_CONFIG.endpoints.productos, producto);
            alert('Producto creado con éxito.');
        }
        cerrarModal();
        await cargarProductos();
    } catch (error) {
        alert('Error al guardar: ' + error.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar';
    }
}

// ── Eventos ───────────────────────────────────────────────────────────────────
function setupEventListeners() {
    // Botón nuevo producto
    document.getElementById('btnNuevoProducto')
        ?.addEventListener('click', abrirNuevo);

    // Cerrar modal producto con la X
    document.querySelector('.close')
        ?.addEventListener('click', cerrarModal);

    // Cerrar modal producto al hacer clic fuera
    window.addEventListener('click', e => {
        if (e.target === document.getElementById('productoModal')) cerrarModal();
    });

    // Filtro de texto (en tiempo real)
    document.getElementById('filtroProducto')
        ?.addEventListener('input', renderTabla);

    // Filtro de marca
    document.getElementById('filtroMarca')
        ?.addEventListener('change', renderTabla);

    // Formulario producto submit
    document.getElementById('productoForm')
        ?.addEventListener('submit', async e => {
            e.preventDefault();
            await guardarProducto();
        });

    // ── Mini-modal de nueva marca ─────────────────────────────────────────
    document.getElementById('btnNuevaMarca')
        ?.addEventListener('click', abrirMarcaModal);

    document.getElementById('btnCancelarMarca')
        ?.addEventListener('click', cerrarMarcaModal);

    document.getElementById('btnGuardarMarca')
        ?.addEventListener('click', guardarNuevaMarca);

    // Guardar con Enter dentro del input de marca
    document.getElementById('inputNuevaMarca')
        ?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); guardarNuevaMarca(); }
        });
}

// ── Mini-modal marca ──────────────────────────────────────────────────────────
function abrirMarcaModal() {
    document.getElementById('inputNuevaMarca').value = '';
    document.getElementById('marcaModal').classList.add('visible');
    setTimeout(() => document.getElementById('inputNuevaMarca').focus(), 50);
}

function cerrarMarcaModal() {
    document.getElementById('marcaModal').classList.remove('visible');
}

async function guardarNuevaMarca() {
    const nombre = document.getElementById('inputNuevaMarca').value.trim();

    if (!nombre) {
        alert('El nombre de la marca no puede estar vacío.');
        return;
    }

    // Verificar duplicado localmente antes de ir a la API
    if (marcas.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
        alert(`La marca "${nombre}" ya existe.`);
        return;
    }

    const btnGuardar = document.getElementById('btnGuardarMarca');
    btnGuardar.disabled    = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        const nueva = await ApiClient.post(API_CONFIG.endpoints.marcas, {
            nombre,
            estatus: true
        });

        // Agregar al estado local y refrescar ambos selects
        marcas.push(nueva);
        poblarSelectMarcas();

        // Seleccionar automáticamente la marca recién creada
        document.getElementById('prodMarca').value = nueva.idMarca;

        cerrarMarcaModal();
        alert(`Marca "${nombre}" creada con éxito.`);
    } catch (error) {
        alert('Error al crear la marca: ' + error.message);
    } finally {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = 'Guardar';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mostrarEstadoCarga(cargando) {
    const tbody = document.getElementById('productosTable');
    if (cargando && tbody)
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Cargando...</td></tr>';
}

function formatNum(num) {
    return Number(num).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// Exponer al HTML (onclick inline)
window.abrirEdicion = abrirEdicion;
