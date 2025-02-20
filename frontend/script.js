document.addEventListener('DOMContentLoaded', () => {
  // Obtener referencia del formulario y del contenedor donde se mostrará el resultado
  const form = document.getElementById('myForm');
  const resultEl = document.getElementById('result');

  // Escuchar el evento de envío del formulario
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevenir el comportamiento por defecto del formulario

    // Recopilar valores del formulario
    const eim = document.getElementById('eim').value;
    const modelYear = document.getElementById('modelYear').value;
    const languageCode = document.getElementById('languageCode').value;
    const countryCode = document.getElementById('countryCode').value;

    // Construir el payload según lo que espera la API
    const payload = {
      eims: [
        {
          eim: eim,
          modelYear: modelYear,
          languageCode: languageCode,
          countryCode: countryCode
        }
      ]
    };

    console.log("Payload built:", payload);

    // Enviar la solicitud POST al proxy de Netlify
    try {
      const response = await fetch('/.netlify/functions/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      const data = await response.json();
      console.log("Response from proxy:", data);
      resultEl.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      console.error("Error during API call:", error);
      resultEl.textContent = `Error: ${error.message}`;
    }
  });
});

