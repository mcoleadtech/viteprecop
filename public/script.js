// Maneja la subida del ZIP y muestra un indicador de progreso / errores.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uploadForm');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const suggestionsEl = document.getElementById('suggestions');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // Oculta mensajes previos
    errorEl.style.display = 'none';
    suggestionsEl.style.display = 'none';
    statusEl.style.color = '#333';
    statusEl.textContent = 'Procesando…';
    statusEl.style.display = 'block';
    submitBtn.disabled = true;

    const fileInput = document.getElementById('zipFile');
    if (!fileInput.files || !fileInput.files.length) {
      statusEl.style.display = 'none';
      errorEl.textContent = 'Selecciona un archivo ZIP antes de continuar.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      return;
    }
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('zipFile', file);
    formData.append('domain', document.getElementById('domain').value.trim());
    formData.append('strategy', document.getElementById('strategy').value);

    fetch('/convert', {
      method: 'POST',
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('El servidor respondió con un error.');
        }
        return response.blob();
      })
      .then((blob) => {
        // Crea un enlace para descargar el archivo
        const originalName = file.name.replace(/\.zip$/i, '');
        const downloadName = `${originalName}-seo-ssg.zip`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        statusEl.textContent = '¡Optimización completada! La descarga debería comenzar automáticamente.';
        suggestionsEl.style.display = 'block';
      })
      .catch((error) => {
        statusEl.style.display = 'none';
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      })
      .finally(() => {
        submitBtn.disabled = false;
      });
  });
});