// src/services/reportes.service.js
// Generador de reportes operativos en Excel y PDF (SCRUM-76, HU-15).
//
// Cada reporte del catálogo es una consulta a la base más sus columnas; con
// eso se arma el archivo en el formato pedido. Los archivos se generan en el
// momento, con los datos del día, y se guardan unos minutos en memoria para
// que listar y descargar no repitan el trabajo.
//
// En el encabezado van los datos de la empresa (HU-003): razón social, NIT,
// teléfono y dirección.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');

const MINUTOS_CACHE = 5;
const DIAS = 30;                 // período de los reportes "por período"
const MAXIMO_FILAS = 20000;      // tope por reporte, para no agotar la memoria

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '');
const hoyColombia = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

// tipo de columna: texto (por defecto) | numero | dinero | fecha
const CATALOGO = [
    {
        id: 1, clave: 'inventario-actual', formato: 'EXCEL', categoria: 'INVENTARIO',
        nombre: 'Inventario actual',
        descripcion: 'Stock de Bodega y Almacén por producto, con mínimos y valor por precio de compra.',
        periodo: 'A la fecha',
        consulta: 'INVENTARIO',
    },
    {
        id: 2, clave: 'inventario-actual', formato: 'PDF', categoria: 'INVENTARIO',
        nombre: 'Inventario actual (PDF)',
        descripcion: 'Consolidado de existencias por producto, listo para imprimir.',
        periodo: 'A la fecha',
        consulta: 'INVENTARIO',
    },
    {
        id: 3, clave: 'ventas-por-periodo', formato: 'EXCEL', categoria: 'VENTAS',
        nombre: 'Ventas por período',
        descripcion: 'Detalle de las ventas del rango, con cliente, vendedor, método de pago y total.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'VENTAS',
    },
    {
        id: 4, clave: 'ventas-por-metodo-pago', formato: 'PDF', categoria: 'FINANZAS',
        nombre: 'Ventas por método de pago',
        descripcion: 'Totales agrupados por efectivo, Nequi, Daviplata, transferencia y tarjeta.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'METODOS_PAGO',
    },
    {
        id: 5, clave: 'movimientos-inventario', formato: 'EXCEL', categoria: 'INVENTARIO',
        nombre: 'Movimientos de inventario (Kardex)',
        descripcion: 'Entradas, salidas, traslados y ajustes con sus saldos y responsable.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'MOVIMIENTOS',
    },
    {
        id: 6, clave: 'pedidos', formato: 'EXCEL', categoria: 'PEDIDOS',
        nombre: 'Pedidos de clientes',
        descripcion: 'Pedidos del rango con su estado, fecha pactada, vencimiento y total.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'PEDIDOS',
    },
    {
        id: 7, clave: 'clientes', formato: 'EXCEL', categoria: 'CLIENTES',
        nombre: 'Clientes',
        descripcion: 'Directorio de clientes con sus compras y pedidos acumulados.',
        periodo: 'A la fecha',
        consulta: 'CLIENTES',
    },
    {
        id: 8, clave: 'pagos-digitales', formato: 'EXCEL', categoria: 'FINANZAS',
        nombre: 'Pagos digitales por conciliar',
        descripcion: 'Pagos por Nequi, Daviplata y transferencia con su referencia y estado de conciliación.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'PAGOS',
    },
    {
        id: 9, clave: 'log-auditoria', formato: 'PDF', categoria: 'FINANZAS',
        nombre: 'Log de auditoría',
        descripcion: 'Ajustes de inventario, anulaciones, cancelaciones y cambios de precio con su responsable.',
        periodo: `Últimos ${DIAS} días`,
        consulta: 'AUDITORIA',
    },
];

// Consultas y columnas. ancho: proporción de la columna en el PDF.
const CONSULTAS = {
    INVENTARIO: {
        titulo: 'Reporte consolidado de inventario',
        sql: `SELECT p.sku, p.nombre, c.nombre AS categoria, u.abreviatura AS unidad,
                     p.stock_bodega, p.stock_almacen, p.stock_total,
                     p.stock_minimo_bodega, p.stock_minimo_almacen,
                     p.precio_compra, p.precio_venta, p.stock_total * p.precio_compra AS valor
              FROM productos p
              JOIN categorias c ON c.id_categoria = p.id_categoria
              JOIN unidades_medida u ON u.id_unidad = p.id_unidad
              WHERE p.estado
              ORDER BY p.nombre
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'sku', titulo: 'SKU', ancho: 9 },
            { clave: 'nombre', titulo: 'Producto', ancho: 24 },
            { clave: 'categoria', titulo: 'Categoría', ancho: 11, soloExcel: true },
            { clave: 'unidad', titulo: 'Und.', ancho: 5 },
            { clave: 'stock_bodega', titulo: 'Bodega', tipo: 'numero', ancho: 8 },
            { clave: 'stock_almacen', titulo: 'Almacén', tipo: 'numero', ancho: 8 },
            { clave: 'stock_total', titulo: 'Total', tipo: 'numero', ancho: 8 },
            { clave: 'stock_minimo_bodega', titulo: 'Mín. Bodega', tipo: 'numero', ancho: 8, soloExcel: true },
            { clave: 'stock_minimo_almacen', titulo: 'Mín. Almacén', tipo: 'numero', ancho: 8, soloExcel: true },
            { clave: 'precio_compra', titulo: 'Costo', tipo: 'dinero', ancho: 11 },
            { clave: 'precio_venta', titulo: 'Precio venta', tipo: 'dinero', ancho: 11 },
            { clave: 'valor', titulo: 'Valor inventario', tipo: 'dinero', ancho: 13, total: true },
        ],
    },
    VENTAS: {
        titulo: 'Ventas por período',
        sql: `SELECT v.id_venta, v.fecha_venta, coalesce(c.nombre, 'Consumidor final') AS cliente,
                     u.nombre_completo AS vendedor, mp.nombre AS metodo_pago, v.referencia_pago,
                     v.subtotal, v.descuento, v.total, v.estado, v.id_pedido
              FROM ventas v
              JOIN usuarios u ON u.id_usuario = v.id_usuario
              JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
              LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
              WHERE v.fecha_venta >= now() - interval '${DIAS} days'
              ORDER BY v.fecha_venta DESC
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'id_venta', titulo: 'Venta', tipo: 'numero', ancho: 7 },
            { clave: 'fecha_venta', titulo: 'Fecha', tipo: 'fecha', ancho: 16 },
            { clave: 'cliente', titulo: 'Cliente', ancho: 20 },
            { clave: 'vendedor', titulo: 'Vendedor', ancho: 16 },
            { clave: 'metodo_pago', titulo: 'Método de pago', ancho: 14 },
            { clave: 'referencia_pago', titulo: 'Referencia', ancho: 12, soloExcel: true },
            { clave: 'subtotal', titulo: 'Subtotal', tipo: 'dinero', ancho: 11, soloExcel: true },
            { clave: 'descuento', titulo: 'Descuento', tipo: 'dinero', ancho: 10, soloExcel: true },
            { clave: 'total', titulo: 'Total', tipo: 'dinero', ancho: 12 },
            { clave: 'estado', titulo: 'Estado', ancho: 10 },
            { clave: 'id_pedido', titulo: 'Pedido', tipo: 'numero', ancho: 7, soloExcel: true },
        ],
    },
    METODOS_PAGO: {
        titulo: 'Ventas por método de pago',
        sql: `SELECT mp.nombre AS metodo_pago, count(v.id_venta) AS transacciones,
                     coalesce(sum(v.total), 0) AS total,
                     coalesce(round(100.0 * sum(v.total) / nullif(sum(sum(v.total)) OVER (), 0), 1), 0) AS participacion
              FROM metodos_pago mp
              LEFT JOIN ventas v ON v.id_metodo_pago = mp.id_metodo_pago AND v.estado = 'COMPLETADA'
                                AND v.fecha_venta >= now() - interval '${DIAS} days'
              WHERE mp.estado
              GROUP BY mp.id_metodo_pago, mp.nombre
              ORDER BY total DESC, mp.nombre`,
        columnas: [
            { clave: 'metodo_pago', titulo: 'Método de pago', ancho: 34 },
            { clave: 'transacciones', titulo: 'Transacciones', tipo: 'numero', ancho: 18, total: true },
            { clave: 'total', titulo: 'Total vendido', tipo: 'dinero', ancho: 26, total: true },
            { clave: 'participacion', titulo: '% del total', tipo: 'numero', ancho: 16 },
        ],
    },
    MOVIMIENTOS: {
        titulo: 'Movimientos de inventario',
        sql: `SELECT m.id_movimiento, m.fecha_movimiento, p.sku, p.nombre AS producto, m.tipo_movimiento,
                     m.ubicacion_origen, m.ubicacion_destino, m.cantidad, m.costo_unitario,
                     m.saldo_bodega, m.saldo_almacen, u.nombre_completo AS usuario,
                     coalesce('Venta ' || m.id_venta, 'Pedido ' || m.id_pedido, 'Compra ' || m.id_compra, m.documento_referencia) AS origen,
                     m.motivo
              FROM movimientos_inventario m
              JOIN productos p ON p.id_producto = m.id_producto
              JOIN usuarios u ON u.id_usuario = m.id_usuario
              WHERE m.fecha_movimiento >= now() - interval '${DIAS} days'
              ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'id_movimiento', titulo: 'Mov.', tipo: 'numero', ancho: 7 },
            { clave: 'fecha_movimiento', titulo: 'Fecha', tipo: 'fecha', ancho: 16 },
            { clave: 'sku', titulo: 'SKU', ancho: 10 },
            { clave: 'producto', titulo: 'Producto', ancho: 22 },
            { clave: 'tipo_movimiento', titulo: 'Tipo', ancho: 16 },
            { clave: 'ubicacion_origen', titulo: 'Origen', ancho: 9 },
            { clave: 'ubicacion_destino', titulo: 'Destino', ancho: 9 },
            { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero', ancho: 9 },
            { clave: 'costo_unitario', titulo: 'Costo unit.', tipo: 'dinero', ancho: 11 },
            { clave: 'saldo_bodega', titulo: 'Saldo Bodega', tipo: 'numero', ancho: 10 },
            { clave: 'saldo_almacen', titulo: 'Saldo Almacén', tipo: 'numero', ancho: 10 },
            { clave: 'usuario', titulo: 'Usuario', ancho: 16 },
            { clave: 'origen', titulo: 'Documento', ancho: 14 },
            { clave: 'motivo', titulo: 'Motivo', ancho: 24 },
        ],
    },
    PEDIDOS: {
        titulo: 'Pedidos de clientes',
        sql: `SELECT p.id_pedido, p.fecha_solicitud, c.nombre AS cliente, c.telefono, u.nombre_completo AS registrado_por,
                     p.estado, p.fecha_entrega_pactada,
                     CASE WHEN p.fecha_entrega_pactada < now() AND p.estado NOT IN ('ENTREGADO', 'CANCELADO') THEN 'Sí' ELSE 'No' END AS vencido,
                     p.direccion_entrega, p.total, v.id_venta
              FROM pedidos p
              JOIN clientes c ON c.id_cliente = p.id_cliente
              JOIN usuarios u ON u.id_usuario = p.id_usuario
              LEFT JOIN ventas v ON v.id_pedido = p.id_pedido
              WHERE p.fecha_solicitud >= now() - interval '${DIAS} days'
              ORDER BY p.fecha_solicitud DESC
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'id_pedido', titulo: 'Pedido', tipo: 'numero', ancho: 7 },
            { clave: 'fecha_solicitud', titulo: 'Solicitado', tipo: 'fecha', ancho: 16 },
            { clave: 'cliente', titulo: 'Cliente', ancho: 22 },
            { clave: 'telefono', titulo: 'Teléfono', ancho: 12 },
            { clave: 'registrado_por', titulo: 'Registró', ancho: 16 },
            { clave: 'estado', titulo: 'Estado', ancho: 14 },
            { clave: 'fecha_entrega_pactada', titulo: 'Entrega pactada', tipo: 'fecha', ancho: 16 },
            { clave: 'vencido', titulo: 'Vencido', ancho: 8 },
            { clave: 'direccion_entrega', titulo: 'Dirección', ancho: 24 },
            { clave: 'total', titulo: 'Total', tipo: 'dinero', ancho: 12 },
            { clave: 'id_venta', titulo: 'Venta', tipo: 'numero', ancho: 7 },
        ],
    },
    CLIENTES: {
        titulo: 'Clientes',
        sql: `SELECT c.tipo_identificacion, c.identificacion, c.nombre, c.telefono, c.correo, c.direccion,
                     CASE WHEN c.estado THEN 'Activo' ELSE 'Inactivo' END AS estado,
                     (SELECT count(*) FROM ventas v WHERE v.id_cliente = c.id_cliente AND v.estado = 'COMPLETADA') AS compras,
                     (SELECT coalesce(sum(v.total), 0) FROM ventas v WHERE v.id_cliente = c.id_cliente AND v.estado = 'COMPLETADA') AS total_comprado,
                     (SELECT count(*) FROM pedidos p WHERE p.id_cliente = c.id_cliente) AS pedidos
              FROM clientes c
              ORDER BY c.nombre
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'tipo_identificacion', titulo: 'Tipo', ancho: 6 },
            { clave: 'identificacion', titulo: 'Documento', ancho: 14 },
            { clave: 'nombre', titulo: 'Nombre', ancho: 26 },
            { clave: 'telefono', titulo: 'Teléfono', ancho: 13 },
            { clave: 'correo', titulo: 'Correo', ancho: 24 },
            { clave: 'direccion', titulo: 'Dirección', ancho: 26 },
            { clave: 'estado', titulo: 'Estado', ancho: 9 },
            { clave: 'compras', titulo: 'Compras', tipo: 'numero', ancho: 9 },
            { clave: 'total_comprado', titulo: 'Total comprado', tipo: 'dinero', ancho: 14 },
            { clave: 'pedidos', titulo: 'Pedidos', tipo: 'numero', ancho: 9 },
        ],
    },
    PAGOS: {
        titulo: 'Pagos digitales y su conciliación',
        sql: `SELECT pd.id_venta, v.fecha_venta, mp.nombre AS metodo_pago, pd.referencia, v.total,
                     v.estado AS estado_venta, pd.estado AS conciliacion,
                     CASE WHEN pd.comprobante_nombre IS NULL THEN 'No' ELSE 'Sí' END AS comprobante,
                     cu.nombre_completo AS conciliado_por, pd.conciliado_en, pd.observacion
              FROM pagos_digitales pd
              JOIN ventas v ON v.id_venta = pd.id_venta
              JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
              LEFT JOIN usuarios cu ON cu.id_usuario = pd.conciliado_por
              WHERE v.fecha_venta >= now() - interval '${DIAS} days'
              ORDER BY v.fecha_venta DESC
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'id_venta', titulo: 'Venta', tipo: 'numero', ancho: 7 },
            { clave: 'fecha_venta', titulo: 'Fecha', tipo: 'fecha', ancho: 16 },
            { clave: 'metodo_pago', titulo: 'Método', ancho: 16 },
            { clave: 'referencia', titulo: 'Referencia', ancho: 16 },
            { clave: 'total', titulo: 'Valor', tipo: 'dinero', ancho: 12 },
            { clave: 'estado_venta', titulo: 'Venta', ancho: 11 },
            { clave: 'conciliacion', titulo: 'Conciliación', ancho: 12 },
            { clave: 'comprobante', titulo: 'Comprobante', ancho: 11 },
            { clave: 'conciliado_por', titulo: 'Concilió', ancho: 16 },
            { clave: 'conciliado_en', titulo: 'Fecha conciliación', tipo: 'fecha', ancho: 16 },
            { clave: 'observacion', titulo: 'Observación', ancho: 26 },
        ],
    },
    AUDITORIA: {
        titulo: 'Log de auditoría',
        sql: `SELECT l.id_log, l.fecha, u.nombre_completo AS usuario, a.nombre_completo AS autorizador,
                     l.accion, l.entidad || ' #' || l.id_entidad AS registro, l.justificacion
              FROM log_auditoria l
              JOIN usuarios u ON u.id_usuario = l.id_usuario
              LEFT JOIN usuarios a ON a.id_usuario = l.id_usuario_autorizador
              WHERE l.fecha >= now() - interval '${DIAS} days'
              ORDER BY l.fecha DESC, l.id_log DESC
              LIMIT ${MAXIMO_FILAS}`,
        columnas: [
            { clave: 'id_log', titulo: 'N.°', tipo: 'numero', ancho: 6 },
            { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 15 },
            { clave: 'usuario', titulo: 'Usuario', ancho: 15 },
            { clave: 'autorizador', titulo: 'Autorizó', ancho: 13 },
            { clave: 'accion', titulo: 'Acción', ancho: 17 },
            { clave: 'registro', titulo: 'Registro', ancho: 12 },
            { clave: 'justificacion', titulo: 'Justificación', ancho: 30 },
        ],
    },
};

async function datosEmpresa() {
    const { rows } = await pool.query('SELECT razon_social, nit, telefono, direccion FROM empresa LIMIT 1');
    return rows[0] || { razon_social: 'SIMO', nit: '', telefono: null, direccion: null };
}

const valorCelda = (fila, columna) => {
    const v = fila[columna.clave];
    if (v === null || v === undefined) return '';
    if (columna.tipo === 'numero' || columna.tipo === 'dinero') return Number(v);
    if (columna.tipo === 'fecha') return fechaHora(v);
    return String(v);
};

const totales = (filas, columnas) => columnas.map((c) => (
    c.total ? filas.reduce((suma, f) => suma + Number(f[c.clave] || 0), 0) : null
));

// ------------------------------------------------------------------ Excel
async function aExcel(reporte, consulta, filas, empresa) {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'SIMO';
    libro.created = new Date();
    const hoja = libro.addWorksheet(reporte.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const { columnas } = consulta;

    hoja.addRow([empresa.razon_social]).font = { bold: true, size: 14 };
    hoja.addRow([[empresa.nit && `NIT ${empresa.nit}`, empresa.telefono, empresa.direccion].filter(Boolean).join(' · ')]);
    hoja.addRow([consulta.titulo]).font = { bold: true, size: 12 };
    hoja.addRow([`Período: ${reporte.periodo} · Generado: ${fechaHora(new Date())} · ${filas.length} registro(s)`]);
    hoja.addRow([]);

    const encabezado = hoja.addRow(columnas.map((c) => c.titulo));
    encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    hoja.views = [{ state: 'frozen', ySplit: encabezado.number }];
    hoja.autoFilter = { from: { row: encabezado.number, column: 1 }, to: { row: encabezado.number, column: columnas.length } };

    for (const fila of filas) hoja.addRow(columnas.map((c) => valorCelda(fila, c)));

    const suma = totales(filas, columnas);
    if (suma.some((v) => v !== null)) {
        const filaTotal = hoja.addRow(suma.map((v, i) => (v !== null ? v : (i === 0 ? 'TOTAL' : ''))));
        filaTotal.font = { bold: true };
    }
    columnas.forEach((c, i) => {
        const columna = hoja.getColumn(i + 1);
        columna.width = Math.max(10, Math.round(c.ancho * 1.3));
        if (c.tipo === 'dinero') columna.numFmt = '"$"#,##0.00';
        if (c.tipo === 'numero') columna.numFmt = '#,##0.###';
    });
    return Buffer.from(await libro.xlsx.writeBuffer());
}

// -------------------------------------------------------------------- PDF
const formatoPdf = (valor, columna) => {
    if (valor === '') return '';
    if (columna.tipo === 'dinero') return `$${valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    if (columna.tipo === 'numero') return valor.toLocaleString('es-CO', { maximumFractionDigits: 3 });
    return valor;
};

function aPdf(reporte, consulta, filas, empresa) {
    return new Promise((resolver, rechazar) => {
        const columnas = consulta.columnas.filter((c) => !c.soloExcel);
        const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: columnas.length > 6 ? 'landscape' : 'portrait', bufferPages: true });
        const partes = [];
        doc.on('data', (parte) => partes.push(parte));
        doc.on('end', () => resolver(Buffer.concat(partes)));
        doc.on('error', rechazar);

        const izquierda = doc.page.margins.left;
        const anchoUtil = doc.page.width - izquierda - doc.page.margins.right;
        const sumaAnchos = columnas.reduce((s, c) => s + c.ancho, 0);
        const anchos = columnas.map((c) => (c.ancho / sumaAnchos) * anchoUtil);
        const alineacion = (c) => (c.tipo === 'numero' || c.tipo === 'dinero' ? 'right' : 'left');

        doc.font('Helvetica-Bold').fontSize(15).text(empresa.razon_social, { align: 'center' });
        doc.font('Helvetica').fontSize(9)
            .text([empresa.nit && `NIT ${empresa.nit}`, empresa.telefono, empresa.direccion].filter(Boolean).join(' · '), { align: 'center' });
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(13).text(consulta.titulo, { align: 'center' });
        doc.font('Helvetica').fontSize(9)
            .text(`Período: ${reporte.periodo} · Generado: ${fechaHora(new Date())} · ${filas.length} registro(s)`, { align: 'center' });
        doc.moveDown(0.8);

        const dibujarFila = (celdas, { negrita = false, fondo = null } = {}) => {
            doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
            const alto = Math.max(...celdas.map((texto, i) => doc.heightOfString(String(texto), { width: anchos[i] - 6 }))) + 6;
            if (doc.y + alto > doc.page.height - doc.page.margins.bottom - 14) {
                doc.addPage();
                if (!negrita) dibujarFila(columnas.map((c) => c.titulo), { negrita: true, fondo: '#1F4E79' });
                doc.font('Helvetica').fontSize(8);
            }
            const y = doc.y;
            if (fondo) doc.rect(izquierda, y, anchoUtil, alto).fill(fondo);
            doc.fillColor(fondo === '#1F4E79' ? '#FFFFFF' : '#000000');
            let x = izquierda;
            celdas.forEach((texto, i) => {
                doc.text(String(texto), x + 3, y + 3, { width: anchos[i] - 6, align: alineacion(columnas[i]) });
                x += anchos[i];
            });
            doc.fillColor('#000000');
            doc.moveTo(izquierda, y + alto).lineTo(izquierda + anchoUtil, y + alto).strokeColor('#DDDDDD').lineWidth(0.5).stroke();
            doc.y = y + alto;
        };

        dibujarFila(columnas.map((c) => c.titulo), { negrita: true, fondo: '#1F4E79' });
        if (filas.length === 0) {
            doc.moveDown(1).font('Helvetica-Oblique').fontSize(10).text('No hay registros en el período.', izquierda, doc.y, { align: 'center', width: anchoUtil });
        }
        filas.forEach((fila, n) => dibujarFila(
            columnas.map((c) => formatoPdf(valorCelda(fila, c), c)),
            { fondo: n % 2 ? '#F5F7FA' : null }
        ));
        const suma = totales(filas, columnas);
        if (filas.length > 0 && suma.some((v) => v !== null)) {
            dibujarFila(suma.map((v, i) => (v !== null ? formatoPdf(v, columnas[i]) : (i === 0 ? 'TOTAL' : ''))), { negrita: true, fondo: '#E8EEF4' });
        }

        // Numeración de páginas
        const paginas = doc.bufferedPageRange();
        for (let i = 0; i < paginas.count; i++) {
            doc.switchToPage(paginas.start + i);
            doc.font('Helvetica').fontSize(8).fillColor('#666666')
                .text(`SIMO · Página ${i + 1} de ${paginas.count}`, izquierda, doc.page.height - doc.page.margins.bottom - 4,
                    { width: anchoUtil, align: 'right', lineBreak: false });
        }
        doc.end();
    });
}

// ------------------------------------------------------------------ caché
const cache = new Map(); // id -> { datos, generado, vence }
const MIME = {
    EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    PDF: 'application/pdf',
};
const EXTENSION = { EXCEL: 'xlsx', PDF: 'pdf' };

function buscarReporte(id) {
    return CATALOGO.find((r) => r.id === Number(id)) || null;
}

async function generarReporte(reporte, { forzar = false } = {}) {
    const guardado = cache.get(reporte.id);
    if (!forzar && guardado && guardado.vence > Date.now()) return guardado;

    const consulta = CONSULTAS[reporte.consulta];
    const [{ rows: filas }, empresa] = await Promise.all([pool.query(consulta.sql), datosEmpresa()]);
    const datos = reporte.formato === 'EXCEL'
        ? await aExcel(reporte, consulta, filas, empresa)
        : await aPdf(reporte, consulta, filas, empresa);
    const generado = new Date();
    const archivo = {
        datos,
        generado,
        vence: Date.now() + MINUTOS_CACHE * 60e3,
        filas: filas.length,
        mime: MIME[reporte.formato],
        nombreArchivo: `${reporte.clave}-${hoyColombia()}.${EXTENSION[reporte.formato]}`,
    };
    cache.set(reporte.id, archivo);
    return archivo;
}

// Catálogo con el tamaño y la fecha de cada archivo (contrato del frontend)
async function listarReportes() {
    const archivos = await Promise.all(CATALOGO.map((r) => generarReporte(r)));
    return CATALOGO.map((r, i) => ({
        id_reporte: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        categoria: r.categoria,
        formato: r.formato,
        periodo: r.periodo,
        fecha_generacion: archivos[i].generado,
        tamano_bytes: archivos[i].datos.length,
        nombre_archivo: archivos[i].nombreArchivo,
        registros: archivos[i].filas,
    }));
}

module.exports = { listarReportes, buscarReporte, generarReporte };
