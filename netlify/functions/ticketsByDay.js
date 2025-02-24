const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // 1) Leer parámetros ?start=YYYY-MM-DD&end=YYYY-MM-DD
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

    // 2) Variables de entorno para Jira (en Netlify)
    const baseUrl  = process.env.JIRA_BASE_URL;
    const username = process.env.JIRA_USERNAME;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (!baseUrl || !username || !apiToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Faltan JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN en variables de entorno'
        })
      };
    }

    // 3) Autenticación Basic
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    // 4) Recorremos los días
    const dailyCounts = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = new Date(d).toISOString().split('T')[0];

      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];

      // JQL: Prioridades P1,P2,P3, creadas en [dayStr, nextDayStr)
      const jql = `priority in (P1, P2, P3) AND created >= "${dayStr}" AND created < "${nextDayStr}"`;

      const jiraUrl = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;
      const response = await fetch(jiraUrl, {
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
      for (const issue of issues) {
        const priorityName = issue.fields?.priority?.name;
        if (priorityName === 'P1') p1++;
        else if (priorityName === 'P2') p2++;
        else if (priorityName === 'P3') p3++;
      }

      dailyCounts[dayStr] = { p1, p2, p3 };
    }

    // 5) Respuesta
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
