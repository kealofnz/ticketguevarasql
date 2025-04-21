// api/_utils/db.js
const mysql = require('mysql2/promise');

// Configuración usando Environment Variables (las configurarás en Vercel)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5, // Ajusta según tu plan de Hostinger
    queueLimit: 0,
    // Verifica si Hostinger necesita SSL para conexiones remotas
    // ssl: {
    //    rejectUnauthorized: false // ¡Usar con precaución!
    // }
});

async function query(sql, params) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Error en la consulta a BD:', error.message); // Log más específico
        throw new Error('Error al ejecutar la consulta en la base de datos.'); // Error genérico para el cliente
    }
}
// Función para manejar transacciones (¡RECOMENDADO para guardar ventas!)
async function transaction(callback) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        console.log("Transaction started"); // Log
        // Ejecuta el callback pasándole la conexión para que haga las consultas
        const result = await callback(connection);
        await connection.commit();
        console.log("Transaction committed"); // Log
        return result; // Devuelve lo que el callback haya retornado
    } catch (error) {
        if (connection) {
            console.error("Transaction error, rolling back:", error.message); // Log
            await connection.rollback();
        } else {
            console.error("Error obtaining connection for transaction:", error.message);
        }
        // Re-lanzar el error para que el handler principal lo capture
        throw error;
    } finally {
        if (connection) {
            connection.release();
            console.log("Transaction connection released"); // Log
        }
    }
}


module.exports = { query, transaction, pool }; // Exportamos pool si necesitamos transacciones