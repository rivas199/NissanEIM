const https = require('https');

exports.handler = async (event, context) => {
  // Dynamically import node-fetch
  let fetchModule;
  try {
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" }),
    };
  }
  const fetch = fetchModule.default;

  // Create an HTTPS agent (ignores certificate errors if needed)
  const agent = new https.Agent({ rejectUnauthorized: false });

  try {
    // Parse the payload sent from the frontend
    const payload = JSON.parse(event.body);
    const apiEndpoint = payload.apiEndpoint; // Selected API endpoint from the frontend
    console.log("Forwarding request to API endpoint:", apiEndpoint);

    // Forward the request to the external API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      agent: agent
    });
    console.log("Response status from external API:", response.status);

    // Read the raw response and parse as JSON
    const text = await response.text();
    let apiData;
    try {
      apiData = JSON.parse(text);
    } catch (jsonError) {
      console.error("Error parsing API response as JSON:", jsonError, "Raw response:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid JSON response from external API", raw: text })
      };
    }
    console.log("Full API response:", apiData);

    // Save the complete original API response
    const originalResponse = apiData;

    // Extract simplified information (summary)
    let simplified = {
      eim: "N/A",
      modelYear: "N/A",
      price: "N/A",
      color: "N/A",
      grade: "N/A",
      publishedDate: "N/A"
    };

    if (apiData && apiData.eims && Array.isArray(apiData.eims) && apiData.eims.length > 0) {
      const outerObj = apiData.eims[0];
      simplified.modelYear = outerObj.year || "N/A";
      simplified.publishedDate = outerObj.publishedDate || "N/A";

      if (outerObj.versions && Array.isArray(outerObj.versions) && outerObj.versions.length > 0) {
        const version = outerObj.versions[0];
        simplified.price = version.retailPrice || "N/A";
        simplified.grade = version.gradeCode || "N/A";

        // Extract color from equipment with type "EXTERIOR_COLOR"
        if (version.equipment && Array.isArray(version.equipment)) {
          for (let eq of version.equipment) {
            if (eq.typeList && Array.isArray(eq.typeList) && eq.typeList.includes("EXTERIOR_COLOR")) {
              if (eq.name && Array.isArray(eq.name) && eq.name.length > 0) {
                const nameObj = eq.name.find(n => n.languageCode === "es") || eq.name[0];
                simplified.color = nameObj.text || "N/A";
                break;
              }
            }
          }
        }
      }
      // Extract the EIM from a nested "eims" array if available
      if (outerObj.eims && Array.isArray(outerObj.eims) && outerObj.eims.length > 0) {
        simplified.eim = outerObj.eims[0].eim || "N/A";
      }
    }

    // Build the final result with both summary and the complete original response
    const result = {
      summary: {
        eim: simplified.eim,
        modelYear: simplified.modelYear,
        price: simplified.price,
        color: simplified.color,
        grade: simplified.grade,
        publishedDate: simplified.publishedDate,
        message: `I found your EIM: ${simplified.eim}`
      },
      original: originalResponse
    };

    return {
      statusCode: response.status,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
