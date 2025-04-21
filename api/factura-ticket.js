// api/factura-ticket.js
const { query } = require('./_utils/db'); // Importar la utilidad de DB

// Función para escapar HTML básico (prevenir inyección simple si los datos tuvieran < o >)
// VERSIÓN CORRECTA (asegúrate que sea esta)
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&")  // Correcto: & a &
         .replace(/</g, "<")   // Correcto: < a <
         .replace(/>/g, ">")   // Correcto: > a >
         .replace(/"/g, "") // Correcto: " a "
         .replace(/'/g, "'"); // Correcto: ' a ' (o ')
}


module.exports = async (req, res) => {
    // --- SOLO GET --- (AppSheet abrirá esto como una URL GET)
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).send('Method Not Allowed'); // Enviar texto simple para error
    }

    // --- OBTENER ID DE VENTA ---
    const { id } = req.query; // Obtener 'id' de la URL (?id=xxxx)
    if (!id) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(400).send('Error: Falta el parámetro "id" (ID de Venta) en la URL.');
    }
    const saleId = id; // Renombrar para claridad
    console.log(`Generando factura ticket para Venta ID: ${saleId}`);

    try {
        // --- OBTENER DATOS ---
        // 1. Datos de la Empresa (Asume una sola fila o la primera)
        const companySql = "SELECT `NOMBRE EMPRESA`, `DIRECCION`, `RTN`, `TELEFONO`, `CORREO`, `PAGINA WEB` FROM `DATOS DE FACTURA` LIMIT 1";
        const companyResults = await query(companySql);
        if (companyResults.length === 0) throw new Error("No se encontraron datos de la empresa en DATOS DE FACTURA.");
        const companyData = companyResults[0];

        // 2. Datos de la Venta y Cliente (JOIN)
        // Asegúrate que los nombres de columna en VENTA y CLIENTES sean correctos
        const saleSql = `
            SELECT v.*, c.CLIENTE, c.DIRECCION as DIRECCION_CLIENTE, c.TELEFONO as TELEFONO_CLIENTE
            FROM VENTA v
            LEFT JOIN CLIENTES c ON v.\`ID CLIENTE\` = c.\`ID CLIENTE\`
            WHERE v.\`ID VENTA\` = ?`;
        const saleResults = await query(saleSql, [saleId]);
        if (saleResults.length === 0) throw new Error(`Venta con ID ${saleId} no encontrada.`);
        const saleData = saleResults[0];

        // 3. Detalles de la Venta y Productos (JOIN)
        // Asegúrate que los nombres de columna en DETALLE VENTA y PRODUCTO sean correctos
        const detailsSql = `
            SELECT d.*, p.\`NOMBRE PRODUCTO\`
            FROM \`DETALLE VENTA\` d
            LEFT JOIN PRODUCTO p ON d.ID_PRODUCTO = p.\`ID PRODUCTO\`
            WHERE d.\`ID VENTA\` = ?`;
        const detailsResults = await query(detailsSql, [saleId]);
        const detailsData = detailsResults; // Ya es un array

        // --- PROCESAR Y CALCULAR ---
        let totalCalculado = 0;
        let descuentoCalculado = 0;
        let filasHtml = '';

        detailsData.forEach(item => {
            const cantidad = parseFloat(item.CANTIDAD || 0);
            const precioUnitario = parseFloat(item['PRECIO UNITARIO'] || 0);
            const descuentoItem = parseFloat(item.DESCUENTO || 0);
            const subtotalItem = (cantidad * precioUnitario) - descuentoItem;
            totalCalculado += subtotalItem;
            descuentoCalculado += descuentoItem;

            // Crear fila HTML para la tabla del ticket
            filasHtml += `
                <tr class="item">
                    <td>${escapeHtml(item['NOMBRE PRODUCTO'] || item.ID_PRODUCTO)}</td>
                    <td style="text-align: center;">${cantidad}</td>
                    <td style="text-align: right;">${precioUnitario.toFixed(2)}</td>
                    <td style="text-align: right;">${subtotalItem.toFixed(2)}</td>
                </tr>
            `;
        });

        const fechaVenta = saleData['FECHA DE VENTA'] ? new Date(saleData['FECHA DE VENTA']).toLocaleDateString('es-ES') : 'N/A';
        const horaVenta = saleData['HORA VENTA'] || ''; // Asume formato HH:MM:SS o similar

        // --- CONSTRUIR HTML FINAL ---
        // (El resto del código HTML que tenías antes)
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(saleId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000;}
    .invoice-box{width:58mm;margin:0 auto;padding:5px;font-size:10px;line-height:1.2;color:#000;word-wrap:break-word;}
    .invoice-box table{width:100%;text-align:left;border-collapse:collapse;}
    .invoice-box table td{padding:2px 0;vertical-align:top;}
    .invoice-box table tr.heading td{font-weight:bold;border-top:1px dashed #000;border-bottom:1px dashed #000;}
    .invoice-box table tr.item td{border-bottom:1px dashed #ddd;}
    .invoice-box table tr.total td:last-child{font-weight:bold;} /* Solo total bold*/
    .invoice-box table tr.total td {border-top:1px dashed #000;}
    .centered-info, .message{text-align:center;margin:4px 0;}
    @media print{
      @page {size: 58mm auto; margin: 0;}
      body{width:58mm;margin:0;padding:0;-webkit-print-color-adjust: exact;} /* Forzar impresión de colores/fondos si los hubiera */
      .invoice-box{padding: 0;border:none;font-size:10px; box-shadow: none;}
      button { display: none; } /* Ocultar botón al imprimir */
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="centered-info">
      <strong id="empresa">${escapeHtml(companyData['NOMBRE EMPRESA'])}</strong><br>
      <span id="factdireccion">${escapeHtml(companyData['DIRECCION'])}</span><br>
      RTN: <span id="factrtn">${escapeHtml(companyData['RTN'])}</span><br>
      Tel: <span id="facttelefono">${escapeHtml(companyData['TELEFONO'])}</span><br>
      Correo: <span id="factcorreo">${escapeHtml(companyData['CORREO'])}</span><br>
      Web: <span id="factweb">${escapeHtml(companyData['PAGINA WEB'])}</span>
    </div>

    <div class="centered-info" id="codigo">RECIBO #${escapeHtml(saleId)}<br>${fechaVenta} ${horaVenta}</div>

    <div class="centered-info">
      Cliente: <span id="nomcliente">${escapeHtml(saleData['CLIENTE'] || 'N/A')}</span><br>
      <span id="direccioncliente">${escapeHtml(saleData['DIRECCION_CLIENTE'] || '')}</span><br>
      Tel: <span id="clietelefono">${escapeHtml(saleData['TELEFONO_CLIENTE'] || '')}</span>
    </div>

    <table>
      <thead>
        <tr class="heading">
          <td>Descripción</td>
          <td style="text-align: center;">Cant.</td>
          <td style="text-align: right;">Precio</td>
          <td style="text-align: right;">Total</td>
        </tr>
      </thead>
      <tbody id="filas">
        ${filasHtml}
      </tbody>
      <tfoot>
        <tr class="total">
          <td colspan="3">Descuento Total</td>
          <td id="impto" style="text-align: right;">${descuentoCalculado.toFixed(2)}</td>
        </tr>
        <tr class="total">
          <td colspan="3">Total Venta</td>
          <td id="totalventa" style="text-align: right;">${totalCalculado.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="message">
      ¡Gracias por su compra!
    </div>
  </div>

  <script>
    // Lanzar impresión automáticamente al cargar
    window.onload = function () {
      try {
          console.log('Intentando imprimir...');
          window.print();
          // Opcional: Cerrar la ventana después de un tiempo si la impresión se lanza
          // setTimeout(function(){ window.close(); }, 3000);
      } catch(e) {
          console.error("Error al intentar imprimir:", e);
          // Mostrar un mensaje o botón alternativo si window.print falla
          document.body.innerHTML += '<p style="text-align:center; margin-top: 20px;">Error al iniciar impresión automática. Por favor, use la función de impresión de su navegador (Ctrl+P / Cmd+P).</p><button onclick="window.print()">Imprimir Manualmente</button>';
      }
    };
  </script>
</body>
</html>`;

        // --- ENVIAR RESPUESTA HTML ---
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(htmlContent);

    } catch (error) {
        // Captura cualquier error (DB, datos no encontrados, etc.)
        console.error(`Error generando factura para ID ${saleId}:`, error);
        // Enviar un error HTML simple al cliente
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(500).send(`
            <html><head><title>Error</title></head>
            <body style="font-family: sans-serif;">
                <h1>Error al generar la factura</h1>
                <p>No se pudo generar la factura para la venta ID: ${escapeHtml(saleId)}</p>
                <p><strong>Detalle del error:</strong> ${escapeHtml(error.message)}</p>
                <p>Por favor, contacte al soporte o verifique el ID de venta.</p>
            </body></html>
        `);
    }
};