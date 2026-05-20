// ── Estado ────────────────────────────────────────────────────────────────────
let carrito  = [];
let productos = [];

// ── Arranque ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.checkAuth()) return;
    Auth.updateUserInfo();
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    await cargarProductos();
    setupEventListeners();
    renderCarrito();
});

function actualizarReloj() {
    const el = document.getElementById('currentDateTime');
    if (el) el.textContent = new Date().toLocaleString('es-MX');
}

// ── Carga de productos ────────────────────────────────────────────────────────
async function cargarProductos() {
    const grid = document.getElementById('productosGrid');
    if (grid) grid.innerHTML = '<div class="loading">Cargando productos...</div>';
    try {
        productos = await ApiClient.get(API_CONFIG.endpoints.productos);
        renderGrid(productos);
    } catch (error) {
        console.error('Error cargando productos:', error);
        if (grid) grid.innerHTML = '<div class="error">Error al cargar productos. Verifica la API.</div>';
    }
}

// ── Render del grid de productos ──────────────────────────────────────────────
function renderGrid(lista) {
    const grid = document.getElementById('productosGrid');
    if (!grid) return;

    if (!lista || lista.length === 0) {
        grid.innerHTML = '<div class="loading">No hay productos disponibles</div>';
        return;
    }

    grid.innerHTML = lista.map(p => {
        const sinStock   = p.stockActual <= 0;
        const bajoStock  = !sinStock && p.stockActual <= (p.stockMinimo ?? 5);
        const claseExtra = sinStock ? 'sin-stock' : bajoStock ? 'bajo-stock-card' : '';

        return `
        <div class="producto-card ${claseExtra}" onclick="${sinStock ? '' : `agregarAlCarrito(${p.idProducto})`}"
             style="${sinStock ? 'opacity:.5;cursor:not-allowed' : 'cursor:pointer'}">
            <h4>${escapeHtml(p.nombre)}</h4>
            <p class="precio">$${formatNum(p.precioVenta)}</p>
            <p class="stock" style="color:${sinStock ? '#e74c3c' : bajoStock ? '#e67e22' : '#7f8c8d'}">
                Stock: ${p.stockActual}${sinStock ? ' — Agotado' : bajoStock ? ' — Bajo' : ''}
            </p>
        </div>`;
    }).join('');
}

// ── Carrito ───────────────────────────────────────────────────────────────────
function agregarAlCarrito(productoId) {
    const producto = productos.find(p => p.idProducto === productoId);
    if (!producto) return;

    if (producto.stockActual <= 0) {
        alert('Producto sin stock disponible.');
        return;
    }

    const existente = carrito.find(i => i.idProducto === productoId);

    if (existente) {
        if (existente.cantidad + 1 > producto.stockActual) {
            alert(`Stock insuficiente. Solo quedan ${producto.stockActual} unidades.`);
            return;
        }
        existente.cantidad++;
        existente.subtotal = existente.cantidad * existente.precio;
    } else {
        carrito.push({
            idProducto: producto.idProducto,
            nombre:     producto.nombre,
            precio:     producto.precioVenta,
            cantidad:   1,
            subtotal:   producto.precioVenta
        });
    }

    renderCarrito();
}

function modificarCantidad(index, delta) {
    const item     = carrito[index];
    const producto = productos.find(p => p.idProducto === item.idProducto);
    const nueva    = item.cantidad + delta;

    if (nueva <= 0) {
        carrito.splice(index, 1);
    } else {
        if (nueva > producto.stockActual) {
            alert(`Stock insuficiente. Solo quedan ${producto.stockActual} unidades.`);
            return;
        }
        item.cantidad = nueva;
        item.subtotal = nueva * item.precio;
    }

    renderCarrito();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderCarrito();
}

function renderCarrito() {
    const tbody = document.getElementById('carritoBody');
    if (!tbody) return;

    if (carrito.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-carrito">Carrito vacío</td></tr>';
        document.getElementById('subtotal').textContent = '$0.00';
        document.getElementById('total').textContent    = '$0.00';
        recalcularCambio();
        return;
    }

    tbody.innerHTML = carrito.map((item, i) => `
        <tr>
            <td>${escapeHtml(item.nombre)}</td>
            <td style="white-space:nowrap">
                <button class="btn-qty" onclick="modificarCantidad(${i}, -1)">−</button>
                <span style="margin:0 6px">${item.cantidad}</span>
                <button class="btn-qty" onclick="modificarCantidad(${i}, 1)">+</button>
            </td>
            <td>$${formatNum(item.precio)}</td>
            <td>$${formatNum(item.subtotal)}</td>
            <td><button class="btn-danger" onclick="eliminarDelCarrito(${i})">🗑</button></td>
        </tr>`
    ).join('');

    const total = carrito.reduce((s, i) => s + i.subtotal, 0);
    document.getElementById('subtotal').textContent = `$${formatNum(total)}`;
    document.getElementById('total').textContent    = `$${formatNum(total)}`;
    recalcularCambio();
}

// ── Cambio ────────────────────────────────────────────────────────────────────
function recalcularCambio() {
    const total         = carrito.reduce((s, i) => s + i.subtotal, 0);
    const montoRecibido = parseFloat(document.getElementById('montoRecibido')?.value) || 0;
    const cambio        = montoRecibido - total;
    const span          = document.getElementById('cambio');

    if (!span) return;
    if (cambio >= 0) {
        span.textContent = `$${formatNum(cambio)}`;
        span.style.color = '#27ae60';
    } else {
        span.textContent = `Faltan $${formatNum(Math.abs(cambio))}`;
        span.style.color = '#e74c3c';
    }
}

// ── Finalizar venta ───────────────────────────────────────────────────────────
async function finalizarVenta() {
    if (carrito.length === 0) {
        alert('Agrega productos al carrito antes de cobrar.');
        return;
    }

    const total       = carrito.reduce((s, i) => s + i.subtotal, 0);
    const metodoPago  = document.getElementById('metodoPago').value;
    let   montoRecibido = total; // para tarjeta/transferencia se cobra exacto

    if (metodoPago === 'Efectivo') {
        montoRecibido = parseFloat(document.getElementById('montoRecibido').value) || 0;
        if (montoRecibido <= 0) {
            alert('Ingresa el monto recibido.');
            return;
        }
        if (montoRecibido < total) {
            alert(`El monto recibido ($${formatNum(montoRecibido)}) es menor al total ($${formatNum(total)}).`);
            return;
        }
    }

    const cambio = metodoPago === 'Efectivo' ? montoRecibido - total : 0;

    const request = {
        venta: {
            fechaHora:       new Date().toISOString(),
            subtotal:        total,
            total:           total,
            montoRecibido:   montoRecibido,
            cambioEntregado: cambio,
            metodoPago:      metodoPago,
            estado:          true
        },
        detalles: carrito.map(item => ({
            fkProducto:          item.idProducto,
            cantidad:            item.cantidad,
            precioUnitarioVenta: item.precio,
            subtotal:            item.subtotal
        }))
    };

    const btn = document.getElementById('btnFinalizarVenta');
    btn.disabled   = true;
    btn.textContent = 'Procesando...';

    try {
        const result = await ApiClient.post(API_CONFIG.endpoints.ventas, request);

        const msg = metodoPago === 'Efectivo' && cambio > 0
            ? `Venta registrada.\nCambio a entregar: $${formatNum(cambio)}`
            : 'Venta registrada con éxito.';
        alert(msg);

        // Limpiar para la siguiente venta
        carrito = [];
        renderCarrito();
        document.getElementById('montoRecibido').value = 0;
        recalcularCambio();

        // Recargar productos para reflejar el stock actualizado
        await cargarProductos();

    } catch (error) {
        alert('Error al registrar la venta: ' + error.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Finalizar Venta';
    }
}

// ── Eventos ───────────────────────────────────────────────────────────────────
function setupEventListeners() {
    // Búsqueda en tiempo real
    document.getElementById('searchProduct')
        ?.addEventListener('input', e => {
            const txt = e.target.value.toLowerCase();
            const filtrados = txt
                ? productos.filter(p =>
                    p.nombre.toLowerCase().includes(txt) ||
                    (p.codigoBarras || '').toLowerCase().includes(txt))
                : productos;
            renderGrid(filtrados);
        });

    // Recalcular cambio al escribir monto
    document.getElementById('montoRecibido')
        ?.addEventListener('input', recalcularCambio);

    // Ocultar/mostrar campo monto según método de pago
    document.getElementById('metodoPago')
        ?.addEventListener('change', e => {
            const esEfectivo = e.target.value === 'Efectivo';
            const wrap = document.getElementById('montoRecibido')?.parentElement;
            if (wrap) wrap.style.display = esEfectivo ? '' : 'none';
            recalcularCambio();
        });

    // Botón finalizar
    document.getElementById('btnFinalizarVenta')
        ?.addEventListener('click', finalizarVenta);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNum(num) {
    return Number(num).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

window.agregarAlCarrito  = agregarAlCarrito;
window.modificarCantidad = modificarCantidad;
window.eliminarDelCarrito = eliminarDelCarrito;
