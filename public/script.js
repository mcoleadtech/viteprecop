// Maneja la subida del ZIP y muestra un indicador de progreso / errores.

function openTab(evt, tabName) {
  const tabContent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabContent.length; i++) {
    tabContent[i].style.display = "none";
    tabContent[i].classList.remove("active");
  }
  const tabLinks = document.getElementsByClassName("tab-btn");
  for (let i = 0; i < tabLinks.length; i++) {
    tabLinks[i].className = tabLinks[i].className.replace(" active", "");
  }
  document.getElementById(tabName).style.display = "block";
  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.className += " active";
}

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const suggestionsEl = document.getElementById('suggestions');

  // ZIP Form Handler
  const zipForm = document.getElementById('uploadForm');
  const zipSubmitBtn = document.getElementById('submitBtn');

  if (zipForm) {
    zipForm.addEventListener('submit', (event) => {
      event.preventDefault();
      resetUI();
      zipSubmitBtn.disabled = true;
      statusEl.textContent = 'Procesando ZIP...';
      statusEl.style.display = 'block';

      const fileInput = document.getElementById('zipFile');
      if (!fileInput.files || !fileInput.files.length) {
        showError('Selecciona un archivo ZIP antes de continuar.');
        zipSubmitBtn.disabled = false;
        return;
      }
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('zipFile', file);
      formData.append('domain', document.getElementById('domain').value.trim());
      formData.append('strategy', document.getElementById('strategy').value);
      formData.append('build', document.getElementById('build').checked ? 'on' : 'off');

      fetch('/convert', {
        method: 'POST',
        body: formData,
      })
        .then((response) => {
          if (!response.ok) throw new Error('El servidor respondió con un error.');
          return response.blob();
        })
        .then((blob) => {
          const originalName = file.name.replace(/\.zip$/i, '');
          const isBuilt = document.getElementById('build').checked;
          const suffix = isBuilt ? '-dist.zip' : '-seo-ssg.zip';
          const downloadName = `${originalName}${suffix}`;

          downloadBlob(blob, downloadName);
          showSuccess('¡Optimización completada! La descarga debería comenzar automáticamente.');
        })
        .catch((error) => showError(error.message))
        .finally(() => { zipSubmitBtn.disabled = false; });
    });
  }

  // Local Folder Form Handler
  const localForm = document.getElementById('localForm');
  const localSubmitBtn = document.getElementById('submitLocalBtn');

  if (localForm) {
    localForm.addEventListener('submit', (event) => {
      event.preventDefault();
      resetUI();
      localSubmitBtn.disabled = true;
      statusEl.textContent = 'Optimizando carpeta local...';
      statusEl.style.display = 'block';

      const payload = {
        projectPath: document.getElementById('projectPath').value.trim(),
        domain: document.getElementById('domainLocal').value.trim(),
        strategy: document.getElementById('strategyLocal').value,
        build: document.getElementById('buildLocal').checked
      };

      if (!payload.projectPath) {
        showError('La ruta del proyecto es obligatoria.');
        localSubmitBtn.disabled = false;
        return;
      }

      fetch('/optimize-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          showSuccess(data.message);
          if (data.built) {
            statusEl.textContent += ' (Build completado en /dist)';
          }
        })
        .catch(err => showError(err.message))
        .finally(() => { localSubmitBtn.disabled = false; });
    });
  }

  function resetUI() {
    errorEl.style.display = 'none';
    suggestionsEl.style.display = 'none';
    statusEl.style.color = '#333';
    statusEl.style.display = 'none';
  }

  function showError(msg) {
    statusEl.style.display = 'none';
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function showSuccess(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    suggestionsEl.style.display = 'block';
  }

  function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
});