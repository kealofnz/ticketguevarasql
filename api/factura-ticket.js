const { query } = require('./_utils/db');

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "")
         .replace(/'/g, "'");
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).send('Method Not Allowed');
    }

    const { id } = req.query;
    if (!id) {
        console.error("[Factura Ticket Final] Solicitud sin parámetro 'id'");
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(400).send('Error: Falta el parámetro "id" (ID de Venta) en la URL.');
    }
    const saleId = id;
    console.log(`[Factura Ticket Final+] Iniciando generación para Venta ID: ${saleId}`);

    try {
        const companySql = "SELECT `NOMBRE EMPRESA`, `DIRECCION`, `RTN`, `TELEFONO`, `CORREO`, `PAGINA WEB` FROM `DATOS DE FACTURA` LIMIT 1";
        const companyResults = await query(companySql);
        if (companyResults.length === 0) throw new Error("No se encontraron datos de la empresa.");
        const companyData = companyResults[0];

        const saleSql = `
            SELECT
                v.*,
                v.DESCUENTO as DESCUENTO_GLOBAL,
                c.CLIENTE,
                c.DIRECCION as DIRECCION_CLIENTE,
                c.TELEFONO as TELEFONO_CLIENTE,
                u.NOMBRE as NOMBRE_VENDEDOR
            FROM VENTA v
            LEFT JOIN CLIENTES c ON v.\`ID CLIENTE\` = c.\`ID CLIENTE\`
            LEFT JOIN USUARIO u ON v.\`ID VENDEDOR\` = u.\`ID USUARIO\`
            WHERE v.\`ID VENTA\` = ?`;
        const saleResults = await query(saleSql, [saleId]);
        if (saleResults.length === 0) throw new Error(`Venta con ID ${saleId} no encontrada.`);
        const saleData = saleResults[0];
        const descuentoGlobalVenta = parseFloat(saleData.DESCUENTO_GLOBAL || 0);

        const detailsSql = `
            SELECT d.*, p.\`NOMBRE PRODUCTO\` FROM \`DETALLE VENTA\` d LEFT JOIN PRODUCTO p ON d.ID_PRODUCTO = p.\`ID PRODUCTO\` WHERE d.\`ID VENTA\` = ?`;
        const detailsResults = await query(detailsSql, [saleId]);
        const detailsData = detailsResults;

        console.log(`[Factura Ticket ${saleId}] Calculando totales...`);
        let subTotalBrutoCalculado = 0;
        let descuentoItemsCalculado = 0;
        let totalVentaFinal = 0;
        let filasHtml = '';

        detailsData.forEach(item => {
            const cantidad = parseFloat(item.CANTIDAD || 0);
            const precioUnitario = parseFloat(item['PRECIO UNITARIO'] || 0);
            const descuentoItem = parseFloat(item.DESCUENTO || 0);
            const totalBrutoItem = (cantidad * precioUnitario);
            const subtotalItemNeto = totalBrutoItem - descuentoItem;

            subTotalBrutoCalculado += totalBrutoItem;
            descuentoItemsCalculado += descuentoItem;
            totalVentaFinal += subtotalItemNeto;

            filasHtml += `
                <tr class="item">
                    <td>${escapeHtml(item['NOMBRE PRODUCTO'] || item.ID_PRODUCTO)}</td>
                    <td style="text-align: center;">${cantidad}</td>
                    <td style="text-align: right;">${precioUnitario.toFixed(2)}</td>
                    <td style="text-align: right;">${totalBrutoItem.toFixed(2)}</td>
                </tr>
            `;
        });

        totalVentaFinal = subTotalBrutoCalculado - (descuentoItemsCalculado + descuentoGlobalVenta);

        console.log(`[Factura Ticket ${saleId}] Cálculos: SubTotalBruto=${subTotalBrutoCalculado}, DescItems=${descuentoItemsCalculado}, DescGlobal=${descuentoGlobalVenta}, TotalFinal=${totalVentaFinal}`);

        const fechaVenta = saleData['FECHA DE VENTA'] ? new Date(saleData['FECHA DE VENTA']).toLocaleDateString('es-ES') : 'N/A';
        const horaVenta = saleData['HORA VENTA'] || '';

        console.log(`[Factura Ticket ${saleId}] Construyendo HTML...`);
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(saleId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000;}
    .invoice-box{width:58mm;margin:0 auto;padding:5px;font-size:9.5px;line-height:1.2;color:#000;word-wrap:break-word;}
    .invoice-box table{width:100%;text-align:left;border-collapse:collapse;table-layout:fixed;}
    .invoice-box table td{padding:2px 0;vertical-align:top;word-wrap:break-word;}
    .invoice-box table tr.heading td{font-weight:bold;border-top:1px dashed #000;border-bottom:1px dashed #000;}
    .invoice-box table tr.item td{border-bottom:1px dashed #ddd; padding-top: 3px; padding-bottom: 3px;}
    .invoice-box table tr.total td:last-child{font-weight:bold;}
    .invoice-box tfoot tr:nth-last-child(-n+2) td {border-top:1px dashed #000; padding-top: 3px;}
    .centered-info, .message{text-align:center;margin:4px 0;}
    thead td:nth-child(1), tbody td:nth-child(1) { width: 40%; }
    thead td:nth-child(2), tbody td:nth-child(2) { width: 15%; text-align: center; }
    thead td:nth-child(3), tbody td:nth-child(3) { width: 20%; text-align: right; }
    thead td:nth-child(4), tbody td:nth-child(4) { width: 25%; text-align: right; }
    tfoot td { padding-top: 3px; }
    .seller-info { font-size: 9px; margin-top: 4px; text-align: center; }

    @media print{}
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

    <div class="seller-info">
      Vendedor: ${escapeHtml(saleData.NOMBRE_VENDEDOR || saleData['ID VENDEDOR'] || 'N/A')}
    </div>

    <div class="centered-info">
      Cliente: <span id="nomcliente">${escapeHtml(saleData['CLIENTE'] || 'N/A')}</span><br>
      <span id="direccioncliente">${escapeHtml(saleData['DIRECCION_CLIENTE'] || '')}</span><br>
      Tel: <span id="clietelefono">${escapeHtml(saleData['TELEFONO_CLIENTE'] || '')}</span>
    </div>

    <table>
      <thead>
        <tr class="heading">
          <td>Descripción</td>
          <td>Cant.</td>
          <td>Precio</td>
          <td>Total</td>
        </tr>
      </thead>
      <tbody id="filas">
        ${filasHtml}
      </tbody>
      <tfoot>
        <tr class="desc">
          <td colspan="3" style="text-align:right;">Descuento Total:</td>
          <td id="descuento_total_general" style="text-align: right;">${(descuentoItemsCalculado + descuentoGlobalVenta).toFixed(2)}</td>
        </tr>
        <tr class="total">
          <td colspan="3" style="text-align:right;">Total Venta:</td>
          <td id="totalventa" style="text-align: right;">${totalVentaFinal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="message">
      ¡Gracias por su compra!
    </div>
  </div>

<script>
  window.onload = function () {
    try {
      console.log('[Factura Ticket] Iniciando impresión automática...');
      window.print();
    } catch (e) {
      console.error("[Factura Ticket] Error al imprimir automáticamente:", e);
    }
  };
</script>

</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(htmlContent);

    } catch (error) {
        console.error(`[Factura Ticket ${saleId}] Error capturado en handler:`, error);
        res.status(500).send(`... HTML de error ...`);
    }
};
