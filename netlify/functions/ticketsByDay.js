const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // 1) Parámetros ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const { start, end } = event.queryStringParameters || {};
    if (!start || !end) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan parámetros "start" y "end"' })
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

    // 2) Credenciales Jira (variables de entorno en Netlify)
    const baseUrl  = process.env.JIRA_BASE_URL;   // e.g.: "https://miempresa.atlassian.net"
    const username = process.env.JIRA_USERNAME;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (!baseUrl || !username || !apiToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Faltan variables de entorno: JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN'
        })
      };
    }

    // 3) Autenticación básica
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    const dailyCounts = {};

    // 4) Bucle día a día
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const currentDay = new Date(d);
      const nextDay = new Date(currentDay);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayStr = currentDay.toISOString().split('T')[0];
      const nextDayStr = nextDay.toISOString().split('T')[0];

      // Filtra tickets P1, P2, P3 creados en dayStr
      const jql = `priority in (P1, P2, P3) AND created >= "${dayStr}" AND created < "${nextDayStr}"`;
      const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error Jira (${dayStr}): ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const issues = data.issues || [];

      let p1 = 0, p2 = 0, p3 = 0;
      issues.forEach(issue => {
        const priorityName = issue.fields?.priority?.name;
        if (priorityName === 'P1') p1++;
        else if (priorityName === 'P2') p2++;
        else if (priorityName === 'P3') p3++;
      });

      dailyCounts[dayStr] = { p1, p2, p3 };
    }

    // 5) Devolver respuesta
    return {
      statusCode: 200,
      body: JSON.stringify({ dailyCounts })
    };

  } catch (error) {
    console.error('Error en ticketsByDay:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
