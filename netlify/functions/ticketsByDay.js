// ticketsByDay.js
const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("JIRA_TOKEN no está definido");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "JIRA_TOKEN no está definido" })
    };
  }

  let fetchModule;
  try {
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }
  const fetch = fetchModule.default;
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Mapeo de prioridad a duración fija en días:
  // P1: 2 días, P2: 5 días, P3: 10 días
  const durationMap = {
    P1: 2,
    P2: 5,
    P3: 10
  };

  // JQL para recuperar los tickets (ajusta según tus campos y necesidades)
  const jql = `project = PNCR
               AND issuetype in (subTaskIssueTypes())
               AND status in (Open, "In Testing", Scheduled, Blocked)
               AND assignee in (
                 c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0,
                 888024c2-03a4-402e-b2a8-71a57b8e900d,
                 f7637a0a-ceb3-4ecf-babc-7674824a8b3d,
                 c530c7d6-3d70-4095-a64e-3cd4d9c4d746,
                 4e95e2b2-53b1-4940-931e-019d149e85eb
               )
               AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
               ORDER BY created DESC`;
  
  const encodedJql = encodeURIComponent(jql);
  // Limitar a 50 issues para no sobrecargar la función
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50`;
  
  console.log("Encoded Jira URL:", jiraUrl);
  
  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent: agent
    });
    
    console.log("Jira API response status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }
    
    const data = await response.json();
    console.log("Total issues recibidos:", data.issues.length);
    
    // 1. Recopilar eventos: para cada ticket, registramos +1 en el día de inicio y -1 en el día siguiente al último día (según la duración fija)
    const events = {}; // Estructura: { "YYYY-MM-DD": { p1Delta, p2Delta, p3Delta } }
    
    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const startStr = issue.fields.startDate;  // Asegúrate de que este es el campo correcto en Jira
      if (!startStr) {
        console.log(`Issue ${issue.key} sin startDate, se ignora.`);
        return;
      }
      
      let p = "";
      if (priorityName.includes("P1")) p = "P1";
      else if (priorityName.includes("P2")) p = "P2";
      else if (priorityName.includes("P3")) p = "P3";
      if (!p) {
        console.log(`Issue ${issue.key} con prioridad no reconocida: ${priorityName}`);
        return;
      }
      
      const daysToCount = durationMap[p];
      const startDate = new Date(startStr);
      // El último día incluido es (startDate + daysToCount - 1)
      const endDate = new Date(startDate.getTime() + (daysToCount - 1) * 86400000);
      // El día siguiente al final, donde se aplicará el decremento
      const dayAfterEnd = new Date(endDate.getTime() + 86400000);
      
      const startKey = startDate.toISOString().split("T")[0];
      const afterEndKey = dayAfterEnd.toISOString().split("T")[0];
      
      // Incremento en startKey
      if (!events[startKey]) events[startKey] = { p1Delta: 0, p2Delta: 0, p3Delta: 0 };
      if (p === "P1") events[startKey].p1Delta++;
      if (p === "P2") events[startKey].p2Delta++;
      if (p === "P3") events[startKey].p3Delta++;
      
      // Decremento en afterEndKey
      if (!events[afterEndKey]) events[afterEndKey] = { p1Delta: 0, p2Delta: 0, p3Delta: 0 };
      if (p === "P1") events[afterEndKey].p1Delta--;
      if (p === "P2") events[afterEndKey].p2Delta--;
      if (p === "P3") events[afterEndKey].p3Delta--;
    });
    
    // 2. Ordenar las fechas y acumular los eventos para obtener el total por día
    const sortedDates = Object.keys(events).sort();  // Orden cronológico
    let currentP1 = 0, currentP2 = 0, currentP3 = 0;
    const grouped = {}; // Resultado: { "YYYY-MM-DD": { p1, p2, p3, total } }
    
    sortedDates.forEach(date => {
      const { p1Delta, p2Delta, p3Delta } = events[date];
      currentP1 += p1Delta;
      currentP2 += p2Delta;
      currentP3 += p3Delta;
      grouped[date] = {
        p1: currentP1,
        p2: currentP2,
        p3: currentP3,
        total: currentP1 + currentP2 + currentP3
      };
    });
    
    // 3. Verificar si hay días con más de 14 tickets corriendo
    Object.keys(grouped).forEach(date => {
      if (grouped[date].total > 14) {
        console.log(`ALERTA: El día ${date} tiene ${grouped[date].total} tickets corriendo.`);
      }
    });
    
    console.log("Tickets agrupados por día:", grouped);
    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("Error en la consulta a Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
