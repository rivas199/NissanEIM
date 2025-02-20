const express = require('express');
const fetch = require('node-fetch'); // Asegúrate de tener instalada la versión 2: npm install node-fetch@2
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Creamos un agente HTTPS que ignora la verificación del certificado
const agent = new https.Agent({
  rejectUnauthorized: false
});

app.use(cors());          // Permitir solicitudes CORS
app.use(express.json());  // Parsear solicitudes JSON

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('¡Hola, este es tu backend funcionando!');
});

// Endpoint proxy para redirigir solicitudes POST a la API remota
app.post('/api/proxy', async (req, res) => {
  try {
    // Recibe los datos enviados desde el frontend
    const requestBody = req.body;
    console.log("Datos recibidos del frontend:", requestBody);

    // Realiza la solicitud POST a la API remota usando el agente HTTPS personalizado
    const response = await fetch("https://gpas-ws-eu-prod.autodatadirect.com/gpas-ws/api/v1/eim2spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      agent: agent
    });

    // Manejar errores de la API remota
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en la API remota:", errorText);
      return res.status(response.status).send(errorText);
    }

    // Parsear y enviar la respuesta JSON al cliente
    const data = await response.json();
    console.log("Respuesta de la API:", data);
    res.json(data);
  } catch (error) {
    console.error("Error en el proxy:", error);
    res.status(500).json({ error: "Error interno en el proxy", details: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://127.0.0.1:${PORT}`);
});
