// backend/routes/reportesRoutes.js
const express = require('express');
const pool = require('../db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// =====================================================================
// GET /api/reports/inventory/pdf - Exportar reporte en PDF (SCRUM-76)
// =====================================================================
router.get('/inventory/pdf', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        const { rows } = await pool.query('SELECT id_producto, nombre, stock, precio FROM productos WHERE estado = true ORDER BY nombre ASC');

        // Configurar los headers para descargar el PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte_inventario.pdf');

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res); // Enviar el PDF directamente a la respuesta HTTP

        // Encabezado del documento
        doc.fontSize(20).text('Reporte Consolidado de Inventario', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Fecha de generación: ${new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(2);

        // Generar la tabla de datos dinámica
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('ID', 50, doc.y, { continued: true }).text('Producto', 100, doc.y, { continued: true }).text('Stock', 350, doc.y, { continued: true }).text('Precio', 450, doc.y);
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica');
        rows.forEach(prod => {
            doc.text(prod.id_producto.toString(), 50, doc.y, { continued: true })
                .text(prod.nombre.substring(0, 30), 100, doc.y, { continued: true })
                .text(prod.stock.toString(), 350, doc.y, { continued: true })
                .text(`$${prod.precio}`, 450, doc.y);
            doc.moveDown(0.5);
        });

        doc.end(); // Finalizar y enviar el documento
    } catch (error) {
        next(error);
    }
});

// =====================================================================
// GET /api/reports/inventory/excel - Exportar planilla en Excel (SCRUM-76)
// =====================================================================
router.get('/inventory/excel', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        const { rows } = await pool.query('SELECT id_producto, nombre, stock, precio, stock_minimo FROM productos WHERE estado = true ORDER BY id_producto ASC');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema de Inventario';
        const worksheet = workbook.addWorksheet('Consolidado Operativo');

        // Definir las columnas de la planilla Excel
        worksheet.columns = [
            { header: 'ID Producto', key: 'id_producto', width: 15 },
            { header: 'Nombre del Producto', key: 'nombre', width: 35 },
            { header: 'Stock Actual', key: 'stock', width: 15 },
            { header: 'Stock Mínimo', key: 'stock_minimo', width: 15 },
            { header: 'Precio Unitario', key: 'precio', width: 20 }
        ];

        // Estilizar el encabezado
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };

        // Insertar los datos dinámicamente
        rows.forEach(row => {
            worksheet.addRow(row);
        });

        // Configurar los headers para descargar el Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=consolidado_operativo.xlsx');

        // Escribir el archivo en la respuesta HTTP
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        next(error);
    }
});

module.exports = router;