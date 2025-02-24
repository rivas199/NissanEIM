const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // 1) Leer parámetros de la URL ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const { start, end } = event.queryStringParameters || {};
    if (!start || !end) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan parámetros "start" y "end" en la query' })
      };
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Fechas inválidas' })
      };
    }

    // 2) Credenciales y URL base de Jira (variables de entorno en Netlify)
    const baseUrl  = process.env.JIRA_BASE_URL;     // p.ej. "https://tu-dominio.atlassian.net"
    const username = process.env.JIRA_USERNAME;     // tu usuario/email de Jira
    const apiToken = process.env.JIRA_API_TOKEN;    // tu token de Jira (no password)

    if (!baseUrl || !username || !apiToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Faltan variables de entorno JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN'
        })
      };
    }

    // 3) Preparar autorización básica para Jira
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    // Objeto donde guardaremos los conteos diarios
    const dailyCounts = {};

    // 4) Iterar día a día
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      // Formatear a "YYYY-MM-DD"
      const dayStr = day.toISOString().split('T')[0];
      const nextDayStr = nextDay.toISOString().split('T')[0];

      // JQL para filtrar solo P1, P2, P3, creados entre dayStr y nextDayStr
      // Ajusta si tus prioridades se llaman distinto.
      const jql = `priority in (P1,P2,P3) AND created >= "${dayStr}" AND created < "${nextDayStr}"`;

      // Llamada a la API de Jira (maxResults=1000, ojo si hay más de 1000 tickets/día)
      const searchUrl = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error en Jira API, día ${dayStr}: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const issues = data.issues || [];

      // 5) Contar cuántos tickets por prioridad
      let p1 = 0, p2 = 0, p3 = 0;
      for (const issue of issues) {
        const priorityName = issue.fields?.priority?.name;
        if (priorityName === 'P1') p1++;
        else if (priorityName === 'P2') p2++;
        else if (priorityName === 'P3') p3++;
      }

      // Guardamos los totales en el objeto
      dailyCounts[dayStr] = { p1, p2, p3 };
    }

    // 6) Respuesta final
    return {
      statusCode: 200,
      body: JSON.stringify({ dailyCounts })
    };

  } catch (error) {
    console.error('Error en ticketsByday:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
