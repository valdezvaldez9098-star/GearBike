// ══════════════════════════════════════════════════════════════════
//  GearBike — Módulo de escáner de código de barras
//  Usa la librería ZXing-js cargada desde CDN en ventas.html
// ══════════════════════════════════════════════════════════════════

let _codeReader   = null;   // instancia de ZXing BrowserMultiFormatReader
let _escaneando   = false;
let _streamActivo = null;   // MediaStream activo para poder cerrarlo

// ── Abrir modal y arrancar cámara ─────────────────────────────────
async function abrirEscaner() {
    // Verificar soporte
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Tu navegador no soporta acceso a la cámara.\nUsa Chrome, Edge o Firefox actualizado.');
        return;
    }

    const modal = document.getElementById('scannerModal');
    modal.style.display = 'flex';
    document.getElementById('scannerEstado').textContent = 'Iniciando cámara...';
    document.getElementById('scannerEstado').style.color = 'var(--text-muted, #888)';

    try {
        _codeReader = new ZXing.BrowserMultiFormatReader();

        // Listar cámaras disponibles y preferir la trasera
        const devices = await _codeReader.listVideoInputDevices();
        const camara  = devices.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('trasera') ||
            d.label.toLowerCase().includes('rear')
        ) || devices[devices.length - 1]; // última suele ser trasera en móviles

        if (!camara) throw new Error('No se encontró ninguna cámara disponible.');

        _escaneando = true;
        document.getElementById('scannerEstado').textContent = 'Apunta al código de barras...';

        // Arrancar lectura continua
        await _codeReader.decodeFromVideoDevice(
            camara.deviceId,
            'videoEscaner',
            async (resultado, error) => {
                if (!_escaneando) return;

                if (resultado) {
                    const codigo = resultado.getText();
                    await procesarCodigoEscaneado(codigo);
                }
                // Los errores de "no se detectó nada" son normales, se ignoran
            }
        );
    } catch (err) {
        document.getElementById('scannerEstado').textContent = 'Error: ' + err.message;
        document.getElementById('scannerEstado').style.color = 'var(--red, #EF4444)';
        console.error('Error iniciando escáner:', err);
    }
}

// ── Procesar código detectado ─────────────────────────────────────
async function procesarCodigoEscaneado(codigo) {
    // Detener escáner inmediatamente para no detectar el mismo código dos veces
    _escaneando = false;
    _codeReader?.reset();

    document.getElementById('scannerEstado').textContent = `Código detectado: ${codigo}`;
    document.getElementById('scannerEstado').style.color = 'var(--orange, #F97316)';

    try {
        // Buscar el producto en la API por código de barras
        const producto = await ApiClient.get(
            `${API_CONFIG.endpoints.productos}/barcode/${encodeURIComponent(codigo)}`
        );

        // Cerrar modal y agregar al carrito
        cerrarEscaner();
        agregarAlCarrito(producto.idProducto);

        // Feedback visual: mostrar nombre del producto brevemente
        mostrarToast(`✔ ${producto.nombre} agregado al carrito`);

    } catch (err) {
        // Producto no encontrado — mostrar mensaje y permitir reintentar
        document.getElementById('scannerEstado').textContent =
            `Código "${codigo}" no encontrado en el catálogo.`;
        document.getElementById('scannerEstado').style.color = 'var(--red, #EF4444)';

        // Botón para reintentar
        document.getElementById('btnReintentar').style.display = 'inline-block';
    }
}

// ── Cerrar modal y liberar cámara ─────────────────────────────────
function cerrarEscaner() {
    _escaneando = false;
    _codeReader?.reset();
    _codeReader = null;

    // Apagar el stream de la cámara completamente
    const video = document.getElementById('videoEscaner');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }

    document.getElementById('scannerModal').style.display = 'none';
    document.getElementById('btnReintentar').style.display = 'none';
}

// ── Reintentar lectura ────────────────────────────────────────────
function reintentarEscaner() {
    document.getElementById('btnReintentar').style.display = 'none';
    _escaneando = true;
    _codeReader?.reset();

    document.getElementById('scannerEstado').textContent = 'Apunta al código de barras...';
    document.getElementById('scannerEstado').style.color = 'var(--text-muted, #888)';

    // Reiniciar la lectura desde el mismo video element
    _codeReader?.decodeFromVideoDevice(
        undefined,   // undefined = usa la última cámara seleccionada
        'videoEscaner',
        async (resultado) => {
            if (!_escaneando) return;
            if (resultado) await procesarCodigoEscaneado(resultado.getText());
        }
    );
}

// ── Toast de confirmación ─────────────────────────────────────────
function mostrarToast(mensaje) {
    let toast = document.getElementById('scannerToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'scannerToast';
        toast.style.cssText = `
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
            background:var(--navy,#1E293B); color:#fff; padding:12px 24px;
            border-radius:8px; font-size:14px; font-weight:600;
            box-shadow:0 4px 20px rgba(0,0,0,.3); z-index:9999;
            border-left:4px solid var(--orange,#F97316);
            transition:opacity .3s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// Exponer funciones al HTML
window.abrirEscaner    = abrirEscaner;
window.cerrarEscaner   = cerrarEscaner;
window.reintentarEscaner = reintentarEscaner;
